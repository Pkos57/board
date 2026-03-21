// indicators/RSIIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class RSIIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('rsi', params, chartManager);
        this.period = params.period || 14;
        this.color = params.color || '#FFA500';
        this.avgGain = 0;
        this.avgLoss = 0;
        this.prevRsi = null;
        // this.prices = []; // удалено
    }

   createSeries(chart) {
    const series = chart.addLineSeries({ 
        color: this.color, 
        lineWidth: 2, 
        priceScaleId: 'rsi',
        lastValueVisible: true,
        priceLineVisible: true
        
    });
    this.series = [series];
    return series;
}

    computeFull(data) {
        const closes = data.map(d => d.close);
        const rsi = Utils.calculateRSI(closes, this.period);
        const times = data.map(d => d.time);
        const offset = data.length - rsi.length;
        return rsi.map((val, i) => ({ time: times[offset + i], value: val }));
    }

    updateLast(candle, allData) {
        const closes = allData.map(d => d.close);
        if (closes.length < this.period + 1) return null;

        // Если это первый вызов (нет предыдущих значений), инициализируем
        if (this.prevRsi === null) {
            // Используем полный расчёт для первых период+1 свечей
            const rsiFull = Utils.calculateRSI(closes, this.period);
            if (rsiFull.length) {
                this.prevRsi = rsiFull[rsiFull.length - 1];
                // Также можно инициализировать avgGain/avgLoss, но для простоты будем всегда пересчитывать
                // Вместо сложного инкрементального расчёта можно просто использовать полный расчёт каждый раз
                // Но для производительности оставим как есть – полный расчёт
            }
        }

        // Упрощённо: пересчитываем полностью (для надёжности)
        const rsiFull = Utils.calculateRSI(closes, this.period);
        const value = rsiFull.length ? rsiFull[rsiFull.length - 1] : null;
        if (value !== null && !isNaN(value)) {
            this.series[0].update({ time: candle.time, value });
            this.prevRsi = value;
        }
        return value;
    }
}