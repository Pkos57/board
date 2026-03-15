// indicators/worker.js
import * as math from './math.js';

self.onmessage = function(e) {
    try {
        const { type, data, params, requestId, symbol, interval } = e.data;
        let result;
        switch (type) {
            case 'madridRibbon':
                result = calculateMadridRibbon(data, params);
                break;
            case 'madridBar':
                result = calculateMadridBar(data, params);
                break;
            case 'macd':
                result = calculateMACD(data, params);
                break;
            case 'stochrsi':
                result = calculateStochRSI(data, params);
                break;
            case 'adx':
                result = calculateADX(data, params);
                break;
            default:
                throw new Error(`Unknown indicator type: ${type}`);
        }
        self.postMessage({ type, result, requestId, symbol, interval });
    } catch (error) {
        self.postMessage({ type: e.data.type, error: error.message, requestId: e.data.requestId, symbol: e.data.symbol, interval: e.data.interval });
    }
};
function calculateMadridRibbon(data, params) {
    const { useExp = true, smoothPeriod = 5 } = params;
    const periods = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,100];
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const values = {};
    periods.forEach(p => {
        values[p] = useExp ? math.calculateEMA(closes, p) : math.calculateSMA(closes, p);
    });
    const ma100 = values[100];
    const prevValues = {};
    const getSmoothedColor = createSmoothedMaColor(smoothPeriod);
    const result = periods.map(p => {
        const maArray = values[p];
        const series = [];
        for (let i = 0; i < maArray.length; i++) {
            if (maArray[i] === null || ma100[i] === null) continue;
            const prev = prevValues[p] !== undefined ? prevValues[p] : maArray[i];
            const color = getSmoothedColor(maArray[i], ma100[i], p, prev);
            prevValues[p] = maArray[i];
            series.push({ time: times[i], value: maArray[i], color });
        }
        return series;
    });
    return result;
}

function calculateMadridBar(data, params) {
    const { useExp = true } = params; // smoothPeriod больше не нужен
    const periods = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,100];
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const values = {};
    periods.forEach(p => {
        values[p] = useExp ? math.calculateEMA(closes, p) : math.calculateSMA(closes, p);
    });
    const ma100 = values[100];
    const result = periods.map(p => {
        const maArray = values[p];
        const series = [];
        for (let i = 0; i < maArray.length; i++) {
            if (maArray[i] === null || ma100[i] === null) continue;
            const prevMA = i > 0 ? maArray[i-1] : maArray[i];
            const change = maArray[i] - prevMA;
            const ma5 = values[5][i]; // MA5 для сравнения
            let color;
            if (change >= 0 && ma5 > ma100[i]) color = '#00FF00';
            else if (change < 0 && ma5 > ma100[i]) color = '#800000';
            else if (change <= 0 && ma5 < ma100[i]) color = '#FF0000';
            else if (change >= 0 && ma5 < ma100[i]) color = '#008000';
            else color = '#808080';
            series.push({ time: times[i], value: 1, color });
        }
        return series;
    });
    return result;
}

function calculateMACD(data, params) {
    const { fast = 12, slow = 26, signal = 9 } = params;
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const { macdLine, signalLine, histogram } = math.calculateMACD(closes, fast, slow, signal);
    const offset = closes.length - macdLine.length;
    const macdData = macdLine.map((v, i) => ({ time: times[offset + i], value: v }));
    const signalData = signalLine.map((v, i) => ({ time: times[offset + i], value: v }));
    const histData = histogram.map((v, i) => ({ time: times[offset + i], value: v, color: v >= 0 ? '#26a69a' : '#f44336' }));
    return [macdData, signalData, histData];
}

function calculateStochRSI(data, params) {
    const { period = 14, k = 3, d = 3 } = params;
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const stoch = math.calculateStochRSI(closes, period, k, d);
    const offsetK = closes.length - stoch.k.length;
    const kData = stoch.k.map((v, i) => ({ time: times[offsetK + i], value: v }));
    const offsetD = closes.length - stoch.d.length;
    const dData = stoch.d.map((v, i) => ({ time: times[offsetD + i], value: v }));
    return [kData, dData];
}

function calculateADX(data, params) {
    const { period = 14 } = params;
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const adx = math.calculateADX(highs, lows, closes, period);
    const offset = data.length - adx.length;
    const adxData = adx.map((v, i) => ({ time: times[offset + i], value: v }));
    return [adxData];
}

function createSmoothedMaColor(smoothPeriod) {
    const emaDiffs = {};
    return function(ma, maRef, period, prevMa) {
        const rawDiff = ma - prevMa;
        if (emaDiffs[period] === undefined) {
            emaDiffs[period] = rawDiff;
        } else {
            const k = 2 / (smoothPeriod + 1);
            emaDiffs[period] = rawDiff * k + emaDiffs[period] * (1 - k);
        }
        const smoothedDiff = emaDiffs[period];
        if (smoothedDiff >= 0 && ma > maRef) return '#00FF00';
        if (smoothedDiff < 0 && ma > maRef) return '#800000';
        if (smoothedDiff <= 0 && ma < maRef) return '#FF0000';
        if (smoothedDiff >= 0 && ma < maRef) return '#008000';
        return '#808080';
    };
}