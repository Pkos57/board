// api/dataFetcher.js
import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';

export class DataFetcher {
    // Храним загруженный список валидных символов в статическом свойстве (кэш в памяти)
    static validFuturesSymbols = null;

    /**
     * Загружает список всех торговых пар с Binance Futures (exchangeInfo)
     */
    static async fetchValidFuturesSymbols() {
        // Проверяем, может уже загружали в память
        if (this.validFuturesSymbols) {
            return this.validFuturesSymbols;
        }

        // Пытаемся достать из sessionStorage
        const cached = sessionStorage.getItem('validFuturesSymbols');
        if (cached) {
            try {
                const { symbols, timestamp } = JSON.parse(cached);
                // Кэшируем на 1 час (3600000 мс)
                if (Date.now() - timestamp < 3600000) {
                    this.validFuturesSymbols = symbols;
                    return symbols;
                }
            } catch (e) {}
        }

        try {
            const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // Извлекаем символы только для статуса TRADING (активные)
            const symbols = data.symbols
                .filter(s => s.status === 'TRADING')
                .map(s => s.symbol);

            // Сохраняем в sessionStorage
            sessionStorage.setItem('validFuturesSymbols', JSON.stringify({
                symbols: symbols,
                timestamp: Date.now()
            }));

            this.validFuturesSymbols = symbols;
            console.log(`DataFetcher: загружено ${symbols.length} валидных фьючерсных пар`);
            return symbols;
        } catch (e) {
            console.error('DataFetcher: не удалось загрузить exchangeInfo', e);
            // В случае ошибки возвращаем пустой массив – будет использован fallback-фильтр
            return [];
        }
    }

    /**
     * Фильтрует массив статистики по монетам, оставляя только те, что есть в белом списке фьючерсов.
     * Если белый список не загружен, использует старый фильтр как запасной.
     */
    static async filterValidFuturesStats(stats) {
        const validSymbols = await this.fetchValidFuturesSymbols();
        if (validSymbols.length === 0) {
            // Fallback: старая фильтрация
            console.warn('DataFetcher: используется запасная фильтрация (без белого списка)');
            return stats.filter(item => {
                const symbol = item.symbol;
                const validSuffixes = ['USDT', 'BUSD', 'USDC'];
                const invalidSubstrings = ['DOWN', 'UP', 'BULL', 'BEAR', 'HEDGE'];
                return validSuffixes.some(suffix => symbol.endsWith(suffix)) &&
                       !invalidSubstrings.some(sub => symbol.includes(sub));
            });
        }
        // Фильтруем по белому списку
        return stats.filter(item => validSymbols.includes(item.symbol));
    }

    static async fetchAllCoinStats(forceRefresh = false) {
        const cacheKey = 'allCoinStats';
        const cacheTTL = 5 * 60 * 1000; // 5 минут

        // Работа с кэшем (без изменений)
        if (!forceRefresh) {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const { data, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < cacheTTL) {
                        // Применяем фильтрацию к данным из кэша (на случай, если белый список обновился)
                        // Это гарантирует, что даже старый кэш будет очищен от невалидных символов
                        const filtered = await this.filterValidFuturesStats(data);
                        return filtered;
                    }
                } catch (e) {}
            }
        }

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

                // Применяем улучшенную фильтрацию
                stats = await this.filterValidFuturesStats(stats);
                stats.sort((a, b) => b.quoteVolume - a.quoteVolume);

                // Сохраняем в кэш (уже отфильтрованные данные)
                sessionStorage.setItem(cacheKey, JSON.stringify({ data: stats, timestamp: Date.now() }));
                return stats;
            } catch (e) {
                console.error(`Попытка ${i+1} неудачна:`, e);
                if (i === 2) {
                    Utils.showAlert('Не удалось загрузить список монет', document.getElementById('alertContainer'), true);
                    return [];
                }
                await new Promise(r => setTimeout(r, 1000 * (i+1)));
            }
        }
        return [];
    }

    static async loadKlines(symbol, interval, limit = CONFIG.klineLimit) {
        const cacheKey = `klines_${symbol}_${interval}_${limit}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CONFIG.cacheMaxAge) return data;
            } catch (e) {}
        }

        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();
            if (!raw || raw.length === 0) {
                Utils.showAlert(`Нет данных для ${symbol}`, document.getElementById('alertContainer'), true);
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
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
            return data;
        } catch (e) {
            Utils.showAlert(`Ошибка загрузки ${symbol}`, document.getElementById('alertContainer'), true);
            return [];
        }
    }
}