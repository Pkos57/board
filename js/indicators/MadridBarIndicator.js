// indicators/MadridBarIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
import { CONFIG } from '../config.js';

export class MadridBarIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('madridBar', params, chartManager);
        this.allPeriods = CONFIG.madridPeriods; // [5,10,...,100]
        this.useExp = params.useExp !== undefined ? params.useExp : CONFIG.madridDefaultExp;
        this.maxLines = 10; // можно сделать настраиваемым
        this.displayPeriods = this.allPeriods.slice(-this.maxLines);
        // Хранилище предыдущих значений для расчёта изменения
        this.prevMAs = {};
    }

   createSeries(chart) {
    const seriesArray = [];
    const totalHeight = 0.10;          // высота области для всех полос (относительно всего графика)
    const startY = 0.90;                // верхняя граница области (отступ сверху)
    const N = this.displayPeriods.length;
    const barHeight = totalHeight / N;

    this.displayPeriods.forEach((period, idx) => {
        // Верхняя граница текущей полосы (отступ сверху)
        const top = startY + idx * barHeight;
        // Нижняя граница текущей полосы (отступ снизу)
        const bottom = 1 - (startY + (idx + 1) * barHeight);

        const priceScaleId = `madrid_bar_${period}`;

        // Сначала создаём невидимую серию, чтобы инициализировать шкалу
        chart.addHistogramSeries({
            color: 'transparent',
            priceScaleId: priceScaleId,
            visible: false,
            priceFormat: { type: 'volume' }
        });

        // Настраиваем параметры шкалы
        chart.priceScale(priceScaleId).applyOptions({
            scaleMargins: { top, bottom },
            borderVisible: false,
            autoScale: false,
            entireTextOnly: true,
            minValue: 0,
            maxValue: 1
        });

        // Создаём видимую серию-гистограмму для текущей MA
        const series = chart.addHistogramSeries({
            color: '#808080',
            priceScaleId: priceScaleId,
            priceFormat: { type: 'volume' },
            priceLineVisible: false
            
        });
        seriesArray.push(series);
    });

    this.series = seriesArray;
    return seriesArray;
}

    _computeAllMas(closes) {
        const mas = {};
        this.allPeriods.forEach(period => {
            mas[period] = this.useExp
                ? Utils.calculateEMA(closes, period)
                : Utils.calculateSMA(closes, period);
        });
        return mas;
    }

    computeFull(data) {
        const times = data.map(d => d.time);
        const closes = data.map(d => d.close);
        const mas = this._computeAllMas(closes);
        const result = this.displayPeriods.map(() => []);

        // Для хранения предыдущих значений изменений (не нужны, если не сглаживаем)
        // Просто используем прямое изменение

        for (let i = 0; i < closes.length; i++) {
            const ma5 = mas[5][i];
            const ma100 = mas[100][i];
            if (ma5 === undefined || ma100 === undefined || isNaN(ma5) || isNaN(ma100)) {
                continue;
            }

            this.displayPeriods.forEach((period, idx) => {
                const ma = mas[period][i];
                if (ma === undefined || isNaN(ma)) return;

                // Изменение относительно предыдущего бара
                const prevMA = i > 0 ? mas[period][i - 1] : ma;
                const change = ma - prevMA;

                let color;
                // Оригинальная логика: положение MA5 относительно MA100 и знак изменения текущей MA
                if (change >= 0 && ma5 > ma100) color = '#00FF00';       // lime
                else if (change < 0 && ma5 > ma100) color = '#800000';   // maroon
                else if (change <= 0 && ma5 < ma100) color = '#FF0000';  // red
                else if (change >= 0 && ma5 < ma100) color = '#008000';  // green
                else color = '#808080';                                   // gray

                result[idx].push({ time: times[i], value: 1, color });
            });

            // Сохраняем последние значения для будущих обновлений
            this.displayPeriods.forEach(period => {
                this.prevMAs[period] = mas[period][i];
            });
        }

        this.lastIndex = closes.length - 1;
        this.lastMas = mas;
        return result;
    }

    updateLast(candle, allData) {
        const closes = allData.map(d => d.close);
        const lastTime = candle.time;
        const currentIndex = closes.length - 1;

        const mas = this._computeAllMas(closes);
        const ma5 = mas[5][currentIndex];
        const ma100 = mas[100][currentIndex];
        if (ma5 === undefined || ma100 === undefined || isNaN(ma5) || isNaN(ma100)) return;

        this.displayPeriods.forEach((period, idx) => {
            const ma = mas[period][currentIndex];
            if (ma === undefined || isNaN(ma)) return;

            const prevMA = currentIndex > 0 ? mas[period][currentIndex - 1] : (this.prevMAs[period] !== undefined ? this.prevMAs[period] : ma);
            const change = ma - prevMA;

            let color;
            if (change >= 0 && ma5 > ma100) color = '#00FF00';
            else if (change < 0 && ma5 > ma100) color = '#800000';
            else if (change <= 0 && ma5 < ma100) color = '#FF0000';
            else if (change >= 0 && ma5 < ma100) color = '#008000';
            else color = '#808080';

            if (this.series[idx]) {
                this.series[idx].update({ time: lastTime, value: 1, color });
            }

            this.prevMAs[period] = ma;
        });
    }
}