// indicators/BaseIndicator.js
export class BaseIndicator {
    constructor(type, params = {}, chartManager) {
        this.type = type;
        this.params = params;
        this.chartManager = chartManager;
        this.series = [];
        this.prevValues = {};
    }

    createSeries(chart) {
        throw new Error('Must implement createSeries');
    }

    computeFull(data) {
        throw new Error('Must implement computeFull');
    }

    updateLast(candle, allData) {
        throw new Error('Must implement updateLast');
    }

    remove() {
        this.series.forEach(s => {
            try { this.chartManager.chart.removeSeries(s); } catch (e) {}
        });
        this.series = [];
    }
}