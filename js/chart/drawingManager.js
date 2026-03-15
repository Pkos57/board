// chart/drawingManager.js
const LightweightCharts = window.LightweightCharts;
import { Utils } from '../utils.js';

export class DrawingManager {
    constructor(chartManager, state, alertContainer) {
        this.chartManager = chartManager;
        this.state = state;
        this.chart = chartManager.chart;
        this.mainSeries = chartManager.mainSeries;
        this.alertContainer = alertContainer;

        this.horizontalLines = []; // отсортированы по цене
        this.trendLines = [];       // отсортированы по времени начала
    }

    _addToSortedCollections(drawing) {
        if (drawing.type === 'horizontal') {
            const idx = this.horizontalLines.findIndex(l => l.price > drawing.price);
            if (idx === -1) this.horizontalLines.push(drawing);
            else this.horizontalLines.splice(idx, 0, drawing);
        } else if (drawing.type === 'trend') {
            const idx = this.trendLines.findIndex(l => l.p1.time > drawing.p1.time);
            if (idx === -1) this.trendLines.push(drawing);
            else this.trendLines.splice(idx, 0, drawing);
        }
    }

    _removeFromSortedCollections(drawing) {
        if (drawing.type === 'horizontal') {
            const idx = this.horizontalLines.indexOf(drawing);
            if (idx !== -1) this.horizontalLines.splice(idx, 1);
        } else if (drawing.type === 'trend') {
            const idx = this.trendLines.indexOf(drawing);
            if (idx !== -1) this.trendLines.splice(idx, 1);
        }
    }

    restoreDrawings() {
        console.log('🔄 restoreDrawings вызван');
        const serialized = this.state.loadDrawingsForCurrent();
        serialized.forEach(d => this.restoreDrawing(d));
    }

    restoreDrawing(d) {
        const chartData = this.state.chartData;
        if (!chartData || chartData.length === 0) {
            console.warn('⛔ Нет данных графика, пропускаем восстановление линии', d);
            return;
        }
if (d.type === 'volumeProfile' && d.profileData) {
    const drawing = this._createVolumeProfileLine(d.profileData, d.color);
    if (drawing) {
        this.state.allDrawings.push(drawing);
        this.state.lastDrawing = drawing;
    }
    return;
}
        if (d.type === 'trend' && d.p1 && d.p2) {
            const series = this.chart.addLineSeries({ color: d.color, lineWidth: 2 });
            series.setData([
                { time: d.p1.time, value: d.p1.price },
                { time: d.p2.time, value: d.p2.price }
            ]);
            const drawing = { series, type: 'trend', p1: d.p1, p2: d.p2, color: d.color, alertTriggered: false };
            this.state.allDrawings.push(drawing);
            this.state.lastDrawing = drawing;
            this._addToSortedCollections(drawing);
        } else if (d.type === 'horizontal' && d.price !== undefined) {
            const firstTime = chartData[0].time;
            const lastTime = chartData[chartData.length - 1].time;
            const series = this.chart.addLineSeries({ color: d.color, lineWidth: 2 });
            series.setData([
                { time: firstTime, value: d.price },
                { time: lastTime, value: d.price }
            ]);
            const drawing = { series, type: 'horizontal', price: d.price, color: d.color, alertTriggered: false };
            this.state.allDrawings.push(drawing);
            this.state.lastDrawing = drawing;
            this._addToSortedCollections(drawing);
        } else if (d.type === 'vertical' && d.time !== undefined) {
            const minPrice = Math.min(...chartData.map(c => c.low));
            const maxPrice = Math.max(...chartData.map(c => c.high));
            const padding = (maxPrice - minPrice) * 0.05;
            const series = this.chart.addLineSeries({ color: d.color, lineWidth: 2 });
            series.setData([
                { time: d.time, value: minPrice - padding },
                { time: d.time, value: maxPrice + padding }
            ]);
            const drawing = { series, type: 'vertical', time: d.time, color: d.color, alertTriggered: false };
            this.state.allDrawings.push(drawing);
            this.state.lastDrawing = drawing;
            // вертикальные линии не индексируем для пересечений
        }
    }

    setDrawingMode(mode) {
        this.state.drawingMode = mode;
        this.clearPreview();
    }
    clearPreview() {
        if (this.state.previewLine) {
            try { this.chart.removeSeries(this.state.previewLine); } catch (e) {}
            this.state.previewLine = null;
        }
        this.state.drawingStartPoint = null;
        this.mouseMovePending = false;
        this.lastMousePos = null;
    }

   removeAllDrawingsFromChart() {
    this.state.allDrawings.forEach(d => {
        if (d.seriesList) {
            d.seriesList.forEach(s => { try { this.chart.removeSeries(s); } catch (e) {} });
        } else if (d.series) {
            try { this.chart.removeSeries(d.series); } catch (e) {}
        }
    });
    this.state.allDrawings = [];
    this.state.lastDrawing = null;
    this.horizontalLines = [];
    this.trendLines = [];
    this.clearPreview();
}
     clearAll() {
        console.log('🧹 clearAll: удаляем линии и сохраняем пустой список');
        this.removeAllDrawingsFromChart();
        this.horizontalLines = [];
        this.trendLines = [];
        this.state.saveDrawingsForCurrent();
    }

    handleMouseDown(time, price) {
        const mode = this.state.drawingMode;
        if (!mode || !time || !price) return;


        // Измерительная линейка
        if (mode === 'measure') {
            if (!this.state.drawingStartPoint) {
                this.state.drawingStartPoint = { time, price };
                this.state.previewLine = this.chart.addLineSeries({
                    color: '#ffd700',
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    lineWidth: 2
                });
            } else {
                const end = { time, price };
                const start = this.state.drawingStartPoint;
                const priceDiff = end.price - start.price;
                const percentDiff = (priceDiff / start.price) * 100;
                const msg = `📏 Измерение: ${Utils.formatPrice(start.price)} → ${Utils.formatPrice(end.price)} | Δ: ${priceDiff > 0 ? '+' : ''}${Utils.formatPrice(priceDiff)} (${percentDiff > 0 ? '+' : ''}${percentDiff.toFixed(2)}%)`;
                Utils.showAlert(msg, this.alertContainer, this.state.soundEnabled, this.state.currentSymbol, 'measure');
                this.clearPreview();
            }
            return;
        }

        // Трендовая линия
         if (mode === 'trend') {
            if (!this.state.drawingStartPoint) {
                this.state.drawingStartPoint = { time, price };
                this.state.previewLine = this.chart.addLineSeries({
                    color: this.state.drawingColor,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    lineWidth: 2
                });
            } else {
                if (this.state.drawingStartPoint.time === time && this.state.drawingStartPoint.price === price) {
                    this.clearPreview();
                    return;
                }
                const end = { time, price };
                const finalSeries = this.chart.addLineSeries({ color: this.state.drawingColor, lineWidth: 2 });
                finalSeries.setData([
                    { time: this.state.drawingStartPoint.time, value: this.state.drawingStartPoint.price },
                    { time: end.time, value: end.price }
                ]);
                const drawing = {
                    series: finalSeries,
                    type: 'trend',
                    p1: this.state.drawingStartPoint,
                    p2: end,
                    color: this.state.drawingColor,
                    alertTriggered: false
                };
                this.state.allDrawings.push(drawing);
                this.state.lastDrawing = drawing;
                this._addToSortedCollections(drawing);
                this.state.saveDrawingsForCurrent();
                this.clearPreview();
            }
            return;
        }

        if (mode === 'horizontal') {
            const chartData = this.state.chartData;
            if (chartData && chartData.length > 0) {
                const firstTime = chartData[0].time;
                const lastTime = chartData[chartData.length - 1].time;
                const finalSeries = this.chart.addLineSeries({ color: this.state.drawingColor, lineWidth: 2 });
                finalSeries.setData([
                    { time: firstTime, value: price },
                    { time: lastTime, value: price }
                ]);
                const drawing = { series: finalSeries, type: 'horizontal', price, color: this.state.drawingColor, alertTriggered: false };
                this.state.allDrawings.push(drawing);
                this.state.lastDrawing = drawing;
                this._addToSortedCollections(drawing);
                this.state.saveDrawingsForCurrent();
            }
            return;
        }
if (mode === 'volumeProfile') {
    if (!this.state.drawingStartPoint) {
        this.state.drawingStartPoint = { time, price };
        // Показываем предварительную линию (пунктирный прямоугольник – опционально, можно просто линию)
        this.state.previewLine = this.chart.addLineSeries({
            color: this.state.drawingColor,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            lineWidth: 2
        });
    } else {
        const start = this.state.drawingStartPoint;
        const end = { time, price };
        if (start.time === end.time && start.price === end.price) {
            this.clearPreview();
            return;
        }

        // Получаем свечи для расчёта профиля
        const data = this.state.chartData;
        const profile = this._calculateVolumeProfile(data, Math.min(start.time, end.time), Math.max(start.time, end.time));
        if (!profile) {
            Utils.showAlert('Недостаточно данных для построения профиля объёма', this.alertContainer, this.state.soundEnabled);
            this.clearPreview();
            return;
        }

        const drawing = this._createVolumeProfileLine(profile, this.state.drawingColor);
        if (drawing) {
            this.state.allDrawings.push(drawing);
            this.state.lastDrawing = drawing;
            this.state.saveDrawingsForCurrent();
        }

        this.clearPreview();
    }
    return;
}
        // Вертикальная линия
        if (mode === 'vertical') {
            const priceRange = this.mainSeries.priceRange();
            if (priceRange) {
                const finalSeries = this.chart.addLineSeries({ color: this.state.drawingColor, lineWidth: 2 });
                finalSeries.setData([
                    { time, value: priceRange.minValue },
                    { time, value: priceRange.maxValue }
                ]);
                const drawing = { series: finalSeries, type: 'vertical', time, color: this.state.drawingColor, alertTriggered: false };
                this.state.allDrawings.push(drawing);
                this.state.lastDrawing = drawing;
                this.state.saveDrawingsForCurrent();
            }
            return;
        }
    }

    handleMouseMove(time, price) {
        if (!this.state.drawingMode) return;
        if ((this.state.drawingMode === 'trend' || this.state.drawingMode === 'measure') && this.state.drawingStartPoint && this.state.previewLine) {
            this.lastMousePos = { time, price };
            if (!this.mouseMovePending) {
                this.mouseMovePending = true;
                requestAnimationFrame(() => this.updatePreview());
            }
        }
    }

    updatePreview() {
        if (this.mouseMovePending && this.lastMousePos && this.state.previewLine && this.state.drawingStartPoint) {
            const { time, price } = this.lastMousePos;
            if (time && price) {
                this.state.previewLine.setData([
                    { time: this.state.drawingStartPoint.time, value: this.state.drawingStartPoint.price },
                    { time, value: price }
                ]);
            }
            this.mouseMovePending = false;
        }
    }

        undo() {
    if (this.state.allDrawings.length) {
        const last = this.state.allDrawings.pop();
        this._removeFromSortedCollections(last);
        if (last.seriesList) {
            last.seriesList.forEach(s => { try { this.chart.removeSeries(s); } catch (e) {} });
        } else if (last.series) {
            try { this.chart.removeSeries(last.series); } catch (e) {}
        }
        if (this.state.lastDrawing === last) {
            this.state.lastDrawing = this.state.allDrawings[this.state.allDrawings.length - 1] || null;
        }
        this.state.saveDrawingsForCurrent();
    }
}
    checkCrossingsForCandle(candle, soundEnabled, alertContainer) {
        if (!this.state.allDrawings.length) return;

        const relevantLines = new Set();

        // Поиск горизонтальных линий
        if (this.horizontalLines.length) {
            let left = 0, right = this.horizontalLines.length;
            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (this.horizontalLines[mid].price < candle.low) left = mid + 1;
                else right = mid;
            }
            const startIdx = left;

            left = 0, right = this.horizontalLines.length;
            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (this.horizontalLines[mid].price <= candle.high) left = mid + 1;
                else right = mid;
            }
            const endIdx = left - 1;

            for (let i = startIdx; i <= endIdx; i++) {
                relevantLines.add(this.horizontalLines[i]);
            }
        }

        // Поиск трендовых линий
        if (this.trendLines.length) {
            const t = candle.time;
            let left = 0, right = this.trendLines.length;
            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (this.trendLines[mid].p1.time > t) right = mid;
                else left = mid + 1;
            }
            const maxStartIdx = left - 1;
            for (let i = 0; i <= maxStartIdx; i++) {
                const line = this.trendLines[i];
                if (line.p2.time >= t) {
                    relevantLines.add(line);
                }
            }
        }

        const processLines = () => {
            relevantLines.forEach(d => {
                const crossed = this.lineCrossedPrice(d, candle);
                if (crossed && !d.alertTriggered) {
                    let msg = '';
                    const coinSymbol = this.state.currentSymbol;
                    if (d.type === 'horizontal') msg = `Цена пересекла горизонтальную линию ${Utils.formatPrice(d.price)}`;
                    else if (d.type === 'trend') msg = `Цена пересекла трендовую линию`;
                    else return;
                    Utils.showAlert(msg, alertContainer, soundEnabled, coinSymbol, d.type);
                    d.alertTriggered = true;
                } else if (!crossed && d.alertTriggered) {
                    d.alertTriggered = false;
                }
            });
        };

        if (window.requestIdleCallback) {
            requestIdleCallback(processLines, { timeout: 100 });
        } else {
            setTimeout(processLines, 0);
        }
    }
    lineCrossedPrice(line, candle) {
        if (line.type === 'horizontal') {
            return candle.high >= line.price && candle.low <= line.price;
        }
        if (line.type === 'trend' && line.p1 && line.p2) {
            const t1 = line.p1.time;
            const t2 = line.p2.time;
            const v1 = line.p1.price;
            const v2 = line.p2.price;
            if (t1 === t2) return false;
            if (candle.time < t1 || candle.time > t2) return false;
            const lineValue = v1 + (v2 - v1) * (candle.time - t1) / (t2 - t1);
            return candle.high >= lineValue && candle.low <= lineValue;
        }
        return false;
    }
_calculateVolumeProfile(data, startTime, endTime, numLevels = 50) {
    // Отбираем свечи в заданном диапазоне
    const candles = data.filter(c => c.time >= startTime && c.time <= endTime);
    if (candles.length === 0) return null;

    // Определяем общий ценовой диапазон
    let minPrice = Math.min(...candles.map(c => c.low));
    let maxPrice = Math.max(...candles.map(c => c.high));
    const priceRange = maxPrice - minPrice;
    if (priceRange === 0) return null; // защита от деления на ноль

    const levelHeight = priceRange / numLevels;
    const volumes = new Array(numLevels).fill(0);

    // Распределяем объём каждой свечи по уровням
    candles.forEach(c => {
        const lowIdx = Math.floor((c.low - minPrice) / levelHeight);
        const highIdx = Math.floor((c.high - minPrice) / levelHeight);
        const levelsCount = highIdx - lowIdx + 1;
        const volumePerLevel = c.volume / levelsCount; // равномерно делим объём на число пересекаемых уровней

        for (let i = lowIdx; i <= highIdx; i++) {
            if (i >= 0 && i < numLevels) {
                volumes[i] += volumePerLevel;
            }
        }
    });

    // Нормализуем объёмы (0..1) для масштабирования длины гистограммы
    const maxVolume = Math.max(...volumes);
    if (maxVolume === 0) return null;

    const levels = [];
    for (let i = 0; i < numLevels; i++) {
        const price = minPrice + (i + 0.5) * levelHeight; // средняя цена уровня
        const normVolume = volumes[i] / maxVolume;
        levels.push({ price, volume: volumes[i], normVolume });
    }

    return {
        levels,
        minPrice,
        maxPrice,
        startTime,
        endTime: Math.max(...candles.map(c => c.time)) // время последней свечи диапазона
    };
}
_createVolumeProfileLine(profileData, baseColor) {
    if (!profileData) return null;
    const { levels, endTime } = profileData;
    const timeScale = 300; // 5 минут в секундах – подберите под интервал

    // Находим индекс уровня с максимальным объёмом (POC)
    let maxVol = 0;
    let pocIndex = 0;
    levels.forEach((level, idx) => {
        if (level.volume > maxVol) {
            maxVol = level.volume;
            pocIndex = idx;
        }
    });

    const seriesList = [];
    levels.forEach((level, idx) => {
        if (level.normVolume <= 0.01) return; // игнорируем мелкие уровни

        // Определяем цвет уровня
        let color;
        if (idx === pocIndex) {
            color = '#ffd700'; // золотой для POC
        } else if (level.price > levels[pocIndex].price) {
            color = '#0ecb81'; // зелёный для уровней выше POC
        } else {
            color = '#f6465d'; // красный для уровней ниже POC
        }

        const startX = endTime;
        const endX = endTime + level.normVolume * timeScale;
        const series = this.chart.addLineSeries({
            color: color,
            lineWidth: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false
        });
        series.setData([
            { time: startX, value: level.price },
            { time: endX, value: level.price }
        ]);
        seriesList.push(series);
    });

    return {
        seriesList,
        series: seriesList[0], // для обратной совместимости (если где-то используется series)
        type: 'volumeProfile',
        profileData,
        color: baseColor // сохраняем базовый цвет, хотя фактически не используем
    };
}
    showContextMenu(event) {
        console.log('🖱️ context menu, lastDrawing =', this.state.lastDrawing);
        event.preventDefault();
        if (!this.state.lastDrawing) return;
        this.state.contextLine = this.state.lastDrawing;
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'block';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
    }

   deleteContextLine() {
    if (this.state.contextLine) {
        const index = this.state.allDrawings.indexOf(this.state.contextLine);
        if (index !== -1) {
            if (this.state.contextLine.seriesList) {
                this.state.contextLine.seriesList.forEach(s => { try { this.chart.removeSeries(s); } catch (e) {} });
            } else if (this.state.contextLine.series) {
                try { this.chart.removeSeries(this.state.contextLine.series); } catch (e) {}
            }
            this.state.allDrawings.splice(index, 1);
            if (this.state.lastDrawing === this.state.contextLine) {
                this.state.lastDrawing = this.state.allDrawings[this.state.allDrawings.length - 1] || null;
            }
            this.state.saveDrawingsForCurrent();
        }
        this.state.contextLine = null;
    }
    this.hideContextMenu();
}

   changeContextLineColor() {
    if (this.state.contextLine) {
        const hiddenPicker = document.getElementById('hiddenColorPicker');
        hiddenPicker.value = this.state.contextLine.color;
        const handleChange = (e) => {
            const newColor = e.target.value;
            this.state.contextLine.color = newColor;
            if (this.state.contextLine.seriesList) {
                this.state.contextLine.seriesList.forEach(s => s.applyOptions({ color: newColor }));
            } else if (this.state.contextLine.series) {
                this.state.contextLine.series.applyOptions({ color: newColor });
            }
            this.state.saveDrawingsForCurrent();
            this.state.contextLine = null;
            hiddenPicker.removeEventListener('change', handleChange);
            this.hideContextMenu();
        };
        hiddenPicker.addEventListener('change', handleChange, { once: true });
        hiddenPicker.click();
    } else {
        this.hideContextMenu();
    }
}
}