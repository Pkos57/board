// indicators/MadridRibbonIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
import { CONFIG } from '../config.js';
const LightweightCharts = window.LightweightCharts;

export class MadridRibbonIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('madridRibbon', params, chartManager);
        this.periods = CONFIG.madridPeriods;
        this.useExp = params.useExp !== undefined ? params.useExp : CONFIG.madridDefaultExp;
        this.smoothPeriod = params.smoothPeriod || CONFIG.madridDefaultSmooth;
        this.colors = CONFIG.colors.madridRibbon;
        this.prevEMA = {};
        this.prevSMA = {};
        this.smaWindows = {};
    }

    createSeries(chart) {
        this.series = this.periods.map((period, idx) => {
            const lineWidth = (period === 5 || period === 100) ? 3 : 1;
            return chart.addSeries(LightweightCharts.LineSeries, {
                color: this.colors[idx % this.colors.length],
                lineWidth,
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false
            });
        });
        return this.series;
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const calculator = Utils.createMadridRibbonCalculator(this.useExp, this.smoothPeriod);
        const seriesData = this.periods.map(() => []);

        for (let i = this.periods[this.periods.length-1] - 1; i < closes.length; i++) {
            const values = calculator(closes, i);
            if (values) {
                values.forEach((item, idx) => {
                    if (item.value !== undefined && !isNaN(item.value)) {
                        seriesData[idx].push({ time: times[i], value: item.value });
                    }
                });
            }
        }

        this.series.forEach((series, idx) => series.setData(seriesData[idx]));

        if (seriesData[0] && seriesData[0].length) {
            this.periods.forEach((period, idx) => {
                const lastPoint = seriesData[idx][seriesData[idx].length-1];
                if (lastPoint) {
                    if (this.useExp) this.prevEMA[period] = lastPoint.value;
                    else this.prevSMA[period] = lastPoint.value;
                }
            });
        }
        return seriesData;
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        const close = candle.close;
        const time = candle.time;

        this.periods.forEach((period, idx) => {
            let value;
            if (this.useExp) {
                const k = 2 / (period + 1);
                let prev = this.prevEMA[period];
                if (prev === undefined) {
                    const closes = allData.slice(-period).map(d => d.close);
                    const emaArray = Utils.calculateEMA(closes, period);
                    prev = emaArray[emaArray.length-1];
                    if (isNaN(prev)) return;
                    this.prevEMA[period] = prev;
                }
                value = close * k + prev * (1 - k);
                this.prevEMA[period] = value;
            } else {
                if (!this.smaWindows[period]) this.smaWindows[period] = [];
                const window = this.smaWindows[period];
                window.push(close);
                if (window.length > period) window.shift();
                if (window.length === period) {
                    const sum = window.reduce((a,b) => a+b, 0);
                    value = sum / period;
                    this.prevSMA[period] = value;
                } else return;
            }

            if (value !== undefined && !isNaN(value) && this.series[idx]) {
                this.series[idx].update({ time, value });
            }
        });
    }
}