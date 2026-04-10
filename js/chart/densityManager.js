// chart/densityManager.js
const LightweightCharts = window.LightweightCharts;
const LineStyle = LightweightCharts.LineStyle;

export class DensityManager {
    constructor(chartManager, state) {
        this.chartManager = chartManager;
        this.state = state;
        this.chart = chartManager.chart;
        this.densitySeries = [];
        this.liquidationSeries = [];
    }

    // Очистить все зоны
    clearAll() {
        this.densitySeries.forEach(s => {
            try { this.chart.removeSeries(s); } catch (e) {}
        });
        this.liquidationSeries.forEach(s => {
            try { this.chart.removeSeries(s); } catch (e) {}
        });
        this.densitySeries = [];
        this.liquidationSeries = [];
    }

    // Добавить зону плотности
    addDensityZone(density) {
        const { priceStart, priceEnd, size, direction, timeStart, timeEnd } = density;
        
        const series = this.chart.addSeries(LightweightCharts.AreaSeries, {
            topColor: direction === 'buy' 
                ? CONFIG.colors.density.buy 
                : CONFIG.colors.density.sell,
            bottomColor: 'transparent',
            lineColor: CONFIG.colors.density.border,
            lineWidth: 1,
            priceScaleId: 'right',
        });

        const data = [
            { time: timeStart, value: priceStart },
            { time: timeStart, value: priceEnd },
            { time: timeEnd, value: priceEnd },
            { time: timeEnd, value: priceStart },
            { time: timeStart, value: priceStart } // замыкаем
        ];

        series.setData(data);
        this.densitySeries.push(series);

        // Сохраняем метаданные
        series.densityData = { size, direction, priceStart, priceEnd };
        
        return series;
    }

    // Добавить зону ликвидаций
    addLiquidationZone(liquidation) {
        const { price, type, size, timeStart, timeEnd } = liquidation;
        
        const series = this.chart.addSeries(LightweightCharts.AreaSeries, {
            topColor: type === 'long' 
                ? CONFIG.colors.liquidation.long 
                : CONFIG.colors.liquidation.short,
            bottomColor: 'transparent',
            lineColor: CONFIG.colors.liquidation.border,
            lineWidth: 1,
            priceScaleId: 'right',
            lineStyle: 1,
        });

        const data = [
            { time: timeStart, value: price },
            { time: timeEnd, value: price },
        ];

        series.setData(data);
        this.liquidationSeries.push(series);

        // Сохраняем метаданные
        series.liquidationData = { type, size, price };
        
        return series;
    }

    // Восстановить зоны из хранилища
    restoreFromState() {
        this.clearAll();
        
        if (this.state.densityZones) {
            this.state.densityZones.forEach(d => this.addDensityZone(d));
        }
        
        if (this.state.liquidationZones) {
            this.state.liquidationZones.forEach(l => this.addLiquidationZone(l));
        }
    }

    // Обновить зоны при смене символа
    updateForSymbol(symbol) {
        this.clearAll();
        // Загрузить зоны для текущего символа из state
        this.restoreFromState();
    }

    destroy() {
        this.clearAll();
    }
}