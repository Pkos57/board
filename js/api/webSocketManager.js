// api/webSocketManager.js
import { WebSocketClient } from './WebSocketClient.js';
import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';

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
    }

    connect(symbol, interval) {
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

                const index = this.updateQueue.findIndex(c => c.time === candle.time);
                if (index !== -1) {
                    this.updateQueue[index] = candle;
                } else {
                    this.updateQueue.push(candle);
                }
                this.scheduleProcessing();
            } else {
                // Игнорируем другие сообщения
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
        console.log(`📡 WebSocket: обработка ${queue.length} свечей`);

        for (const candle of queue) {
            const chartData = this.state.chartData;
            if (chartData.length && chartData[chartData.length - 1].time === candle.time) {
                chartData[chartData.length - 1] = candle;
            } else {
                chartData.push(candle);
                if (chartData.length > CONFIG.klineLimit) chartData.shift();
            }
            this.chartManager.updateLastCandle(candle);
            this.uiController.updateLastPrice(candle.close);
            if (this.chartManager.drawingManager) {
                this.chartManager.drawingManager.checkCrossingsForCandle(candle, this.state.soundEnabled, this.alertContainer);
            }
        }

        if (this.updateQueue.length > 0) {
            this.scheduleProcessing();
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