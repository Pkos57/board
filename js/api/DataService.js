// api/DataService.js
import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';
import { KlineDatabase } from '../db/KlineDatabase.js';

export class DataService {
    constructor(alertContainer) {
        this.alertContainer = alertContainer;
        this.klinesCache = new Map(); // краткосрочный кэш в памяти
        this.statsCache = { data: null, timestamp: 0 };
        this.db = new KlineDatabase();
        this.db.open().catch(console.error);
    }

    /**
     * Загружает последние свечи для отображения (обычно 1000)
     * @param {string} symbol 
     * @param {string} interval 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async fetchKlines(symbol, interval, limit = CONFIG.klineLimit) {
        const key = `${symbol}_${interval}_${limit}`;
        const now = Date.now();

        // Проверяем быстрый кэш в памяти
        if (this.klinesCache.has(key)) {
            const cached = this.klinesCache.get(key);
            if (now - cached.timestamp < CONFIG.cacheMaxAge) {
                return cached.data;
            }
        }

        // Пытаемся получить из IndexedDB последние limit свечей
        let klines = await this.db.getKlines(symbol, interval);
        if (klines && klines.length >= limit) {
            // Возвращаем последние limit
            const result = klines.slice(-limit);
            this.klinesCache.set(key, { data: result, timestamp: now });
            return result;
        }

        // Если в БД недостаточно данных, грузим с API и сохраняем
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();
            if (!raw || raw.length === 0) {
                Utils.showAlert(`Нет данных для ${symbol}`, this.alertContainer, true);
                return [];
            }
            const data = raw.map(item => ({
                time: Math.floor(item[0] / 1000),
                open: parseFloat(item[1]),
                high: parseFloat(item[2]),
                low: parseFloat(item[3]),
                close: parseFloat(item[4]),
                volume: parseFloat(item[5])
            }));

            // Сохраняем в БД (объединяем с существующими)
            await this.db.saveKlines(symbol, interval, data);

            this.klinesCache.set(key, { data, timestamp: now });
            return data;
        } catch (e) {
            Utils.showAlert(`Ошибка загрузки ${symbol}`, this.alertContainer, true);
            return [];
        }
    }

    /**
     * Загружает свечи в диапазоне времени [startTime, endTime] (в секундах)
     * @param {string} symbol 
     * @param {string} interval 
     * @param {number} startTime 
     * @param {number} endTime 
     * @returns {Promise<Array>}
     */
    async fetchKlinesRange(symbol, interval, startTime, endTime) {
        // Сначала проверяем, что уже есть в БД
        const fromDb = await this.db.getKlinesRange(symbol, interval, startTime, endTime);
        if (fromDb.length > 0) {
            // Проверяем, покрывает ли БД весь запрошенный диапазон
            const first = fromDb[0].time;
            const last = fromDb[fromDb.length - 1].time;
            if (first <= startTime && last >= endTime) {
                return fromDb; // полностью покрыто
            }
        }

        // Иначе загружаем недостающие части с API
        // API Binance принимает startTime и endTime в миллисекундах
        const msStart = startTime * 1000;
        const msEnd = endTime * 1000;
        const limit = 1000; // за раз можно получить до 1000

        let allNew = [];
        let currentStart = msStart;
        let hasMore = true;
        let maxIterations = 50; // защита от бесконечного цикла
        let iteration = 0;

        while (hasMore && iteration < maxIterations) {
            iteration++;
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${msEnd}&limit=${limit}`;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const raw = await res.json();
                if (raw.length === 0) break;

                const data = raw.map(item => ({
                    time: Math.floor(item[0] / 1000),
                    open: parseFloat(item[1]),
                    high: parseFloat(item[2]),
                    low: parseFloat(item[3]),
                    close: parseFloat(item[4]),
                    volume: parseFloat(item[5])
                }));

                allNew = allNew.concat(data);
                if (raw.length < limit) {
                    hasMore = false;
                } else {
                    // следующий startTime = время последней свечи + 1 мс
                    currentStart = raw[raw.length - 1][0] + 1;
                }
            } catch (e) {
                Utils.showAlert(`Ошибка загрузки истории ${symbol}`, this.alertContainer, true);
                break;
            }
        }

        if (allNew.length > 0) {
            // Сохраняем в БД
            await this.db.saveKlines(symbol, interval, allNew);
        }

        // Теперь объединяем с тем, что уже было в БД, и возвращаем весь диапазон
        const merged = await this.db.getKlinesRange(symbol, interval, startTime, endTime);
        return merged;
    }

    /**
     * Загружает статистику по всем монетам (24hr ticker)
     * @param {boolean} forceRefresh 
     * @returns {Promise<Array>}
     */
    async fetchAllCoinStats(forceRefresh = false) {
        const now = Date.now();
        const cacheTTL = 5 * 60 * 1000; // 5 минут

        if (!forceRefresh && this.statsCache.data && now - this.statsCache.timestamp < cacheTTL) {
            return this.statsCache.data;
        }

        const isValidFuturesSymbol = (symbol) => {
            const validSuffixes = ['USDT', 'BUSD', 'USDC'];
            const invalidSubstrings = ['DOWN', 'UP', 'BULL', 'BEAR', 'HEDGE'];
            return validSuffixes.some(suffix => symbol.endsWith(suffix)) &&
                   !invalidSubstrings.some(sub => symbol.includes(sub));
        };

        for (let i = 0; i < 3; i++) {
            try {
                const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                let stats = data.map(item => ({
                    symbol: item.symbol,
                    volume: parseFloat(item.volume),
                    quoteVolume: parseFloat(item.quoteVolume),
                    lastPrice: parseFloat(item.lastPrice),
                    priceChangePercent: parseFloat(item.priceChangePercent),
                    highPrice: parseFloat(item.highPrice),
                    lowPrice: parseFloat(item.lowPrice),
                    count: item.count
                }));
                stats = stats.filter(isValidFuturesSymbol).sort((a, b) => b.quoteVolume - a.quoteVolume);
                this.statsCache = { data: stats, timestamp: now };
                return stats;
            } catch (e) {
                console.error(`Попытка ${i+1} неудачна:`, e);
                if (i === 2) {
                    Utils.showAlert('Не удалось загрузить список монет', this.alertContainer, true);
                    return [];
                }
                await new Promise(r => setTimeout(r, 1000 * (i+1)));
            }
        }
        return [];
    }

    /**
     * Валидация свечи
     * @param {Object} c 
     * @returns {boolean}
     */
    validateCandle(c) {
        return c && typeof c.time === 'number' && !isNaN(c.time) && c.time > 0 &&
               typeof c.close === 'number' && !isNaN(c.close) && c.close > 0 &&
               typeof c.high === 'number' && !isNaN(c.high) &&
               typeof c.low === 'number' && !isNaN(c.low) &&
               c.high >= c.low;
    }
}