// db/KlineDatabase.js
export class KlineDatabase {
    constructor() {
        this.dbName = 'KlineCache';
        this.dbVersion = 3; // увеличиваем версию, чтобы создать новое хранилище
        this.db = null;
        this.initPromise = null;
    }

    async open() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Существующее хранилище свечей
                if (!db.objectStoreNames.contains('klines')) {
                    const store = db.createObjectStore('klines', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('symbol_interval_time', ['symbol', 'interval', 'time'], { unique: true });
                    store.createIndex('symbol_interval', ['symbol', 'interval'], { unique: false });
                    store.createIndex('time', 'time', { unique: false });
                }
                // НОВОЕ: хранилище для индикаторов
                if (!db.objectStoreNames.contains('indicators')) {
                    const indStore = db.createObjectStore('indicators', { keyPath: 'id', autoIncrement: true });
                    // Уникальный индекс: символ + интервал + тип индикатора + параметры (хеш)
                    indStore.createIndex('symbol_interval_type_hash', ['symbol', 'interval', 'type', 'paramsHash'], { unique: true });
                    indStore.createIndex('symbol_interval', ['symbol', 'interval'], { unique: false });
                }
            };
        });
        return this.initPromise;
    }

    async getStore(storeName, mode) {
        await this.open();
        const transaction = this.db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    }

    async saveKlines(symbol, interval, klines) {
        if (!klines || !klines.length) return;
        await this.open();
        const store = await this.getStore('klines', 'readwrite');
        const index = store.index('symbol_interval_time');

        for (const candle of klines) {
            const key = [symbol, interval, candle.time];
        // Проверяем, существует ли уже такая свеча
            const existing = await new Promise((resolve) => {
                const req = index.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
        });
            const data = {
                symbol,
                interval,
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
        };
            if (existing) {
                data.id = existing.id;
                await store.put(data);   // обновляем
            } else {
                await store.add(data);   // добавляем
        }
    }
}

    async getKlines(symbol, interval) {
        await this.open();
        const store = await this.getStore('klines', 'readonly');
        const index = store.index('symbol_interval');
        const range = IDBKeyRange.only([symbol, interval]);
        const result = [];
        return new Promise((resolve, reject) => {
            const request = index.openCursor(range);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    result.push(cursor.value);
                    cursor.continue();
                } else {
                    console.log(`📦 getKlines: ${symbol} ${interval} -> ${result.length} записей`);
                    result.sort((a, b) => a.time - b.time);
                    resolve(result);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getKlinesRange(symbol, interval, startTime, endTime) {
        await this.open();
        const store = await this.getStore('klines', 'readonly');
        const index = store.index('symbol_interval_time');
        const range = IDBKeyRange.bound(
            [symbol, interval, startTime],
            [symbol, interval, endTime],
            true, true
        );
        const result = [];
        return new Promise((resolve, reject) => {
            const request = index.openCursor(range);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    result.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteKlines(symbol, interval) {
        await this.open();
        const store = await this.getStore('klines', 'readwrite');
        const index = store.index('symbol_interval');
        const range = IDBKeyRange.only([symbol, interval]);
        const request = index.openCursor(range);
        return new Promise((resolve, reject) => {
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
            }
        };
            request.onerror = () => reject(request.error);
    });
}
    // ========== НОВЫЕ МЕТОДЫ ДЛЯ ИНДИКАТОРОВ ==========
    
    /**
     * Сохраняет результат работы индикатора в кэш
     * @param {string} symbol 
     * @param {string} interval 
     * @param {string} type - тип индикатора (rsi14, macd, etc.)
     * @param {object} params - параметры индикатора (period, fast, slow и т.д.)
     * @param {any} data - результат computeFull (массив или массив массивов)
     */
    async saveIndicator(symbol, interval, type, params, data) {
        await this.open();
        const store = await this.getStore('indicators', 'readwrite');
        const index = store.index('symbol_interval_type_hash');
        
        // Создаём хеш параметров (чтобы различать, например, RSI 14 и RSI 21)
        const paramsHash = this._hashParams(params);
        
        const key = [symbol, interval, type, paramsHash];
        
        // Проверяем, есть ли уже такая запись
        const existing = await new Promise((resolve) => {
            const req = index.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        
        const record = {
            symbol,
            interval,
            type,
            params,
            paramsHash,
            data: JSON.parse(JSON.stringify(data)), // сериализуем, т.к. могут быть циклические ссылки
            timestamp: Date.now()
        };
        
        if (existing) {
            record.id = existing.id;
            await store.put(record);
        } else {
            await store.add(record);
        }
    }
    
    /**
     * Загружает кэшированный индикатор
     * @returns {Promise<any|null>} данные индикатора или null
     */
    async getIndicator(symbol, interval, type, params) {
        await this.open();
        const store = await this.getStore('indicators', 'readonly');
        const index = store.index('symbol_interval_type_hash');
        const paramsHash = this._hashParams(params);
        const key = [symbol, interval, type, paramsHash];
        
        return new Promise((resolve) => {
            const req = index.get(key);
            req.onsuccess = () => {
                if (req.result) {
                    resolve(req.result.data);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }
    
    /**
     * Удаляет кэш индикатора для символа (например, при смене параметров)
     */
    async deleteIndicator(symbol, interval, type, params) {
        await this.open();
        const store = await this.getStore('indicators', 'readwrite');
        const index = store.index('symbol_interval_type_hash');
        const paramsHash = this._hashParams(params);
        const key = [symbol, interval, type, paramsHash];
        const existing = await new Promise((resolve) => {
            const req = index.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (existing) {
            await store.delete(existing.id);
        }
    }
    
    /**
     * Простой хеш параметров (можно использовать JSON.stringify)
     */
    _hashParams(params) {
        // Сортируем ключи для стабильности
        const sorted = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {});
        return JSON.stringify(sorted);
    }
}