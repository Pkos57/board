const MADRID_RIBBON_COLORS = [
    'GreenYellow', 'Chartreuse', 'LawnGreen', 'Lime', 'LimeGreen',
    'Aqua', 'Cyan', 'DeepSkyBlue', 'Blue', 'Blue',
    'Yellow', 'Gold', 'LightSalmon', 'Coral', 'OrangeRed',
    'Violet', 'Orchid', 'Fuchsia', 'BlueViolet'
];

export const CONFIG = {
    colors: {
        gold: '#ffd700',
        volume: '#26a69a',
        rsi: '#FFA500',
        sma20: '#FFD700',
        sma50: '#FF69B4',
        ema20: '#00E5FF',
        bullish: '#0ecb81',
        bearish: '#f6465d',
        macd: '#FFB6C1',
        signal: '#87CEEB',
        lime: '#00FF00',
        maroon: '#800000',
        rubi: '#FF0000',
        green: '#008000',
        gray: '#808080',
        madridRibbon: MADRID_RIBBON_COLORS   // <-- ВОЗВРАЩАЕМ (используется в MadridRibbonIndicator)
    },
    intervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
    defaultSymbol: 'BTCUSDT',
    defaultInterval: '1h',
    klineLimit: 1000,
    wsReconnectDelay: 3000,
    chartTypes: ['candlestick', 'bar', 'line', 'area'],
    defaultChartType: 'candlestick',
    cacheMaxAge: 5 * 60 * 1000, // 5 минут
    madridPeriods: [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,100],
    madridDefaultSmooth: 1,
    madridDefaultExp: true,

    // Описание всех индикаторов
    indicators: [
        { type: 'sma20', label: 'SMA 20', defaultParams: { period: 20 }, color: '#FFD700', scale: 'right' },
        { type: 'sma50', label: 'SMA 50', defaultParams: { period: 50 }, color: '#FF69B4', scale: 'right' },
        { type: 'ema20', label: 'EMA 20', defaultParams: { period: 20 }, color: '#00E5FF', scale: 'right' },
        { type: 'rsi14', label: 'RSI 14', defaultParams: { period: 14 }, color: '#FFA500', scale: 'rsi' },
        { type: 'macd', label: 'MACD', defaultParams: { fast:12, slow:26, signal:9 }, colors: ['#FFB6C1','#87CEEB'], scale: 'macd' },
        { type: 'stochrsi', label: 'Stoch RSI', defaultParams: { period:14, k:3, d:3 }, colors: ['#FFD700','#FF69B4'], scale: 'stoch' },
        { type: 'atr', label: 'ATR', defaultParams: { period:14 }, color: '#FFA500', scale: 'atr' },
        { type: 'adx', label: 'ADX', defaultParams: { period:14 }, color: '#00E5FF', scale: 'adx' },
        { type: 'volume', label: 'Volume', defaultParams: {}, color: '#26a69a', scale: 'volume' },
        { type: 'madridRibbon', label: 'Madrid Ribbon', defaultParams: { useExp: true, smoothPeriod: 1 }, colors: MADRID_RIBBON_COLORS, scale: 'right' },
        { type: 'madridBar', label: 'Madrid Bar', defaultParams: { useExp: true, smoothPeriod: 1 }, colors: [], scale: 'madridBar' }
    ]
};