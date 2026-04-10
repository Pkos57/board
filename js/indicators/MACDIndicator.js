import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
const LightweightCharts = window.LightweightCharts;

export class MACDIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('macd', params, chartManager);
        this.fast = params.fast || 12;
        this.slow = params.slow || 26;
        this.signal = params.signal || 9;
        this.macdColor = params.macdColor || '#FFB6C1';
        this.signalColor = params.signalColor || '#87CEEB';
        this.histogramUpColor = params.histogramUpColor || '#26a69a';
        this.histogramDownColor = params.histogramDownColor || '#f44336';
        this.lineWidth = params.lineWidth || 1;
        this.scale = params.scale || 'right';
    }

    createSeries(chart, paneIndex = 0) {
        // Все три серии используют ОДИН И ТОТ ЖЕ paneIndex
        const macdSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: this.macdColor,
            lineWidth: this.lineWidth,
            lastValueVisible: false,
            priceLineVisible: false,
            priceScaleId: this.scale,
        }, paneIndex);   // <- paneIndex

        const signalSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: this.signalColor,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
        }, paneIndex);   // <- тот же paneIndex

        const histogramSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            color: this.histogramUpColor,
            priceScaleId: this.scale,
        }, paneIndex);   // <- тот же paneIndex

        this.series = [macdSeries, signalSeries, histogramSeries];
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const { macdLine, signalLine, histogram } = Utils.calculateMACD(closes, this.fast, this.slow, this.signal);
        const offset = closes.length - macdLine.length;
        const macdData = macdLine.map((v, i) => ({ time: times[offset + i], value: v }));
        const signalData = signalLine.map((v, i) => ({ time: times[offset + i], value: v }));
        const histData = histogram.map((v, i) => ({
            time: times[offset + i],
            value: Math.abs(v),
            color: v >= 0 ? this.histogramUpColor : this.histogramDownColor,
        }));
        return [macdData, signalData, histData];
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        const lastN = 100;
        const recentData = allData.slice(-lastN);
        const fullData = this.computeFull(recentData);
        if (fullData[0] && fullData[0].length) {
            const lastMacd = fullData[0][fullData[0].length - 1];
            const lastSignal = fullData[1][fullData[1].length - 1];
            const lastHist = fullData[2][fullData[2].length - 1];
        
        // Проверяем каждое значение перед обновлением
            if (lastMacd && lastMacd.value !== undefined && !isNaN(lastMacd.value) && this.series[0]) {
                this.series[0].update(lastMacd);
        }
            if (lastSignal && lastSignal.value !== undefined && !isNaN(lastSignal.value) && this.series[1]) {
                this.series[1].update(lastSignal);
        }
            if (lastHist && lastHist.value !== undefined && !isNaN(lastHist.value) && this.series[2]) {
                this.series[2].update(lastHist);
            }
        }
    }
}
