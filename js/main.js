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

    const chartManager = new ChartManager(
        document.getElementById('chart-container'),
        state,
        alertContainer,
        dataService
    );

    const drawingManager = new DrawingManager(chartManager, state, alertContainer);
    chartManager.setDrawingManager(drawingManager);

    const uiController = new UIController(state, chartManager, drawingManager, null, alertContainer);
    chartManager.setUIController(uiController);

    const wsManager = new WebSocketManager(chartManager, state, uiController, alertContainer);
    uiController.wsManager = wsManager;

    const signalManager = new SignalManager(state, uiController, alertContainer);
    signalManager.connect();

    const panelResizerCleanup = initPanelResizer(state, chartManager);

    const stats = await DataFetcher.fetchAllCoinStats();
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
    const initialData = await dataService.fetchKlines(state.currentSymbol, state.currentInterval);
    uiController.loader.style.display = 'none';
    if (initialData && initialData.length > 1) {
        chartManager.setData(initialData);
        wsManager.connect(state.currentSymbol, state.currentInterval);
        uiController.updateLastPrice(initialData[initialData.length-1].close);
        uiController.updateStatusBarFromTicker();
        initialData.forEach(candle => drawingManager.checkCrossingsForCandle(candle, state.soundEnabled, alertContainer));
        drawingManager.restoreDrawings();
        
        setTimeout(() => {
            chartManager.applyGlobalIndicators();
            uiController.updateIndicatorsModal();
        }, 100);
        
        uiController.renderSignals();
    } else {
        Utils.showAlert('Не удалось загрузить начальные данные', alertContainer, state.soundEnabled);
    }

    window.addEventListener('beforeunload', () => {
        panelResizerCleanup();
        wsManager.close();
        signalManager.disconnect();
        uiController.destroy();          // очистка ресурсов UIController
        chartManager.destroy();           // очистка ресурсов ChartManager
        if (uiController.coinListVirtual) uiController.coinListVirtual.destroy();
    });
})();