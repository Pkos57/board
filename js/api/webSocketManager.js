// api/webSocketManager.js
import { WebSocketClient } from './WebSocketClient.js';
import { CONFIG } from '../config.js';

export class WebSocketManager {
    constructor(chartManager, state, uiController, alertContainer) {
        this.chartManager = chartManager;
        this.state = state;
        this.uiController = uiController;
        this.alertContainer = alertContainer;
        this.client = null;
        this.updateQueue = [];
        this.throttleTimer = null;
        this.wsBadge = document.getElementById('wsBadge');
        this.symbol = null;
        this.interval = null;
        this.currentSubscriptionKey = null;
    }

    // Обычное соединение (один символ)
    connect(symbol, interval) {
        console.warn('⚠️ Устаревший метод connect вызван для', symbol, '. Используйте subscribeToSymbols.');
        this.close();
        this.symbol = symbol;
        this.interval = interval;
        const url = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`;
        this.client = new WebSocketClient(url, {
            onMessage: (e) => this.onMessage(e),
            onOpen: () => { if (this.wsBadge) this.wsBadge.style.background = '#4caf50'; },
            onClose: () => { if (this.wsBadge) this.wsBadge.style.background = '#f44336'; },
            onError: () => { if (this.wsBadge) this.wsBadge.style.background = '#f44336'; },
            reconnectDelay: CONFIG.wsReconnectDelay,
            heartbeatInterval: 30000
        });
        this.client.connect();
    }

    // Комбинированное соединение (много символов)
    subscribeToSymbols(symbols, interval) {
        const unique = [...new Set(symbols)].sort();
        console.log('🌐 Подписка на комбинированный поток:', unique);
        const streams = unique.map(s => `${s.toLowerCase()}@kline_${interval}`).join('/');
        const url = `wss://fstream.binance.com/stream?streams=${streams}`;
        this.client = new WebSocketClient(url, {
            onMessage: (e) => this.onCombinedMessage(e),
            onOpen: () => { if (this.wsBadge) this.wsBadge.style.background = '#4caf50'; },
            onClose: () => { if (this.wsBadge) this.wsBadge.style.background = '#f44336'; },
            onError: () => { if (this.wsBadge) this.wsBadge.style.background = '#f44336'; },
            reconnectDelay: CONFIG.wsReconnectDelay,
            heartbeatInterval: 30000
        });
        this.client.connect();
    }

    // Обработчик комбинированных сообщений (ИСПРАВЛЕННЫЙ)
    onCombinedMessage(event) {
        try {
            const data = JSON.parse(event.data);
            // В комбинированном потоке свеча находится в data.data
            const streamData = data.data;
            if (!streamData || !streamData.k) return;

            const symbol = streamData.s;
            if (!symbol) return;

            const k = streamData.k;
            const candle = {
                time: Math.floor(k.t / 1000),
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v)
            };

            // Проверяем пересечения для этого символа
            const originalSymbol = this.state.currentSymbol;
            try {
                this.state.currentSymbol = symbol;
                if (this.drawingManager) {
                    this.drawingManager.checkCrossingsForCandle(
                        candle,
                        this.state.soundEnabled,
                        this.alertContainer,
                        false
                    );
                }
            } finally {
                this.state.currentSymbol = originalSymbol;
            }

            // Обновляем график, если это текущий символ
            if (symbol === this.state.currentSymbol) {
                this.processCandleForCurrentChart(candle, symbol);
            }
        } catch (e) {
            console.error('WebSocket combined message error', e);
        }
    }

    // Обработчик обычных сообщений (один символ)
    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            if (data && data.k) {
                const k = data.k;
                if (typeof k.t === 'undefined') {
                    console.warn('Invalid kline message (missing t)', data);
                    return;
                }
                const time = Math.floor(Number(k.t) / 1000);
                if (isNaN(time) || time <= 0) {
                    console.warn('Invalid time in kline message', k.t);
                    return;
                }
                const candle = {
                    time: time,
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v)
                };
                if (!this.isValidCandle(candle)) return;
                if (isNaN(candle.time) || isNaN(candle.open) || isNaN(candle.high) || 
                    isNaN(candle.low) || isNaN(candle.close) || isNaN(candle.volume)) {
                    console.warn('WebSocket: получена некорректная свеча, пропускаем', candle);
                    return;
                }
                if (candle.time < 1577836800) {
                    console.warn('WebSocket: время свечи слишком маленькое, возможно ошибка', candle.time);
                    return;
                }
                const index = this.updateQueue.findIndex(c => c.time === candle.time);
                if (index !== -1) {
                    this.updateQueue[index] = candle;
                } else {
                    this.updateQueue.push(candle);
                }
                this.scheduleProcessing();
            } else if (data && data.type === 'signal_with_chart') {
                if (this.signalManager) {
                    this.signalManager.handleSignal(data);
                } else {
                    console.warn('signalManager не передан в wsManager');
                }
            }
        } catch (e) {
            console.error('WebSocket onMessage error', e);
        }
    }

    isValidCandle(c) {
        return c && !isNaN(c.time) && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close) && !isNaN(c.volume) && c.close > 0 && c.high >= c.low;
    }

    scheduleProcessing() {
        if (this.throttleTimer) return;
        this.throttleTimer = setTimeout(() => {
            this.throttleTimer = null;
            this.processUpdates();
        }, 16);
    }

    processUpdates() {
        if (this.updateQueue.length === 0) return;
        const queue = [...this.updateQueue];
        this.updateQueue = [];

        for (const candle of queue) {
            if (!candle?.time || isNaN(candle.close)) continue;
            const chartData = this.state.chartData;
            const lastCandle = chartData[chartData.length - 1];
            const isNewCandle = !lastCandle || candle.time > lastCandle.time;

            if (lastCandle && lastCandle.time === candle.time) {
                chartData[chartData.length - 1] = candle;
            } else {
                chartData.push(candle);
                if (chartData.length > CONFIG.klineLimit) chartData.shift();
            }

            this.chartManager.updateLastCandle(candle, isNewCandle);

            if (this.chartManager.dataService && this.chartManager.dataService.db) {
                this.chartManager.dataService.db.saveKlines(this.symbol, this.interval, [candle])
                    .catch(e => console.warn('Ошибка сохранения свечи в кэш:', e));
            }
            this.uiController.updateLastPrice(candle.close);
            if (this.chartManager.drawingManager) {
                this.chartManager.drawingManager.checkCrossingsForCandle(candle, this.state.soundEnabled, this.alertContainer, false);
            }
        }

        if (this.updateQueue.length > 0) {
            this.scheduleProcessing();
        }
    }

    processCandleForCurrentChart(candle, symbol) {
        const chartData = this.state.chartData;
        const lastCandle = chartData[chartData.length - 1];
        const isNewCandle = !lastCandle || candle.time > lastCandle.time;

        if (lastCandle && lastCandle.time === candle.time) {
            chartData[chartData.length - 1] = candle;
        } else {
            chartData.push(candle);
            if (chartData.length > CONFIG.klineLimit) chartData.shift();
        }

        this.chartManager.updateLastCandle(candle, isNewCandle);
        if (this.uiController) this.uiController.updateLastPrice(candle.close);

        if (this.chartManager.dataService?.db) {
            this.chartManager.dataService.db.saveKlines(symbol, this.interval, [candle])
                .catch(e => console.warn('Ошибка сохранения свечи', e));
        }
    }

    close() {
        if (this.client) {
            this.client.close();
            this.client = null;
        }
        if (this.throttleTimer) {
            clearTimeout(this.throttleTimer);
            this.throttleTimer = null;
        }
        this.updateQueue = [];
    }
}