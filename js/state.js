// state.js
import { CONFIG } from './config.js';

export class AppState {
    constructor() {
        this.currentSymbol = this.loadFromStorage('symbol', CONFIG.defaultSymbol);
        this.currentInterval = this.loadFromStorage('interval', CONFIG.defaultInterval);
        this.chartData = [];
        this.allCoinStats = [];
        this.activeIndicators = this.loadFromStorage('globalIndicators', []);
        this.drawingsMap = this.loadFromStorage('drawingsMap', {});
        this.allDrawings = [];
        this.drawingMode = null;
        this.drawingStartPoint = null;
        this.previewLine = null;
        this.drawingColor = '#ffaa00';
        this.currentFilter = 'volume';
        this.contextLine = null;
        this.lastDrawing = null;
        this.soundEnabled = true;
        this.currentChartType = this.loadFromStorage('chartType', CONFIG.defaultChartType);
        this.favorites = this.loadFromStorage('favorites', []);
        this.signals = this.loadFromStorage('signals', []);
        this.workspaces = this.loadFromStorage('workspaces', {});
        this.notifySignals = this.loadFromStorage('notifySignals', true);
    }

    loadFromStorage(key, defaultValue) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    saveToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    }

    // Работа с избранным
    addFavorite(symbol) {
        if (!this.favorites.includes(symbol)) {
            this.favorites.push(symbol);
            this.saveToStorage('favorites', this.favorites);
        }
    }

    removeFavorite(symbol) {
        const index = this.favorites.indexOf(symbol);
        if (index !== -1) {
            this.favorites.splice(index, 1);
            this.saveToStorage('favorites', this.favorites);
        }
    }

    toggleFavorite(symbol) {
        if (this.favorites.includes(symbol)) {
            this.removeFavorite(symbol);
        } else {
            this.addFavorite(symbol);
        }
    }

    isFavorite(symbol) {
        return this.favorites.includes(symbol);
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        this.saveToStorage('soundEnabled', enabled);
    }

    setCoinStats(stats) {
        this.allCoinStats = stats;
    }

    setChartType(type) {
        this.currentChartType = type;
        this.saveToStorage('chartType', type);
    }

    setSymbol(symbol) {
        this.currentSymbol = symbol;
        this.saveToStorage('symbol', symbol);
    }

    setInterval(interval) {
        this.currentInterval = interval;
        this.saveToStorage('interval', interval);
    }
setNotifySignals(enabled) {
    this.notifySignals = enabled;
    this.saveToStorage('notifySignals', enabled);
}
    // Рисования
    getDrawingKey() {
        return `${this.currentSymbol}_${this.currentInterval}`;
    }

    saveDrawingsForCurrent() {
        const key = this.getDrawingKey();
        this.drawingsMap[key] = this.allDrawings.map(d => ({
            type: d.type,
            p1: d.p1 ? { time: d.p1.time, price: d.p1.price } : null,
            p2: d.p2 ? { time: d.p2.time, price: d.p2.price } : null,
            price: d.price,
            time: d.time,
            color: d.color
        }));
        this.saveToStorage('drawingsMap', this.drawingsMap);
    }

    loadDrawingsForCurrent() {
        const key = this.getDrawingKey();
        const loaded = this.drawingsMap[key] || [];
        return loaded;
    }

    // Глобальные индикаторы
    setGlobalIndicators(indicators) {
        this.activeIndicators = indicators;
        this.saveToStorage('globalIndicators', indicators);
    }

    addGlobalIndicator(indicator) {
        this.activeIndicators.push(indicator);
        this.saveToStorage('globalIndicators', this.activeIndicators);
    }

    removeGlobalIndicator(type) {
        const index = this.activeIndicators.findIndex(i => i.type === type);
        if (index !== -1) {
            this.activeIndicators.splice(index, 1);
            this.saveToStorage('globalIndicators', this.activeIndicators);
        }
    }

    // Сигналы
     addSignal(signal) {
        this.signals.unshift(signal);
        if (this.signals.length > 50) this.signals.pop();
        this.saveToStorage('signals', this.signals);
    }

    removeSignal(id) {
        const index = this.signals.findIndex(s => s.id === id);
        if (index !== -1) {
            this.signals.splice(index, 1);
            this.saveToStorage('signals', this.signals);
        }
    }

    clearSignals() {
        this.signals = [];
        this.saveToStorage('signals', this.signals);
    }


    // Шаблоны
    saveWorkspace(name) {
        const workspace = {
            chartType: this.currentChartType,
            indicators: this.activeIndicators,
            drawings: this.allDrawings
        };
        this.workspaces[name] = workspace;
        this.saveToStorage('workspaces', this.workspaces);
        return true;
    }

    loadWorkspace(name) {
        const ws = this.workspaces[name];
        if (!ws) return null;
        return ws;
    }

    getWorkspaceNames() {
        return Object.keys(this.workspaces);
    }
}