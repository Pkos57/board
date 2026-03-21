// signalManager.js
import { Utils } from '../utils.js';

export class SignalManager {
    constructor(state, uiController, alertContainer, chartManager) {
        this.state = state;
        this.uiController = uiController;
        this.alertContainer = alertContainer;
        this.chartManager = chartManager;
        this.ws = null;
        this.reconnectTimer = null;
        this.url = 'ws://localhost:8765';
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

    sendCommand(cmd, params = {}) {
       
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ cmd, ...params }));
        } else {
            console.warn('SignalManager: WebSocket not open');
        }
    }

    requestAdditionalData(symbol) {
        this.sendCommand('get_liquidity_zones', { symbol });
        this.sendCommand('get_heatmap_data', { symbol });
        this.sendCommand('get_smc_patterns', { symbol });
    }
handleSignal(signal) {
   
    // ===================== СЛУЖЕБНЫЕ СООБЩЕНИЯ (ЗОНЫ, ПЛОТНОСТИ, SMC) =====================
    if (signal.type === 'liquidity_zones') {
        if (this.chartManager) {
            this.chartManager.liquidityZones = signal.zones;
            this.chartManager.redrawOverlay();
        }
        return;
    }
    if (signal.type === 'heatmap_data') {
        if (this.chartManager) {
            this.chartManager.densityHeatmap = signal.data;
            this.chartManager.redrawOverlay();
        }
        return;
    }
    if (signal.type === 'smc_patterns') {
        if (this.chartManager) {
            this.chartManager.smcPatterns = signal.data;
            this.chartManager.redrawOverlay();
        }
        return;
    }
    // 1. Извлекаем символ
    let symbol = null;
    if (signal.symbol) symbol = signal.symbol;
    else if (signal.basic?.symbol) symbol = signal.basic.symbol;
    else if (signal.chart?.symbol) symbol = signal.chart.symbol;
    else if (signal.id) {
        const match = signal.id.match(/^([A-Z0-9]+)_/);
        if (match) symbol = match[1] + 'USDT';
    }
    if (!symbol) {
        console.warn('⚠️ Сигнал без symbol:', signal);
        return;
    }
    symbol = String(symbol).toUpperCase().trim();
    if (!symbol.endsWith('USDT')) symbol = symbol + 'USDT';

    // 2. Создаём обогащённый сигнал
    const enhancedSignal = {
        ...signal,
        id: signal.id || `${symbol}_${Date.now()}`,
        symbol: symbol,
        time: signal.time || (signal.timestamp * 1000) || Date.now(),
        type: signal.type || signal.basic?.signal_type || 'UNKNOWN',
        strategy: signal.strategy || signal.basic?.strategy || 'Density',
        price: signal.price || signal.basic?.price || null,

        // Плотности (предварительные значения)
        densitySize: signal.densitySize || signal.metrics?.density?.volume_usdt || signal.volume_usdt || null,
        densityDirection: signal.densityDirection || 
            (signal.metrics?.density?.side === 'bid' ? 'buy' : 
            (signal.metrics?.density?.side === 'ask' ? 'sell' : null)),
        densityPriceStart: signal.densityPriceStart || null,
        densityPriceEnd: signal.densityPriceEnd || null,

        // Ликвидации
        liquidationType: signal.liquidationType || signal.metrics?.liquidations?.net_pressure || null,
        liquidationPrice: signal.liquidationPrice || signal.chart?.liquidation_price || null,
        liquidationSize: signal.liquidationSize || signal.metrics?.liquidations?.total_volume || null,

        // Дополнительно
        confidence: signal.confidence || signal.metrics?.confidence?.score || null,
        volume: signal.volume || signal.metrics?.market_context?.volume_24h_usdt || signal.volume_24h || null,
        timeframe: signal.timeframe || this.state.currentInterval,
    };

    // 3. Извлекаем price_range из разных мест и заполняем границы плотности
    let priceRangeStr = signal.price_range || signal.metrics?.price_range || signal.metrics?.density?.price_range;
    if (priceRangeStr && typeof priceRangeStr === 'string') {
        const parts = priceRangeStr.split('-').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            enhancedSignal.densityPriceStart = parts[0];
            enhancedSignal.densityPriceEnd = parts[1];
        } else {
            console.warn('Не удалось распарсить price_range:', priceRangeStr);
        }
    }

    // 4. Если границы всё ещё не заданы, но есть цена сигнала, создаём искусственные
    if (!enhancedSignal.densityPriceStart && enhancedSignal.price) {
        const price = enhancedSignal.price;
        const margin = Math.max(price * 0.001, 0.001); // 0.1% от цены, не менее 0.001
        enhancedSignal.densityPriceStart = price - margin;
        enhancedSignal.densityPriceEnd = price + margin;
        console.log(`Создан искусственный price_range для ${symbol}: ${enhancedSignal.densityPriceStart} – ${enhancedSignal.densityPriceEnd}`);
    }
    // Сохраняем зону плотности в кэш (даже если текущий символ другой)
    if (enhancedSignal.densitySize && enhancedSignal.densityDirection &&
        enhancedSignal.densityPriceStart && enhancedSignal.densityPriceEnd) {
        this.chartManager.storeDensityZone(symbol, {
            priceStart: enhancedSignal.densityPriceStart,
            priceEnd: enhancedSignal.densityPriceEnd,
            direction: enhancedSignal.densityDirection,
            size: enhancedSignal.densitySize,
            symbol: symbol
    });
}
    

    // 6. Добавляем сигнал в хранилище и рендерим в списке
    this.state.addSignal(enhancedSignal);
    this.uiController.renderSignals();

    // 7. Отображаем зону плотности на графике (если есть данные)
    if (enhancedSignal.densitySize && enhancedSignal.densityDirection &&
        enhancedSignal.densityPriceStart && enhancedSignal.densityPriceEnd &&
        this.chartManager && typeof this.chartManager.showDensityZone === 'function') {

        console.log('✅ Вызываем showDensityZone для', symbol);
        if (this.state.currentSymbol === symbol) {
            this.chartManager.showDensityZone({
                priceStart: enhancedSignal.densityPriceStart,
                priceEnd: enhancedSignal.densityPriceEnd,
                direction: enhancedSignal.densityDirection,
                size: enhancedSignal.densitySize,
                symbol: symbol
            });
        } else {
            console.log(`⚠️ Текущий символ ${this.state.currentSymbol} не совпадает с символом сигнала ${symbol}`);
        }
    } else {
        console.log('❌ Условие для отображения плотности не выполнено');
    }

    // 8. Уведомление (звук, всплывающее сообщение)
    if (this.state.notifySignals) {
        if (this.state.soundEnabled) Utils.playBeep(true);
        const msg = `${symbol} ${enhancedSignal.type}${enhancedSignal.strategy ? ' (' + enhancedSignal.strategy + ')' : ''}`;
        Utils.showAlert(msg, this.alertContainer, this.state.soundEnabled, symbol, 'scanner');
    }
}
    addDensityToChart(signal) {
        if (!this.chartManager || !this.chartManager.densityManager) return;
        
        const now = Math.floor(Date.now() / 1000);
        const hourAgo = now - 3600;
        
        const density = {
            priceStart: signal.densityPriceStart,
            priceEnd: signal.densityPriceEnd,
            size: signal.densitySize,
            direction: signal.densityDirection,
            timeStart: hourAgo,
            timeEnd: now + 3600, // показываем на 1 час вперёд
        };

        this.chartManager.densityManager.addDensityZone(density);
        
        // Сохраняем в state для восстановления
        if (!this.state.densityZones) this.state.densityZones = [];
        this.state.densityZones.push(density);
        this.state.saveToStorage(`densityZones_${this.state.currentSymbol}`, this.state.densityZones);
    }

    addLiquidationToChart(signal) {
        if (!this.chartManager || !this.chartManager.densityManager) return;
        
        const now = Math.floor(Date.now() / 1000);
        const hourAgo = now - 3600;
        
        const liquidation = {
            price: signal.liquidationPrice,
            type: signal.liquidationType,
            size: signal.liquidationSize,
            timeStart: hourAgo,
            timeEnd: now + 3600,
        };

        this.chartManager.densityManager.addLiquidationZone(liquidation);
        
        // Сохраняем в state для восстановления
        if (!this.state.liquidationZones) this.state.liquidationZones = [];
        this.state.liquidationZones.push(liquidation);
        this.state.saveToStorage(`liquidationZones_${this.state.currentSymbol}`, this.state.liquidationZones);
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