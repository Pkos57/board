// ui/IndicatorSettingsModal.js

export class IndicatorSettingsModal {
    constructor(chartManager, state, alertContainer) {
        console.log('🏗️ IndicatorSettingsModal создан');
        this.chartManager = chartManager;
        this.state = state;
        this.alertContainer = alertContainer;
        this.currentIndicator = null;
        this.modal = null;
        this.createModal();
    }

    createModal() {
        console.log('📦 Создаём DOM модального окна');
        // Удаляем старый модал, если есть
        const oldModal = document.getElementById('indicatorSettingsModal');
        if (oldModal) oldModal.remove();

        this.modal = document.createElement('div');
        this.modal.id = 'indicatorSettingsModal';
        this.modal.className = 'tv-modal';
        this.modal.style.display = 'none';
        
        this.modal.innerHTML = `
            <div class="tv-modal-overlay"></div>
            <div class="tv-modal-container">
                <div class="tv-modal-header">
                    <div class="tv-modal-title">
                        <span class="tv-indicator-icon">📊</span>
                        <span id="tvModalTitle">Настройки индикатора</span>
                    </div>
                    <button class="tv-modal-close">×</button>
                </div>
                
                <div class="tv-modal-tabs">
                    <button class="tv-tab active" data-tab="inputs">Входные данные</button>
                    <button class="tv-tab" data-tab="style">Стиль</button>
                    <button class="tv-tab" data-tab="visibility">Видимость</button>
                </div>
                
                <div class="tv-modal-content">
                    <div class="tv-tab-content active" data-tab="inputs">
                        <div id="tvInputsContainer" class="tv-settings-group"></div>
                    </div>
                    <div class="tv-tab-content" data-tab="style">
                        <div id="tvStyleContainer" class="tv-settings-group"></div>
                    </div>
                    <div class="tv-tab-content" data-tab="visibility">
                        <div id="tvVisibilityContainer" class="tv-settings-group"></div>
                    </div>
                </div>
                
                <div class="tv-modal-footer">
                    <button class="tv-btn tv-btn-secondary" id="tvResetDefaults">Сбросить настройки</button>
                    <button class="tv-btn tv-btn-primary" id="tvApplySettings">Применить</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        this.initEventListeners();
    }

    initEventListeners() {
        // Закрытие модала
        this.modal.querySelector('.tv-modal-close').onclick = () => this.close();
        this.modal.querySelector('.tv-modal-overlay').onclick = () => this.close();
        
        // Переключение вкладок
        this.modal.querySelectorAll('.tv-tab').forEach(tab => {
            tab.onclick = () => this.switchTab(tab.dataset.tab);
        });
        
        // Кнопки
        this.modal.querySelector('#tvResetDefaults').onclick = () => this.resetToDefaults();
        this.modal.querySelector('#tvApplySettings').onclick = () => this.applySettings();
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close();
            }
        });
    }

    switchTab(tabId) {
        // Обновляем табы
        this.modal.querySelectorAll('.tv-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        
        // Обновляем контент
        this.modal.querySelectorAll('.tv-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabId);
        });
    }

    open(indicator) {
        console.log('🚀 Открываем модальное окно для индикатора:', indicator.type);
        this.currentIndicator = indicator;
        this.originalSettings = JSON.parse(JSON.stringify(indicator.params));
        this.originalSettings = JSON.parse(JSON.stringify(indicator.params));
        
        // Заполняем контейнеры
        this.renderInputs();
        this.renderStyle();
        this.renderVisibility();
        
        // Обновляем заголовок
        const title = this.modal.querySelector('#tvModalTitle');
        title.innerHTML = `⚙️ ${this.getIndicatorName(indicator.type)}`;
        
        this.modal.style.display = 'flex';
        console.log('✅ Модальное окно открыто');
    }

    close() {
        this.modal.style.display = 'none';
        this.currentIndicator = null;
    }

    getIndicatorName(type) {
        const names = {
            sma20: 'SMA 20',
            sma50: 'SMA 50',
            ema20: 'EMA 20',
            rsi14: 'RSI (14)',
            macd: 'MACD',
            stochrsi: 'Stoch RSI',
            atr: 'ATR',
            adx: 'ADX',
            volume: 'Volume',
            madridRibbon: 'Madrid Ribbon',
            madridBar: 'Madrid Bar',
            emaRainbow: 'EMA Rainbow + RSI + ADX + ATR + SAR'
        };
        return names[type] || type.toUpperCase();
    }

    renderInputs() {
        const container = this.modal.querySelector('#tvInputsContainer');
        container.innerHTML = '';
        
        const params = this.currentIndicator.params;
        const config = this.getIndicatorConfig(this.currentIndicator.type);
        
        if (!config || !config.inputs) {
            container.innerHTML = '<div class="tv-settings-empty">Нет доступных настроек</div>';
            return;
        }
        
        // Группируем параметры
        const groups = this.groupParameters(config.inputs);
        
        groups.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'tv-settings-section';
            
            if (group.title) {
                const title = document.createElement('div');
                title.className = 'tv-settings-title';
                title.textContent = group.title;
                groupDiv.appendChild(title);
            }
            
            group.params.forEach(param => {
                const setting = this.createSettingInput(param, params[param.id]);
                groupDiv.appendChild(setting);
            });
            
            container.appendChild(groupDiv);
        });
    }

    renderStyle() {
        const container = this.modal.querySelector('#tvStyleContainer');
        container.innerHTML = '';
        
        const params = this.currentIndicator.params;
        const config = this.getIndicatorConfig(this.currentIndicator.type);
        
        if (!config || !config.style) {
            container.innerHTML = '<div class="tv-settings-empty">Нет доступных настроек стиля</div>';
            return;
        }
        
        config.style.forEach(style => {
            const setting = this.createStyleSetting(style, params[style.id]);
            container.appendChild(setting);
        });
    }

    renderVisibility() {
        const container = this.modal.querySelector('#tvVisibilityContainer');
        container.innerHTML = '';
        
        // Базовые настройки видимости
        const visibilitySettings = [
            { id: 'visible', label: 'Видимый на графике', type: 'checkbox', default: true },
            { id: 'showLabels', label: 'Показывать подписи', type: 'checkbox', default: true },
            { id: 'showLastValue', label: 'Показывать последнее значение', type: 'checkbox', default: true }
        ];
        
        visibilitySettings.forEach(setting => {
            const value = this.currentIndicator.params[setting.id] ?? setting.default;
            const settingDiv = this.createSetting({
                ...setting,
                value
            });
            container.appendChild(settingDiv);
        });
    }

    createSettingInput(param, currentValue) {
        const value = currentValue !== undefined ? currentValue : param.default;
        
        switch(param.type) {
            case 'integer':
            case 'number':
                return this.createNumberSetting(param, value);
            case 'float':
                return this.createFloatSetting(param, value);
            case 'boolean':
                return this.createBooleanSetting(param, value);
            case 'color':
                return this.createColorSetting(param, value);
            case 'select':
                return this.createSelectSetting(param, value);
            case 'string':
                return this.createTextSetting(param, value);
            default:
                return this.createTextSetting(param, value);
        }
    }

    createNumberSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const control = document.createElement('div');
        control.className = 'tv-setting-control';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        input.step = param.step || 1;
        input.min = param.min !== undefined ? param.min : (param.type === 'integer' ? 1 : 0);
        input.max = param.max;
        input.className = 'tv-input-number';
        input.dataset.param = param.id;
        
        // Добавляем ползунок для диапазона
        if (param.min !== undefined && param.max !== undefined && param.type !== 'integer') {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = param.min;
            slider.max = param.max;
            slider.step = param.step || (param.type === 'float' ? 0.01 : 1);
            slider.value = value;
            slider.className = 'tv-slider';
            slider.dataset.param = param.id;
            
            slider.oninput = (e) => {
                input.value = e.target.value;
                this.currentIndicator.params[param.id] = parseFloat(e.target.value);
            };
            
            input.oninput = (e) => {
                slider.value = e.target.value;
                this.currentIndicator.params[param.id] = parseFloat(e.target.value);
            };
            
            control.appendChild(slider);
        }
        
        control.appendChild(input);
        div.appendChild(label);
        div.appendChild(control);
        
        return div;
    }

    createFloatSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const control = document.createElement('div');
        control.className = 'tv-setting-control';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        input.step = param.step || 0.01;
        input.min = param.min !== undefined ? param.min : 0;
        input.max = param.max;
        input.className = 'tv-input-number';
        input.dataset.param = param.id;
        
        // Ползунок для float
        if (param.min !== undefined && param.max !== undefined) {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = param.min;
            slider.max = param.max;
            slider.step = param.step || 0.01;
            slider.value = value;
            slider.className = 'tv-slider';
            slider.dataset.param = param.id;
            
            slider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                input.value = val.toFixed(2);
                this.currentIndicator.params[param.id] = val;
            };
            
            input.oninput = (e) => {
                const val = parseFloat(e.target.value);
                slider.value = val;
                this.currentIndicator.params[param.id] = val;
            };
            
            control.appendChild(slider);
        }
        
        control.appendChild(input);
        div.appendChild(label);
        div.appendChild(control);
        
        return div;
    }

    createBooleanSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting tv-setting-boolean';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = value;
        checkbox.className = 'tv-checkbox';
        checkbox.dataset.param = param.id;
        
        checkbox.onchange = (e) => {
            this.currentIndicator.params[param.id] = e.target.checked;
        };
        
        const span = document.createElement('span');
        span.textContent = param.label;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        div.appendChild(label);
        
        return div;
    }

    createColorSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const control = document.createElement('div');
        control.className = 'tv-setting-control';
        
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = value || param.default || '#ffd700';
        colorInput.className = 'tv-color-picker';
        colorInput.dataset.param = param.id;
        
        colorInput.onchange = (e) => {
            this.currentIndicator.params[param.id] = e.target.value;
            
            // Обновляем превью цвета
            const preview = div.querySelector('.tv-color-preview');
            if (preview) preview.style.backgroundColor = e.target.value;
        };
        
        const preview = document.createElement('div');
        preview.className = 'tv-color-preview';
        preview.style.backgroundColor = colorInput.value;
        
        control.appendChild(preview);
        control.appendChild(colorInput);
        div.appendChild(label);
        div.appendChild(control);
        
        return div;
    }

    createSelectSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const select = document.createElement('select');
        select.className = 'tv-select';
        select.dataset.param = param.id;
        
        param.options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            opt.selected = option.value === value;
            select.appendChild(opt);
        });
        
        select.onchange = (e) => {
            this.currentIndicator.params[param.id] = e.target.value;
        };
        
        div.appendChild(label);
        div.appendChild(select);
        
        return div;
    }

    createTextSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.className = 'tv-input-text';
        input.dataset.param = param.id;
        
        input.onchange = (e) => {
            this.currentIndicator.params[param.id] = e.target.value;
        };
        
        div.appendChild(label);
        div.appendChild(input);
        
        return div;
    }

    createStyleSetting(style, currentValue) {
        const value = currentValue !== undefined ? currentValue : style.default;
        
        switch(style.type) {
            case 'color':
                return this.createColorSetting(style, value);
            case 'lineWidth':
                return this.createLineWidthSetting(style, value);
            case 'lineStyle':
                return this.createLineStyleSetting(style, value);
            default:
                return this.createSettingInput(style, value);
        }
    }

    createLineWidthSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const control = document.createElement('div');
        control.className = 'tv-setting-control';
        
        const input = document.createElement('input');
        input.type = 'range';
        input.min = 1;
        input.max = 5;
        input.step = 1;
        input.value = value || 2;
        input.className = 'tv-slider';
        input.dataset.param = param.id;
        
        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'tv-value-display';
        valueDisplay.textContent = input.value;
        
        input.oninput = (e) => {
            valueDisplay.textContent = e.target.value;
            this.currentIndicator.params[param.id] = parseInt(e.target.value);
        };
        
        control.appendChild(input);
        control.appendChild(valueDisplay);
        div.appendChild(label);
        div.appendChild(control);
        
        return div;
    }

    createLineStyleSetting(param, value) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        label.textContent = param.label;
        
        const select = document.createElement('select');
        select.className = 'tv-select';
        select.dataset.param = param.id;
        
        const styles = [
            { value: 'solid', label: 'Сплошная', style: '—' },
            { value: 'dashed', label: 'Пунктирная', style: '- -' },
            { value: 'dotted', label: 'Точечная', style: '· ·' }
        ];
        
        styles.forEach(style => {
            const opt = document.createElement('option');
            opt.value = style.value;
            opt.textContent = style.label;
            opt.selected = style.value === (value || 'solid');
            select.appendChild(opt);
        });
        
        select.onchange = (e) => {
            this.currentIndicator.params[param.id] = e.target.value;
        };
        
        div.appendChild(label);
        div.appendChild(select);
        
        return div;
    }

    groupParameters(params) {
        const groups = [];
        const uncategorized = { title: null, params: [] };
        
        params.forEach(param => {
            if (param.group) {
                let group = groups.find(g => g.title === param.group);
                if (!group) {
                    group = { title: param.group, params: [] };
                    groups.push(group);
                }
                group.params.push(param);
            } else {
                uncategorized.params.push(param);
            }
        });
        
        if (uncategorized.params.length) {
            groups.unshift(uncategorized);
        }
        
        return groups;
    }

    getIndicatorConfig(type) {
        const configs = {
            // // EMA Rainbow индикатор
            // emaRainbow: {
            //     inputs: [
            //         { id: 'ema1Period', label: 'EMA 1 период', type: 'integer', default: 6, min: 1, max: 200, group: 'EMA настройки' },
            //         { id: 'ema2Period', label: 'EMA 2 период', type: 'integer', default: 21, min: 1, max: 200, group: 'EMA настройки' },
            //         { id: 'ema3Period', label: 'EMA 3 период', type: 'integer', default: 34, min: 1, max: 200, group: 'EMA настройки' },
            //         { id: 'rsiLength', label: 'RSI период', type: 'integer', default: 14, min: 1, max: 100, group: 'RSI настройки' },
            //         { id: 'rsiOverbought', label: 'RSI перекупленность', type: 'integer', default: 70, min: 50, max: 100, group: 'RSI настройки' },
            //         { id: 'rsiOversold', label: 'RSI перепроданность', type: 'integer', default: 30, min: 0, max: 50, group: 'RSI настройки' },
            //         { id: 'showRSI', label: 'Показывать RSI', type: 'boolean', default: true, group: 'RSI настройки' },
            //         { id: 'adxLength', label: 'ADX период', type: 'integer', default: 14, min: 1, max: 100, group: 'ADX настройки' },
            //         { id: 'adxThreshold', label: 'ADX порог тренда', type: 'integer', default: 25, min: 10, max: 50, group: 'ADX настройки' },
            //         { id: 'showADX', label: 'Показывать ADX', type: 'boolean', default: true, group: 'ADX настройки' },
            //         { id: 'atrLength', label: 'ATR период', type: 'integer', default: 14, min: 1, max: 100, group: 'ATR настройки' },
            //         { id: 'showATR', label: 'Показывать ATR', type: 'boolean', default: true, group: 'ATR настройки' },
            //         { id: 'sarStart', label: 'SAR старт', type: 'float', default: 0.02, min: 0.001, max: 0.1, step: 0.001, group: 'SAR настройки' },
            //         { id: 'sarIncrement', label: 'SAR инкремент', type: 'float', default: 0.02, min: 0.001, max: 0.1, step: 0.001, group: 'SAR настройки' },
            //         { id: 'sarMaximum', label: 'SAR максимум', type: 'float', default: 0.2, min: 0.1, max: 0.5, step: 0.01, group: 'SAR настройки' },
            //         { id: 'showSAR', label: 'Показывать SAR', type: 'boolean', default: true, group: 'SAR настройки' }
            //     ],
            //     style: [
            //         { id: 'ema1Color', label: 'Цвет EMA 1', type: 'color', default: '#FF0000' },
            //         { id: 'ema2Color', label: 'Цвет EMA 2', type: 'color', default: '#00FF00' },
            //         { id: 'ema3Color', label: 'Цвет EMA 3', type: 'color', default: '#0000FF' },
            //         { id: 'emaWidth', label: 'Толщина EMA линий', type: 'lineWidth', default: 2 },
            //         { id: 'rsiColor', label: 'Цвет RSI', type: 'color', default: '#FFA500' },
            //         { id: 'adxColor', label: 'Цвет ADX', type: 'color', default: '#FF69B4' },
            //         { id: 'atrColor', label: 'Цвет ATR', type: 'color', default: '#FFA500' },
            //         { id: 'sarColorUp', label: 'Цвет SAR (вверх)', type: 'color', default: '#0ecb81' },
            //         { id: 'sarColorDown', label: 'Цвет SAR (вниз)', type: 'color', default: '#f6465d' }
            //     ]
            // },
            sma20: {
            inputs: [
                { id: 'period', label: 'Период SMA', type: 'integer', default: 20, min: 1, max: 200, group: 'Настройки' }
            ],
            style: [
                { id: 'color', label: 'Цвет линии', type: 'color', default: '#FFD700' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 }
            ]
        },
        sma50: {
            inputs: [
                { id: 'period', label: 'Период SMA', type: 'integer', default: 50, min: 1, max: 200, group: 'Настройки' }
            ],
            style: [
                { id: 'color', label: 'Цвет линии', type: 'color', default: '#FF69B4' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 }
            ]
        },
        ema20: {
            inputs: [
                { id: 'period', label: 'Период EMA', type: 'integer', default: 20, min: 1, max: 200, group: 'Настройки' }
            ],
            style: [
                { id: 'color', label: 'Цвет линии', type: 'color', default: '#00E5FF' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 }
            ]
        },
        
        // RSI
        rsi14: {
            inputs: [
                { id: 'period', label: 'Период RSI', type: 'integer', default: 14, min: 1, max: 100, group: 'RSI настройки' },
                { id: 'overbought', label: 'Уровень перекупленности', type: 'integer', default: 70, min: 50, max: 100, group: 'RSI настройки' },
                { id: 'oversold', label: 'Уровень перепроданности', type: 'integer', default: 30, min: 0, max: 50, group: 'RSI настройки' }
            ],
            style: [
                { id: 'color', label: 'Цвет линии RSI', type: 'color', default: '#FFA500' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 }
            ]
        },
        
        // MACD
        macd: {
            inputs: [
                { id: 'fast', label: 'Быстрая MA', type: 'integer', default: 12, min: 1, max: 50, group: 'MACD настройки' },
                { id: 'slow', label: 'Медленная MA', type: 'integer', default: 26, min: 1, max: 100, group: 'MACD настройки' },
                { id: 'signal', label: 'Сигнальная линия', type: 'integer', default: 9, min: 1, max: 50, group: 'MACD настройки' }
            ],
            style: [
                { id: 'macdColor', label: 'Цвет MACD линии', type: 'color', default: '#FFB6C1' },
                { id: 'signalColor', label: 'Цвет сигнальной линии', type: 'color', default: '#87CEEB' },
                { id: 'histogramUpColor', label: 'Цвет гистограммы (вверх)', type: 'color', default: '#26a69a' },
                { id: 'histogramDownColor', label: 'Цвет гистограммы (вниз)', type: 'color', default: '#f44336' },
                { id: 'lineWidth', label: 'Толщина линий', type: 'lineWidth', default: 2 }
            ]
        },
        
        // Stoch RSI
        stochrsi: {
            inputs: [
                { id: 'period', label: 'Период RSI', type: 'integer', default: 14, min: 1, max: 100, group: 'Stoch RSI настройки' },
                { id: 'k', label: 'K период', type: 'integer', default: 3, min: 1, max: 20, group: 'Stoch RSI настройки' },
                { id: 'd', label: 'D период', type: 'integer', default: 3, min: 1, max: 20, group: 'Stoch RSI настройки' }
            ],
            style: [
                { id: 'kColor', label: 'Цвет линии %K', type: 'color', default: '#FFD700' },
                { id: 'dColor', label: 'Цвет линии %D', type: 'color', default: '#FF69B4' },
                { id: 'lineWidth', label: 'Толщина линий', type: 'lineWidth', default: 2 }
            ]
        },
        
        // ATR
        atr: {
            inputs: [
                { id: 'period', label: 'Период ATR', type: 'integer', default: 14, min: 1, max: 100, group: 'ATR настройки' }
            ],
            style: [
                { id: 'color', label: 'Цвет линии ATR', type: 'color', default: '#FFA500' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 }
            ]
        },
        
        // ADX
        adx: {
            inputs: [
                { id: 'period', label: 'Период ADX', type: 'integer', default: 14, min: 1, max: 100, group: 'Настройки ADX' },
                { id: 'level1Value', label: 'Уровень 1 (слабый тренд)', type: 'integer', default: 20, min: 0, max: 100, group: 'Уровни ADX' },
                { id: 'level2Value', label: 'Уровень 2 (тренд начинается)', type: 'integer', default: 25, min: 0, max: 100, group: 'Уровни ADX' },
                { id: 'level3Value', label: 'Уровень 3 (сильный тренд)', type: 'integer', default: 40, min: 0, max: 100, group: 'Уровни ADX' }
    ],
            style: [
                { id: 'color', label: 'Цвет линии ADX', type: 'color', default: '#00E5FF' },
                { id: 'lineWidth', label: 'Толщина линии', type: 'lineWidth', default: 2 },
                { id: 'level1Color', label: 'Цвет уровня 1', type: 'color', default: '#888888' },
                { id: 'level2Color', label: 'Цвет уровня 2', type: 'color', default: '#ffaa00' },
                { id: 'level3Color', label: 'Цвет уровня 3', type: 'color', default: '#f6465d' }
    ]
},
        
        // Madrid Ribbon
        madridRibbon: {
            inputs: [
                { id: 'useExp', label: 'Использовать EMA', type: 'boolean', default: true, group: 'Настройки' },
                { id: 'smoothPeriod', label: 'Период сглаживания', type: 'integer', default: 5, min: 1, max: 20, group: 'Настройки' }
            ],
            style: []
        },
        
        // Madrid Bar
        madridBar: {
            inputs: [
                { id: 'useExp', label: 'Использовать EMA', type: 'boolean', default: true, group: 'Настройки' },
                { id: 'smoothPeriod', label: 'Период сглаживания', type: 'integer', default: 5, min: 1, max: 20, group: 'Настройки' }
            ],
            style: []
        },
        
        // EMA Rainbow (если нужен)
        emaRainbow: {
            inputs: [
                { id: 'ema1Period', label: 'EMA 1 период', type: 'integer', default: 6, min: 1, max: 200, group: 'EMA настройки' },
                { id: 'ema2Period', label: 'EMA 2 период', type: 'integer', default: 21, min: 1, max: 200, group: 'EMA настройки' },
                { id: 'ema3Period', label: 'EMA 3 период', type: 'integer', default: 34, min: 1, max: 200, group: 'EMA настройки' },
                { id: 'rsiLength', label: 'RSI период', type: 'integer', default: 14, min: 1, max: 100, group: 'RSI настройки' },
                { id: 'showRSI', label: 'Показывать RSI', type: 'boolean', default: true, group: 'RSI настройки' },
                { id: 'showADX', label: 'Показывать ADX', type: 'boolean', default: true, group: 'ADX настройки' },
                { id: 'showATR', label: 'Показывать ATR', type: 'boolean', default: true, group: 'ATR настройки' },
                { id: 'showSAR', label: 'Показывать SAR', type: 'boolean', default: true, group: 'SAR настройки' }
            ],
            style: [
                { id: 'ema1Color', label: 'Цвет EMA 1', type: 'color', default: '#FF0000' },
                { id: 'ema2Color', label: 'Цвет EMA 2', type: 'color', default: '#00FF00' },
                { id: 'ema3Color', label: 'Цвет EMA 3', type: 'color', default: '#0000FF' },
                { id: 'rsiColor', label: 'Цвет RSI', type: 'color', default: '#FFA500' },
                { id: 'adxColor', label: 'Цвет ADX', type: 'color', default: '#FF69B4' },
                { id: 'atrColor', label: 'Цвет ATR', type: 'color', default: '#FFA500' }
            ]
        }
    };
        return configs[type] || { inputs: [], style: [] };
    }

    createSetting(setting) {
        const div = document.createElement('div');
        div.className = 'tv-setting';
        
        const label = document.createElement('label');
        label.className = 'tv-setting-label';
        
        if (setting.type === 'checkbox') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = setting.value;
            checkbox.className = 'tv-checkbox';
            checkbox.onchange = (e) => {
                this.currentIndicator.params[setting.id] = e.target.checked;
            };
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(setting.label));
        } else {
            label.textContent = setting.label;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = setting.value;
            input.className = 'tv-input-text';
            input.onchange = (e) => {
                this.currentIndicator.params[setting.id] = e.target.value;
            };
            div.appendChild(label);
            div.appendChild(input);
            return div;
        }
        
        div.appendChild(label);
        return div;
    }

    resetToDefaults() {
        const config = this.getIndicatorConfig(this.currentIndicator.type);
        if (!config) return;
        
        // Сбрасываем параметры ввода
        config.inputs.forEach(param => {
            this.currentIndicator.params[param.id] = param.default;
        });
        
        // Сбрасываем параметры стиля
        if (config.style) {
            config.style.forEach(style => {
                this.currentIndicator.params[style.id] = style.default;
            });
        }
        
        // Перерисовываем настройки
        this.renderInputs();
        this.renderStyle();
        this.renderVisibility();
    }

    async applySettings() {
    // 1. Удаляем старый кэш индикатора из IndexedDB (если параметры изменились)
        const oldParams = this.originalSettings; // должны сохранить при открытии модала
        if (oldParams && this.chartManager.db) {
        // Сравниваем старые и новые параметры, чтобы не удалять кэш, если ничего не изменилось
            const paramsChanged = JSON.stringify(oldParams) !== JSON.stringify(this.currentIndicator.params);
            if (paramsChanged) {
                await this.chartManager.db.deleteIndicator(
                    this.chartManager.state.currentSymbol,
                    this.chartManager.state.currentInterval,
                    this.currentIndicator.type,
                    oldParams
                ).catch(e => console.warn('Ошибка удаления кэша индикатора', e));
        }
    }

    // 2. Удаляем старый индикатор с графика
        this.chartManager.removeIndicator(this.currentIndicator.type);

    // 3. Добавляем новый индикатор с обновлёнными параметрами (асинхронно)
        await this.chartManager.addIndicator(this.currentIndicator.type, this.currentIndicator.params);

    // 4. Обновляем состояние (state)
        const indicatorIndex = this.state.activeIndicators.findIndex(
            i => i.type === this.currentIndicator.type
    );
        if (indicatorIndex !== -1) {
            this.state.activeIndicators[indicatorIndex].params = this.currentIndicator.params;
            this.state.saveToStorage('globalIndicators', this.state.activeIndicators);
    }

    // 5. Закрываем модальное окно
        this.close();
}
}