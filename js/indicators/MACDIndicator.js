import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class MACDIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('macd', params, chartManager);
        this.fast = params.fast || 12;
        this.slow = params.slow || 26;
        this.signal = params.signal || 9;
        this.colors = params.colors || ['#FFB6C1', '#87CEEB'];
        this.scaleId = params.scale || 'macd';
    }

    createSeries(chart) {
    const macdSeries = chart.addLineSeries({ 
        color: this.colors[0], 
        lineWidth: 2, 
        priceScaleId: this.scaleId,
        lastValueVisible: false,
        priceLineVisible: false
    });
    const signalSeries = chart.addLineSeries({ 
        color: this.colors[1], 
        lineWidth: 2, 
        priceScaleId: this.scaleId,
        lastValueVisible: false,
        priceLineVisible: false
    });
    // гистограмма не требует
    const histogramSeries = chart.addHistogramSeries({ color: '#aaa', priceScaleId: this.scaleId });
    this.series = [macdSeries, signalSeries, histogramSeries];
    return this.series;
}

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const { macdLine, signalLine, histogram } = Utils.calculateMACD(closes, this.fast, this.slow, this.signal);
        const offset = closes.length - macdLine.length;
        const macdData = macdLine.map((v, i) => ({ time: times[offset + i], value: v }));
        const signalData = signalLine.map((v, i) => ({ time: times[offset + i], value: v }));
        const histData = histogram.map((v, i) => ({ time: times[offset + i], value: v, color: v >= 0 ? '#26a69a' : '#f44336' }));
        return [macdData, signalData, histData];
    }

    updateLast(candle, allData) {
        if (allData.length < this.slow) return;
        const closes = allData.map(d => d.close);
        const { macdLine, signalLine, histogram } = Utils.calculateMACD(closes, this.fast, this.slow, this.signal);
        if (macdLine.length) {
            const macdVal = macdLine[macdLine.length - 1];
            const signalVal = signalLine[signalLine.length - 1];
            const histVal = histogram[histogram.length - 1];
            if (this.series[0]) this.series[0].update({ time: candle.time, value: macdVal });
            if (this.series[1]) this.series[1].update({ time: candle.time, value: signalVal });
            if (this.series[2]) this.series[2].update({ time: candle.time, value: histVal, color: histVal >= 0 ? '#26a69a' : '#f44336' });
        }
    }
}