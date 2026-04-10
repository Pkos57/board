// chart/drawingManager.js
import { Utils } from '../utils.js';

export class DrawingManager {
    constructor(chartManager, state, alertContainer) {
        this.cm = chartManager;
        this.state = state;
        this.alertContainer = alertContainer;
        
        // Состояние
        this.drawings = [];
        this.mode = null;
        this.startPoint = null;
        this.previewEndPoint = null;
        this.contextLine = null;

        // IndexedDB
        this.db = null;
        this.dbName = 'TradingDrawingsDB';
        this.storeName = 'drawings';
        
        this.initDB().then(() => this.restoreDrawings());
    }

    // 🔹 IndexedDB
    // 🔹 1. Инициализация БД — увеличьте версию и проверьте существование store
    async initDB() {
        return new Promise((resolve, reject) => {
        // ✅ Увеличьте версию до 2, чтобы сработал onupgradeneeded
            const req = indexedDB.open(this.dbName, 2);
        
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
            // ✅ Создаём store, только если его ещё нет
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('symbol', 'symbol', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ IndexedDB store "drawings" создан');
            }
        };
        
            req.onsuccess = (e) => { 
                this.db = e.target.result; 
                console.log('✅ IndexedDB подключена');
                resolve(); 
        };
        
            req.onerror = (e) => {
                console.error('❌ IndexedDB error:', e.target.error);
                reject(e.target.error);
        };
    });
}
    async restoreDrawings() {
        if (!this.db) return;
        const tx = this.db.transaction(this.storeName, 'readonly');
        const req = tx.objectStore(this.storeName).getAll(); // ← получаем ВСЕ записи
        req.onsuccess = () => {
            this.drawings = req.result || [];
            console.log(`📦 Загружено ${this.drawings.length} линий из БД`);
            console.log('📊 Символы с линиями:', [...new Set(this.drawings.map(d => d.symbol))]);
            this.cm.redrawOverlay();
            this.refreshSubscriptions(); // обновляем подписку
    };
}

    async saveDrawing(d) {
        d.symbol = this.state.currentSymbol;
        if (!d.id) d.id = `dw_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        
        const idx = this.drawings.findIndex(x => x.id === d.id);
        if (idx !== -1) this.drawings[idx] = d;
        else this.drawings.push(d);

        if (this.db) {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(d);
        }
        
    }

    async _deleteFromDB(id) {
        if (this.db) {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).delete(id);
        }
    }

    // 🔹 Управление
    setDrawingMode(mode) {
        this.mode = mode;
        this.clearPreview();
    }

    clearPreview() {
        this.startPoint = null;
        this.previewEndPoint = null;
        this.cm.redrawOverlay();
    }

    clearAll() {
        this.drawings = [];
        this.clearPreview();
        if (this.db && this.state.currentSymbol) {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const idx = tx.objectStore(this.storeName).index('symbol');
            const cursor = idx.openCursor(IDBKeyRange.only(this.state.currentSymbol));
            cursor.onsuccess = (e) => { const c = e.target.result; if (c) { c.delete(); c.continue(); } };
        }
        this.refreshSubscriptions();
    }

    undo() {
        const last = this.drawings.filter(d => d.symbol === this.state.currentSymbol).pop();
        if (last) {
            this.drawings = this.drawings.filter(d => d.id !== last.id);
            this._deleteFromDB(last.id);
            this.cm.redrawOverlay();
            this.refreshSubscriptions();
        }
    }

    // 🔹 Обработка мыши — ВСЕ режимы, мгновенный отклик
    handleMouseDown(time, price) {
        if (!this.mode || time === null || price === null) return;

        if (this.mode === 'measure') {
            if (!this.startPoint) {
                this.startPoint = { time, price };
                this.cm.redrawOverlay();
            } else {
                const pct = ((price - this.startPoint.price) / this.startPoint.price) * 100;
                Utils.showAlert(`📏 Δ: ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`, this.alertContainer, this.state.soundEnabled);
                this.clearPreview();
            }
            return;
        }

        if (this.mode === 'trend') {
            if (!this.startPoint) {
                this.startPoint = { time, price };
                this.cm.redrawOverlay();
            } else {
                this.saveDrawing({ type: 'trend', p1: this.startPoint, p2: { time, price }, color: this.state.drawingColor });
                this.clearPreview();
            }
            return;
        }

        if (this.mode === 'horizontal') {
            this.saveDrawing({ type: 'horizontal', price, color: this.state.drawingColor });
            this.cm.redrawOverlay();
            return;
        }

        if (this.mode === 'vertical') {
            this.saveDrawing({ type: 'vertical', time, color: this.state.drawingColor });
            this.cm.redrawOverlay();
            return;
        }
    }

    handleMouseMove(time, price) {
        if (this.mode && this.startPoint) {
            this.previewEndPoint = { time, price };
            this.cm.redrawOverlay(true); // skipHeavy=true для скорости
        }
    }

    // 🔹 🎨 РЕНДЕР НА CANVAS — ЕДИНСТВЕННЫЙ СПОСОБ ОТРИСОВКИ
    renderOnCanvas(ctx, skipHeavy = false) {
        if (!ctx || !this.cm.overlayCanvas) return;
        const W = this.cm.overlayCanvas.width;
        const H = this.cm.overlayCanvas.height;

        // Хелперы координат с лимитом 400px за край
        const getX = (t) => {
            let x = this.cm.timeToX(t);
            if (x !== null) return x;
            const range = this.cm.chart.timeScale().getVisibleRange();
            if (!range) return 0;
            const lx = this.cm.timeToX(range.from);
            const rx = this.cm.timeToX(range.to);
            if (lx === null || rx === null) return 0;
            const ratio = (t - range.from) / (range.to - range.from);
            const limitPx = 400;
            if (ratio > 1) return Math.min(rx + (ratio - 1) * (rx - lx), rx + limitPx);
            if (ratio < 0) return Math.max(lx + ratio * (rx - lx), lx - limitPx);
            return 0;
        };

        const getY = (p) => {
            const y = this.cm.priceToY(p);
            return y === null ? 0 : Math.max(0, Math.min(H, y));
        };

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);

        // 1. Сохранённые линии
        this.drawings.forEach(d => {
            if (d.symbol !== this.state.currentSymbol) return;
            ctx.strokeStyle = d.color;
            ctx.beginPath();
            if (d.type === 'trend') {
                ctx.moveTo(getX(d.p1.time), getY(d.p1.price));
                ctx.lineTo(getX(d.p2.time), getY(d.p2.price));
            } else if (d.type === 'horizontal') {
                const y = getY(d.price);
                ctx.moveTo(0, y); ctx.lineTo(W, y);
            } else if (d.type === 'vertical') {
                const x = getX(d.time);
                ctx.moveTo(x, 0); ctx.lineTo(x, H);
            }
            ctx.stroke();
        });

        // 2. Предпросмотр (пунктир) — для ВСЕХ режимов
        if (this.mode && this.startPoint && this.previewEndPoint) {
            ctx.strokeStyle = '#ffffff';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const s = this.startPoint;
            const e = this.previewEndPoint;

            if (this.mode === 'trend' || this.mode === 'measure') {
                ctx.moveTo(getX(s.time), getY(s.price));
                ctx.lineTo(getX(e.time), getY(e.price));
                if (this.mode === 'measure') {
                    const pct = ((e.price - s.price) / s.price) * 100;
                    const mx = (getX(s.time) + getX(e.time)) / 2;
                    const my = (getY(s.price) + getY(e.price)) / 2;
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillStyle = '#ffd700';
                    ctx.fillText(`${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`, mx + 8, my - 8);
                }
            } else if (this.mode === 'horizontal') {
                const y = getY(s.price);
                ctx.moveTo(0, y); ctx.lineTo(W, y);
            } else if (this.mode === 'vertical') {
                const x = getX(e.time);
                ctx.moveTo(x, 0); ctx.lineTo(x, H);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // 🔹 Контекстное меню
    showContextMenu(event) {
        event.preventDefault();
        const rect = this.cm.overlayCanvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        this.contextLine = this._findNear(mx, my, 10);
        
        const menu = document.getElementById('contextMenu');
        if (menu) {
            menu.style.display = this.contextLine ? 'block' : 'none';
            menu.style.left = `${event.pageX}px`;
            menu.style.top = `${event.pageY}px`;
        }
    }

    hideContextMenu() {
        const menu = document.getElementById('contextMenu');
        if (menu) menu.style.display = 'none';
    }

    _findNear(mx, my, thresh) {
        const getX = t => this.cm.timeToX(t) ?? mx;
        const getY = p => this.cm.priceToY(p) ?? my;
        
        for (let i = this.drawings.length - 1; i >= 0; i--) {
            const d = this.drawings[i];
            if (d.symbol !== this.state.currentSymbol) continue;
            if (d.type === 'horizontal' && Math.abs(getY(d.price) - my) <= thresh) return d;
            if (d.type === 'vertical' && Math.abs(getX(d.time) - mx) <= thresh) return d;
            if (d.type === 'trend') {
                const x1=getX(d.p1.time), y1=getY(d.p1.price), x2=getX(d.p2.time), y2=getY(d.p2.price);
                if (this._distToSeg(mx, my, x1, y1, x2, y2) <= thresh) return d;
            }
        }
        return null;
    }

    _distToSeg(px, py, x1, y1, x2, y2) {
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    deleteContextLine() {
        if (this.contextLine) {
            this.drawings = this.drawings.filter(d => d.id !== this.contextLine.id);
            this._deleteFromDB(this.contextLine.id);
            this.contextLine = null;
            this.cm.redrawOverlay();
            this.refreshSubscriptions();
        }
        this.hideContextMenu();
    }

    changeContextLineColor() {
        if (!this.contextLine) { this.hideContextMenu(); return; }
        let picker = document.getElementById('hiddenColorPicker');
        if (!picker) {
            picker = document.createElement('input');
            picker.type = 'color';
            picker.id = 'hiddenColorPicker';
            picker.style.display = 'none';
            document.body.appendChild(picker);
        }
        picker.value = this.contextLine.color;
        picker.onchange = (e) => {
            this.contextLine.color = e.target.value;
            this.saveDrawing(this.contextLine);
            this.cm.redrawOverlay();
            this.contextLine = null;
            this.hideContextMenu();
        };
        picker.click();
    }
    getSymbolsWithLines() {
        const symbols = new Set();
        this.drawings.forEach(d => { if (d.symbol) symbols.add(d.symbol); });
    // Также из drawingsMap (сохранённые линии)
        if (this.state.drawingsMap) {
            Object.keys(this.state.drawingsMap).forEach(key => {
                const symbol = key.split('_')[0];
                if (symbol) symbols.add(symbol);
        });
        console.log('🔍 Найдены символы в this.drawings:', Array.from(symbols));
        return Array.from(symbols);
    }
        return Array.from(symbols);
}
    refreshSubscriptions() {
        if (!this.wsManager) return;
    
        const symbols = this.getSymbolsWithLines();
    
    // Всегда добавляем текущий символ, чтобы график обновлялся
        if (!symbols.includes(this.state.currentSymbol)) {
            symbols.push(this.state.currentSymbol);
    }
    
        if (symbols.length === 0) {
        // Если нет линий, подписываемся только на текущий символ
            this.wsManager.subscribeToSymbols([this.state.currentSymbol], this.state.currentInterval);
        } else {
            this.wsManager.subscribeToSymbols(symbols, this.state.currentInterval);
    }
}
    // 🔹 Алерты
    checkCrossingsForCandle(candle, soundEnabled, alertContainer, skipHistoryAlerts = false) {
        if (skipHistoryAlerts) return;
        const relevant = this.drawings.filter(d => d.symbol === this.state.currentSymbol && !d.alertTriggered);
        relevant.forEach(d => {
            let crossed = false;
            if (d.type === 'horizontal') {
                crossed = candle.high >= d.price && candle.low <= d.price;
            } else if (d.type === 'trend' && d.p1 && d.p2) {
                const t1 = d.p1.time, t2 = d.p2.time;
                if (candle.time >= t1 && candle.time <= t2 && t1 !== t2) {
                    const lineVal = d.p1.price + (d.p2.price - d.p1.price) * (candle.time - t1) / (t2 - t1);
                    crossed = candle.high >= lineVal && candle.low <= lineVal;
                }
            }
            if (crossed) {
                const msg = d.type === 'horizontal' ? `Пересечена горизонталь: ${Utils.formatPrice(d.price)}` : `Пересечена трендовая линия`;
                Utils.showAlert(msg, alertContainer, soundEnabled, this.state.currentSymbol, d.type);
                d.alertTriggered = true;
                this.saveDrawing(d);
            // } else if (d.alertTriggered) {
            //     d.alertTriggered = false;
            }
        });
    }
}