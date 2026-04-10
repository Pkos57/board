import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
const LightweightCharts = window.LightweightCharts;

export class RSIIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('rsi14', params, chartManager);
        this.chartManager = chartManager;
        this.period = params.period || 14;
        this.overbought = params.overbought ?? 70;
        this.oversold = params.oversold ?? 30;
        this.color = params.color || '#FFA500';
        this.lineWidth = params.lineWidth || 2;
        this.scale = params.scale || 'right';
        this.levelColor = params.levelColor || '#ffaa00';
        
        this.gainsWindow = [];
        this.lossesWindow = [];
        this.avgGain = null;
        this.avgLoss = null;
        this.prevClose = null;
        this.overboughtLine = null;
        this.oversoldLine = null;
    }

    createSeries(chart, paneIndex = 0) {
        // Основная линия RSI
        this.series = [chart.addSeries(LightweightCharts.LineSeries, {
            color: this.color,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex)];
        
        // Добавляем уровни как ценовые линии (легковесно)
        this.overboughtLine = this.series[0].createPriceLine({
            price: this.overbought,
            color: this.levelColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'OB'
        });
        this.oversoldLine = this.series[0].createPriceLine({
            price: this.oversold,
            color: this.levelColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'OS'
        });
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const rsi = Utils.calculateRSI(closes, this.period);
        const offset = closes.length - rsi.length;
        const rsiData = rsi.map((v, i) => ({ time: times[offset + i], value: v }));
        this.series[0].setData(rsiData);
        
        if (closes.length > 1) {
            this.prevClose = closes[closes.length-2];
            const lastClose = closes[closes.length-1];
            const diff = lastClose - this.prevClose;
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            const start = Math.max(0, closes.length - this.period - 1);
            this.gainsWindow = [];
            this.lossesWindow = [];
            for (let i = start+1; i < closes.length; i++) {
                const d = closes[i] - closes[i-1];
                this.gainsWindow.push(d > 0 ? d : 0);
                this.lossesWindow.push(d < 0 ? -d : 0);
            }
            if (this.gainsWindow.length >= this.period) {
                this.avgGain = this.gainsWindow.slice(-this.period).reduce((a,b)=>a+b,0)/this.period;
                this.avgLoss = this.lossesWindow.slice(-this.period).reduce((a,b)=>a+b,0)/this.period;
            }
        }
        return rsiData;
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        const close = candle.close;
        if (this.prevClose === null) {
            this.prevClose = allData[allData.length-2]?.close;
            if (!this.prevClose) return;
        }
        const diff = close - this.prevClose;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        
        this.gainsWindow.push(gain);
        this.lossesWindow.push(loss);
        if (this.gainsWindow.length > this.period) {
            this.gainsWindow.shift();
            this.lossesWindow.shift();
        }
        
        if (this.gainsWindow.length === this.period) {
            if (this.avgGain === null || this.avgLoss === null) {
                this.avgGain = this.gainsWindow.reduce((a,b)=>a+b,0)/this.period;
                this.avgLoss = this.lossesWindow.reduce((a,b)=>a+b,0)/this.period;
            } else {
                this.avgGain = (this.avgGain * (this.period-1) + gain) / this.period;
                this.avgLoss = (this.avgLoss * (this.period-1) + loss) / this.period;
            }
            const rs = this.avgLoss === 0 ? 100 : this.avgGain / this.avgLoss;
            const rsi = 100 - 100 / (1 + rs);
            if (!isNaN(rsi) && this.series[0]) {
                this.series[0].update({ time: candle.time, value: rsi });
            }
        }
        this.prevClose = close;
    }

    // При изменении параметров (если нужно)
    updateParams(params) {
        if (params.overbought !== undefined) {
            this.overbought = params.overbought;
            if (this.overboughtLine) this.overboughtLine.applyOptions({ price: this.overbought });
        }
        if (params.oversold !== undefined) {
            this.oversold = params.oversold;
            if (this.oversoldLine) this.oversoldLine.applyOptions({ price: this.oversold });
        }
    }
}