// db/KlineDatabase.js
export class KlineDatabase {
    constructor(dbName = 'KlineDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('klines')) {
                    const store = db.createObjectStore('klines', { keyPath: 'id' });
                    store.createIndex('symbol_interval', ['symbol', 'interval'], { unique: false });
                }
            };
        });
    }

    async saveKlines(symbol, interval, klines, maxItems = 50000) {
        if (!this.db) await this.open();
        const tx = this.db.transaction('klines', 'readwrite');
        const store = tx.objectStore('klines');
        const id = `${symbol}_${interval}`;
        const existing = await this.getKlines(symbol, interval);
        let allKlines = existing ? [...existing] : [];
        const timeMap = new Map(allKlines.map(k => [k.time, k]));
        klines.forEach(k => timeMap.set(k.time, k));
        allKlines = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
        if (allKlines.length > maxItems) {
            allKlines = allKlines.slice(-maxItems);
        }
        await store.put({ id, symbol, interval, data: allKlines });
        return allKlines;
    }

    async getKlines(symbol, interval) {
        if (!this.db) await this.open();
        const tx = this.db.transaction('klines', 'readonly');
        const store = tx.objectStore('klines');
        const id = `${symbol}_${interval}`;
        const result = await store.get(id);
        return result ? result.data : null;
    }

    async getKlinesRange(symbol, interval, fromTime, toTime) {
        const all = await this.getKlines(symbol, interval);
        if (!all) return [];
        let left = 0, right = all.length - 1;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (all[mid].time < fromTime) left = mid + 1;
            else right = mid - 1;
        }
        const startIdx = left;
        right = all.length - 1;
        left = startIdx;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (all[mid].time <= toTime) left = mid + 1;
            else right = mid - 1;
        }
        const endIdx = right;
        if (startIdx > endIdx) return [];
        return all.slice(startIdx, endIdx + 1);
    }

    async clearKlines(symbol, interval) {
        if (!this.db) await this.open();
        const tx = this.db.transaction('klines', 'readwrite');
        const store = tx.objectStore('klines');
        const id = `${symbol}_${interval}`;
        await store.delete(id);
    }
}