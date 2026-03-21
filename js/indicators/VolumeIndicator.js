import { BaseIndicator } from './BaseIndicator.js';

export class VolumeIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('volume', params, chartManager);
        this.color = params.color || '#26a69a';
        this.scaleId = params.scale || 'volume';
    }

    createSeries(chart) {
        const series = chart.addHistogramSeries({ color: this.color, priceScaleId: this.scaleId });
        this.series = [series];
        return series;
    }

    computeFull(data) {
        return data.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? '#26fc057a' : '#f3281968' }));
    }

    updateLast(candle, allData) {
        this.series[0].update({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? '#26a69a' : '#f44336' });
    }
}