import { BaseIndicator } from './BaseIndicator.js';
const LightweightCharts = window.LightweightCharts;

export class VolumeIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('volume', params, chartManager);
        this.color = params.color || '#26a69a';
        this.scale = 'right';  // для панели объёма можно использовать обычную правую шкалу
    }

    createSeries(chart, paneIndex = 0) {   // ← по умолчанию панель 1
        const series = chart.addSeries(LightweightCharts.HistogramSeries, { 
            color: this.color,  
            priceFormat: { type: 'volume' },
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex);   // ← передаём индекс панели
        this.series = [series];
        return series;
    }

    computeFull(data) {
        return data.map(d => ({ 
            time: d.time, 
            value: d.volume, 
            color: d.close >= d.open ? '#26fc057a' : '#f3281968' 
        }));
    }

    updateLast(candle, allData) {
        this.series[0].update({ 
            time: candle.time, 
            value: candle.volume, 
            color: candle.close >= candle.open ? '#26a69a' : '#f44336' 
        });
    }
}