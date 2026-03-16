// ui/panelResizer.js
// ui/panelResizer.js
import { Utils } from '../utils.js';

export function initPanelResizer(state, chartManager) {
    const splitter = document.getElementById('splitter');
    const rightPanel = document.querySelector('.right-panel');
    const collapseBtn = document.getElementById('collapseRightPanel');
    let isResizing = false;
    let startX, startWidth;

    const savedWidth = state.loadFromStorage('rightPanelWidth', 360);
    rightPanel.style.width = savedWidth + 'px';

    // Увеличили debounce до 150 мс
    const throttledRefresh = Utils.debounce(() => {
        chartManager.refreshChartSize();
    }, 150);

    let lastWidth = rightPanel.offsetWidth;
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (entry.target === rightPanel) {
                const newWidth = entry.contentRect.width;
                // Вызываем refresh только если ширина изменилась
                if (Math.abs(newWidth - lastWidth) > 1) {
                    lastWidth = newWidth;
                    throttledRefresh();
                }
            }
        }
    });
    resizeObserver.observe(rightPanel);

    splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = rightPanel.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isResizing) return;
        const dx = startX - e.clientX;
        let newWidth = startWidth + dx;
        newWidth = Math.min(Math.max(newWidth, 200), 600);
        rightPanel.style.width = newWidth + 'px';
        rightPanel.style.transition = 'none';
        throttledRefresh(); // вызываем во время движения
    }

    function onMouseUp() {
        if (isResizing) {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            rightPanel.style.transition = '';
            state.saveToStorage('rightPanelWidth', rightPanel.offsetWidth);
            chartManager.refreshChartSize();
        }
    }

    collapseBtn.addEventListener('click', () => {
        rightPanel.classList.toggle('collapsed');
        state.saveToStorage('rightPanelCollapsed', rightPanel.classList.contains('collapsed'));
        setTimeout(() => chartManager.refreshChartSize(), 50);
    });

    const collapsed = state.loadFromStorage('rightPanelCollapsed', false);
    if (collapsed) rightPanel.classList.add('collapsed');

    return () => {
        resizeObserver.disconnect();
    };
}