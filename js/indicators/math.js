// indicators/math.js
// indicators/math.js

// ---------- Базовые индикаторы ----------
export function calculateSMA(data, period) {
    if (data.length < period) return data.map(() => null);
    const sma = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j];
        sma[i] = sum / period;
    }
    return sma;
}

export function calculateEMA(data, period) {
    if (data.length < period) return data.map(() => null);
    const k = 2 / (period + 1);
    const ema = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    ema[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) {
        ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
}

export function calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return [];
    const gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    let avgG = 0, avgL = 0;
    for (let i = 0; i < period; i++) {
        avgG += gains[i];
        avgL += losses[i];
    }
    avgG /= period;
    avgL /= period;

    const rsi = [];
    let rs = avgL === 0 ? 100 : avgG / avgL;
    rsi.push(100 - 100 / (1 + rs));

    for (let i = period; i < gains.length; i++) {
        avgG = (avgG * (period - 1) + gains[i]) / period;
        avgL = (avgL * (period - 1) + losses[i]) / period;
        rs = avgL === 0 ? 100 : avgG / avgL;
        rsi.push(100 - 100 / (1 + rs));
    }
    return rsi;
}

export function calculateStochRSI(closes, rsiPeriod = 14, kPeriod = 14, dPeriod = 3) {
    // 1. RSI
    const rsi = calculateRSI(closes, rsiPeriod);
    if (rsi.length < rsiPeriod + kPeriod - 1) return { k: [], d: [] };

    // 2. StochRSI (K сырой)
    const rawK = [];
    for (let i = rsiPeriod - 1; i < rsi.length; i++) {
        const window = rsi.slice(i - rsiPeriod + 1, i + 1);
        const min = Math.min(...window);
        const max = Math.max(...window);
        const kVal = (max === min) ? 50 : (rsi[i] - min) / (max - min) * 100;
        rawK.push(kVal);
    }

    // 3. Сглаживание K (обычно SMA) – это и есть линия %K
    // В TradingView %K = SMA(rawK, kPeriod) или просто rawK? 
    // По умолчанию %K Length = 14, что означает сглаживание rawK периодом 14.
    // Если kPeriod > 1, то %K = SMA(rawK, kPeriod).
    let smoothedK;
    if (kPeriod > 1) {
        smoothedK = calculateSMA(rawK, kPeriod);
        // Обрезаем до длины, где SMA начинает давать значения
        const startIdx = kPeriod - 1;
        smoothedK = smoothedK.slice(startIdx);
    } else {
        smoothedK = rawK;
    }

    // 4. %D = SMA от %K (или от rawK? В TradingView %D = SMA(%K, dPeriod))
    const d = calculateSMA(smoothedK, dPeriod);
    const startIdxD = dPeriod - 1;
    const trimmedD = d.slice(startIdxD);
    const trimmedK = smoothedK.slice(startIdxD);

    return { k: trimmedK, d: trimmedD };
}

export function calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = calculateEMA(closes, fast);
    const emaSlow = calculateEMA(closes, slow);
    const macdLine = emaFast.map((v, i) => (v !== null && emaSlow[i] !== null) ? v - emaSlow[i] : null);

    // Находим первый индекс, где MACD-линия не null
    let firstIndex = macdLine.findIndex(v => v !== null);
    if (firstIndex === -1) {
        return { macdLine: [], signalLine: [], histogram: [] };
    }

    // Берём только числовые значения MACD-линии
    const macdValues = [];
    for (let i = firstIndex; i < macdLine.length; i++) {
        if (macdLine[i] !== null) macdValues.push(macdLine[i]);
    }

    // Вычисляем сигнальную линию (EMA от MACD)
    const signalValues = calculateEMA(macdValues, signal);

    // Восстанавливаем сигнальную линию с правильным выравниванием
    const signalLine = new Array(macdLine.length).fill(null);
    for (let i = 0; i < signalValues.length; i++) {
        signalLine[firstIndex + i] = signalValues[i];
    }

    // Гистограмма = MACD - сигнал
    const histogram = macdLine.map((v, i) => (v !== null && signalLine[i] !== null) ? v - signalLine[i] : null);

    return { macdLine, signalLine, histogram };
}

export function calculateADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return [];
    const tr = [], plusDM = [], minusDM = [];
    for (let i = 1; i < highs.length; i++) {
        const high = highs[i], low = lows[i];
        const prevHigh = highs[i - 1], prevLow = lows[i - 1], prevClose = closes[i - 1];
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        const upMove = high - prevHigh;
        const downMove = prevLow - low;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const atr = [], plus = [], minus = [];
    let sumTR = 0, sumPlus = 0, sumMinus = 0;
    for (let i = 0; i < period; i++) {
        sumTR += tr[i];
        sumPlus += plusDM[i];
        sumMinus += minusDM[i];
    }
    atr.push(sumTR / period);
    plus.push(sumPlus / period);
    minus.push(sumMinus / period);
    for (let i = period; i < tr.length; i++) {
        atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
        plus.push((plus[plus.length - 1] * (period - 1) + plusDM[i]) / period);
        minus.push((minus[minus.length - 1] * (period - 1) + minusDM[i]) / period);
    }
    const dx = [];
    for (let i = 0; i < plus.length; i++) {
        const pdi = (plus[i] / atr[i]) * 100;
        const mdi = (minus[i] / atr[i]) * 100;
        const sum = pdi + mdi;
        if (sum === 0) dx.push(0);
        else dx.push(Math.abs(pdi - mdi) / sum * 100);
    }
    const adx = [];
    for (let i = period - 1; i < dx.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += dx[i - j];
        adx.push(sum / period);
    }
    return adx;
}

export function calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return [];
    const tr = [];
    for (let i = 1; i < highs.length; i++) {
        tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const atr = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += tr[i];
    atr.push(sum / period);
    for (let i = period; i < tr.length; i++) {
        atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
}

// ---------- Madrid Ribbon (специальная функция) ----------
const LIME = '#00FF00';
const MAROON = '#800000';
const RUBI = '#FF0000';
const GREEN = '#008000';
const GRAY = '#808080';

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
        if (smoothedDiff >= 0 && ma > maRef) return LIME;
        if (smoothedDiff < 0 && ma > maRef) return MAROON;
        if (smoothedDiff <= 0 && ma < maRef) return RUBI;
        if (smoothedDiff >= 0 && ma < maRef) return GREEN;
        return GRAY;
    };
}

export function createMadridRibbonCalculator(useExp = true, smoothPeriod = 5) {
    const periods = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100];
    let prevValues = {};
    const getSmoothedColor = createSmoothedMaColor(smoothPeriod);
    return function(data, index) {
        if (index < 99) return null;
        const currentValues = {};
        periods.forEach(p => {
            if (useExp) {
                const emaArray = calculateEMA(data, p);
                currentValues[p] = emaArray[index];
            } else {
                const smaArray = calculateSMA(data, p);
                currentValues[p] = smaArray[index];
            }
        });
        const ma100 = currentValues[100];
        const result = periods.map(p => {
            const ma = currentValues[p];
            const prevMA = prevValues[p] !== undefined ? prevValues[p] : ma;
            const color = getSmoothedColor(ma, ma100, p, prevMA);
            return { period: p, value: ma, color };
        });
        periods.forEach(p => { prevValues[p] = currentValues[p]; });
        return result;
    };
}