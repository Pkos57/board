// api/DataService.js

export class DataService {
    constructor(alertContainer) {
        this.alertContainer = alertContainer;
        this._onFullDataReady = null;
        this._pendingFetches = new Set();
    }

    setOnFullDataReady(callback) {
        this._onFullDataReady = callback;
    }

    // Быстрая загрузка последних limit свечей (всегда с API)
    async fetchInitialFast(symbol, interval, limit = 1000) {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        return raw.map(item => ({
            time: Math.floor(item[0] / 1000),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5])
        }));
    }
    async fetchKlinesRange(symbol, interval, startTimeSec, endTimeSec) {
        const limit = 1000;
        let allData = [];
        let currentStart = startTimeSec * 1000;
        const endMs = endTimeSec * 1000;
    
        while (currentStart < endMs) {
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endMs}&limit=${limit}`;
            try {
                const response = await fetch(url);
                if (!response.ok) break;
                const raw = await response.json();
                if (!raw.length) break;
            
                const candles = raw.map(item => ({
                    time: Math.floor(item[0] / 1000),
                    open: parseFloat(item[1]),
                    high: parseFloat(item[2]),
                    low: parseFloat(item[3]),
                    close: parseFloat(item[4]),
                    volume: parseFloat(item[5])
            }));
                allData = allData.concat(candles);
            
                if (raw.length < limit) break;
                currentStart = raw[raw.length - 1][0] + 1;
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error('fetchKlinesRange error', e);
                break;
        }
    }
    
    // Удаляем дубликаты и сортируем
        const unique = [];
        const seen = new Set();
        for (const c of allData) {
            if (!seen.has(c.time)) {
                seen.add(c.time);
                unique.push(c);
        }
    }
        unique.sort((a, b) => a.time - b.time);
        return unique;
}
    // Фоновая дозагрузка старых свечей до desiredCount
    async startBackgroundFetch(symbol, interval, desiredCount = 5000) {
        const fetchKey = `${symbol}_${interval}`;
        if (this._pendingFetches.has(fetchKey)) return;
        this._pendingFetches.add(fetchKey);

        try {
            // Загружаем последние desiredCount свечей с пагинацией
            const fullData = await this._fetchWithPagination(symbol, interval, desiredCount);
            if (fullData.length && this._onFullDataReady) {
                this._onFullDataReady(symbol, interval, fullData);
            }
        } catch (e) {
            console.error('Background fetch error', e);
        } finally {
            this._pendingFetches.delete(fetchKey);
        }
    }

    // Пагинация для загрузки нужного количества свечей
    async _fetchWithPagination(symbol, interval, desiredCount) {
        const limit = 1000;
        let allData = [];
        const endTime = Date.now();
        const msPerCandle = this.getMsPerCandle(interval);
        const startTime = endTime - (desiredCount * msPerCandle);
        let currentStart = startTime;
        let iterations = 0;
        const maxIterations = Math.ceil(desiredCount / limit) + 2;

        while (iterations < maxIterations && allData.length < desiredCount && currentStart < endTime) {
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const raw = await response.json();
                if (!raw || raw.length === 0) break;

                const candles = raw.map(item => ({
                    time: Math.floor(item[0] / 1000),
                    open: parseFloat(item[1]),
                    high: parseFloat(item[2]),
                    low: parseFloat(item[3]),
                    close: parseFloat(item[4]),
                    volume: parseFloat(item[5])
                }));
                allData = allData.concat(candles);
                if (raw.length < limit) break;
                const lastTime = raw[raw.length - 1][0];
                currentStart = lastTime + 1;
                iterations++;
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error(`Ошибка загрузки пачки для ${symbol}:`, e);
                break;
            }
        }
        // Удаляем дубликаты и сортируем
        const unique = [];
        const seen = new Set();
        for (const c of allData) {
            if (!seen.has(c.time)) {
                seen.add(c.time);
                unique.push(c);
            }
        }
        unique.sort((a, b) => a.time - b.time);
        return unique.slice(-desiredCount);
    }

    getMsPerCandle(interval) {
        const map = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        return map[interval] || 60 * 60 * 1000;
    }
}