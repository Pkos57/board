// utils.js
import * as math from './indicators/math.js';

let audioCtx = null;

export const SoundManager = {
    async play(frequency = 800, duration = 0.2) {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = frequency;
        gainNode.gain.value = 0.5;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }
};

export function formatPrice(price) {
    if (price === undefined || price === null) return '—';
    if (price < 0.00001) return price.toFixed(8);
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.001) return price.toFixed(7);
    if (price < 0.01) return price.toFixed(6);
    if (price < 0.1) return price.toFixed(5);
    if (price < 1) return price.toFixed(4);
    if (price < 1000) return price.toFixed(3);
    return price.toFixed(2);
}

export function formatQuoteVolume(vol) {
    if (vol === undefined || vol === null) return '—';
    const v = parseFloat(vol);
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
}

export function playBeep(checked) {
    if (!checked) return;
    SoundManager.play().catch(e => console.warn('Audio play failed', e));
}

export function showAlert(message, container, soundEnabled = true, coinSymbol = '', lineType = '') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = '🔔';
    if (lineType === 'horizontal') icon = '📏';
    else if (lineType === 'trend') icon = '📈';
    else if (lineType === 'measure') icon = '📐';
    else if (lineType === 'scanner') icon = '🚨';
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
    
    if (soundEnabled) playBeep(soundEnabled);

    if (lineType !== 'scanner') {
        const logContainer = document.getElementById('alertLog');
        if (!logContainer) return;
        const entry = document.createElement('div');
        entry.className = 'alert-log-entry';
        entry.style.cssText = 'font-size:12px; padding:4px; border-bottom:1px solid #2a2f3f; color:#e0e0e0;';
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `<span style="color:#ffd700;">${coinSymbol || '—'}</span> ${message} <span style="color:#aaa; float:right;">${time}</span>`;
        logContainer.appendChild(entry);
        while (logContainer.children.length > 50) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Экспортируем функции расчёта из math.js
export const calculateEMA = math.calculateEMA;
export const calculateSMA = math.calculateSMA;
export const calculateRSI = math.calculateRSI;
export const calculateStochRSI = math.calculateStochRSI;
export const calculateADX = math.calculateADX;
export const calculateATR = math.calculateATR;
export const calculateMACD = math.calculateMACD;
export const createMadridRibbonCalculator = math.createMadridRibbonCalculator;

// Для обратной совместимости
export const Utils = {
    formatPrice,
    formatQuoteVolume,
    playBeep,
    showAlert,
    debounce,
    calculateEMA,
    calculateSMA,
    calculateRSI,
    calculateStochRSI,
    calculateADX,
    calculateATR,
    calculateMACD,
    createMadridRibbonCalculator
};