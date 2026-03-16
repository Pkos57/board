// indicators/MadridRibbonIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
import { CONFIG } from '../config.js';

export class MadridRibbonIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('madridRibbon', params, chartManager);
        this.periods = CONFIG.madridPeriods;
        this.useExp = params.useExp !== undefined ? params.useExp : CONFIG.madridDefaultExp;
        this.smoothPeriod = params.smoothPeriod || CONFIG.madridDefaultSmooth;
        this.colors = CONFIG.colors.madridRibbon;
        this.prevMAs = {};
    }

    createSeries(chart) {
        this.series = this.periods.map((period, idx) => {
            const lineWidth = (period === 5 || period === 100) ? 3 : 1;
            return chart.addLineSeries({
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

        this.series.forEach((series, idx) => {
            series.setData(seriesData[idx]);
        });

        return seriesData;
    }

    updateLast(candle, allData) {
        const closes = allData.map(d => d.close);
        const lastIndex = closes.length - 1;

        this.periods.forEach((period, idx) => {
            let ma;
            if (this.useExp) {
                const emaArray = Utils.calculateEMA(closes, period);
                ma = emaArray.length ? emaArray[emaArray.length - 1] : null;
            } else {
                const smaArray = Utils.calculateSMA(closes, period);
                ma = smaArray.length ? smaArray[smaArray.length - 1] : null;
            }

            if (ma !== null && !isNaN(ma) && this.series[idx]) {
                this.series[idx].update({ time: candle.time, value: ma });
            }
        });
    }
}