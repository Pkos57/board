// main.js
import { AppState } from './state.js';
import { ChartManager } from './chart/chartManager.js';
import { DrawingManager } from './chart/drawingManager.js';
import { DataFetcher } from './api/dataFetcher.js';
import { WebSocketManager } from './api/webSocketManager.js';
import { UIController } from './ui/uiController.js';
import { SignalManager } from './signals/signalManager.js';
import { initPanelResizer } from './ui/panelResizer.js';
import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { DataService } from './api/DataService.js';

(async function main() {
    const alertContainer = document.getElementById('alertContainer');
    const state = new AppState();

    const dataService = new DataService(alertContainer);
    dataService.setOnFullDataReady((fullSymbol, fullInterval, fullData) => {
        if (fullSymbol === state.currentSymbol && fullInterval === state.currentInterval) {
            chartManager.updateDataWithFullHistory(fullData);
        }
    });

    const chartManager = new ChartManager(
        document.getElementById('chart-container'),
        state,
        alertContainer,
        dataService
    );
    window.chartManager = chartManager;

    // 1. Сначала создаём WebSocketManager (без drawingManager, он ещё не готов)
    const wsManager = new WebSocketManager(chartManager, state, null, alertContainer);
    
    // 2. Создаём DrawingManager и передаём ему wsManager
    const drawingManager = new DrawingManager(chartManager, state, alertContainer);
    drawingManager.wsManager = wsManager;   // теперь wsManager уже объявлен
    wsManager.drawingManager = drawingManager;
    window.drawingManager = drawingManager;
    chartManager.setDrawingManager(drawingManager);
    
    // 3. Теперь создаём UIController, передаём ему wsManager и drawingManager
    const uiController = new UIController(state, chartManager, drawingManager, wsManager, alertContainer);
    chartManager.setUIController(uiController);
    
    // Обновляем ссылку на uiController в wsManager (так как при создании wsManager мы передали null)
    wsManager.uiController = uiController;
    
    const signalManager = new SignalManager(state, uiController, alertContainer, chartManager);
    uiController.signalManager = signalManager;
    wsManager.signalManager = signalManager;
    signalManager.connect();
    
    // Теперь можно вызывать refreshSubscriptions (если нужно)
    drawingManager.refreshSubscriptions();
    
    const panelResizerCleanup = initPanelResizer(state, chartManager);

    const stats = await DataFetcher.fetchAllCoinStats();
    window.DataFetcher = DataFetcher;
    state.setCoinStats(stats);
    uiController.renderCoinList();

    setInterval(async () => {
        const freshStats = await DataFetcher.fetchAllCoinStats(true);
        if (freshStats.length) {
            state.setCoinStats(freshStats);
            uiController.renderCoinList();
            uiController.updateStatusBarFromTicker();
        }
    }, 60000);

    document.getElementById('clearAlertsBtn')?.addEventListener('click', () => {
        document.getElementById('alertLog').innerHTML = '';
        uiController.updateAlertLogModal();
    });

    uiController.currentSymbolDisplay.textContent = state.currentSymbol;
    document.querySelectorAll('.interval-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.interval === state.currentInterval);
    });

    const savedSound = state.loadFromStorage('soundEnabled', true);
    state.setSoundEnabled(savedSound);
    document.getElementById('soundCheckbox').checked = savedSound;

    uiController.loader.style.display = 'block';
    // Быстрая загрузка первых 1000 свечей
    const initialData = await dataService.fetchInitialFast(state.currentSymbol, state.currentInterval, 1000);
    uiController.loader.style.display = 'none';

    if (initialData && initialData.length > 1) {
        chartManager.setData(initialData);
        // wsManager.connect(state.currentSymbol, state.currentInterval);
        uiController.updateLastPrice(initialData[initialData.length-1].close);
        uiController.updateStatusBarFromTicker();
        initialData.forEach(candle => drawingManager.checkCrossingsForCandle(candle, state.soundEnabled, alertContainer, true));
        drawingManager.restoreDrawings();
        drawingManager.refreshSubscriptions();

        setTimeout(() => {
            chartManager.applyGlobalIndicators();
            uiController.updateIndicatorsModal();
        }, 100);

        uiController.renderSignals();

        // Фоновая дозагрузка до 5000 свечей
        // dataService.startBackgroundFetch(state.currentSymbol, state.currentInterval, 5000);
    } else {
        Utils.showAlert('Не удалось загрузить начальные данные', alertContainer, state.soundEnabled);
    }
    
    window.addEventListener('beforeunload', () => {
        panelResizerCleanup();
        wsManager.close();
        signalManager.disconnect();
        uiController.destroy();
        chartManager.destroy();
        if (uiController.coinListVirtual) uiController.coinListVirtual.destroy();
    });
})();