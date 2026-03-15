// signalManager.js
import { Utils } from '../utils.js';

export class SignalManager {
    constructor(state, uiController, alertContainer) {
        this.state = state;
        this.uiController = uiController;
        this.alertContainer = alertContainer;
        this.ws = null;
        this.reconnectTimer = null;
        this.url = 'ws://localhost:8765'; // замените на ваш WebSocket URL
    }

    connect() {
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => {
                console.log('✅ SignalManager connected');
            };
            this.ws.onmessage = (event) => {
                try {
                    const signal = JSON.parse(event.data);
                    this.handleSignal(signal);
                } catch (e) {
                    console.error('Invalid signal message', e);
                }
            };
            this.ws.onclose = () => {
                console.log('❌ SignalManager disconnected, reconnecting...');
                this.reconnectTimer = setTimeout(() => this.connect(), 5000);
            };
            this.ws.onerror = (err) => {
                console.error('SignalManager error', err);
            };
        } catch (e) {
            console.error('WebSocket connection error', e);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
    }

    handleSignal(signal) {
    // Формируем обогащённый сигнал с обязательными полями
    const enhancedSignal = {
        ...signal,
        id: signal.id || `${signal.symbol}_${Date.now()}`,
        time: signal.time || Date.now()
    };

    // Всегда добавляем сигнал в хранилище и обновляем интерфейс
    this.state.addSignal(enhancedSignal);
    this.uiController.renderSignals();

    // Показываем уведомление только если включены оповещения о сигналах
    if (this.state.notifySignals) {
        // Воспроизводим звук, если он включён глобально
        if (this.state.soundEnabled) {
            Utils.playBeep(true);
        }
        // Формируем сообщение для тоста
        const msg = `${signal.symbol} ${signal.type}${signal.strategy ? ' (' + signal.strategy + ')' : ''}`;
        Utils.showAlert(msg, this.alertContainer, this.state.soundEnabled, signal.symbol, 'scanner');
    }
}
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}