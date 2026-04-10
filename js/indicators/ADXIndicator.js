// indicators/ADXIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
const LightweightCharts = window.LightweightCharts;

export class ADXIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('adx', params, chartManager);
        this.period = params.period || 14;
        this.color = params.color || '#00E5FF';
        this.lineWidth = params.lineWidth || 2;
        this.scale = params.scale || 'adx';
        this.level1Value = params.level1Value ?? 20;
        this.level2Value = params.level2Value ?? 25;
        this.level3Value = params.level3Value ?? 40;
        this.level1Color = params.level1Color || '#888888';
        this.level2Color = params.level2Color || '#ffaa00';
        this.level3Color = params.level3Color || '#f6465d';
        
        this.level1Line = null;
        this.level2Line = null;
        this.level3Line = null;
    }

    createSeries(chart, paneIndex = 0) {
        this.series = [chart.addSeries(LightweightCharts.LineSeries, {
            color: this.color,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex)];
        
        this.level1Line = this.series[0].createPriceLine({
            price: this.level1Value,
            color: this.level1Color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'ADX 20'
        });
        this.level2Line = this.series[0].createPriceLine({
            price: this.level2Value,
            color: this.level2Color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'ADX 25'
        });
        this.level3Line = this.series[0].createPriceLine({
            price: this.level3Value,
            color: this.level3Color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'ADX 40'
        });
    }
    computeFull(data) {
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const adx = Utils.calculateADX(highs, lows, closes, this.period);
        const offset = data.length - adx.length;
        const adxData = adx.map((v, i) => ({ time: times[offset + i], value: v }));
        this.series[0].setData(adxData);
        return adxData;
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        // Берём последние 2*period свечей для пересчёта (достаточно для актуального ADX)
        const needed = Math.min(allData.length, this.period * 2);
        const recent = allData.slice(-needed);
        const highs = recent.map(d => d.high);
        const lows = recent.map(d => d.low);
        const closes = recent.map(d => d.close);
        const adx = Utils.calculateADX(highs, lows, closes, this.period);
        if (adx.length) {
            const lastADX = adx[adx.length-1];
            if (!isNaN(lastADX) && this.series[0]) {
                this.series[0].update({ time: candle.time, value: lastADX });
            }
        }
    }

    remove() {
        if (this.visibleRangeHandler && this.chartManager?.chart) {
            this.chartManager.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.visibleRangeHandler);
        }
        super.remove();
    }
}