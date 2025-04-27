import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, Time, ISeriesApi, LineStyle } from 'lightweight-charts';
import Papa from 'papaparse';
import { ATR, EMA } from 'technicalindicators';

interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CSVRow {
  open_time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  close_time: string;
  quote_volume: string;
  count: string;
  taker_buy_volume: string;
  taker_buy_quote_volume: string;
  ignore: string;
}

interface ParseResult<T> {
  data: T[];
  errors: Array<{
    type: string;
    code: string;
    message: string;
    row: number;
  }>;
  meta: {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  };
}

interface FileManifest {
  files: string[];
}

interface ClickedTimestamp {
  time: Time;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  type: 'long' | 'short';
}

// Add interface for serialized timestamp
interface SerializedClickedTimestamp {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  type: 'long' | 'short';
}

const App: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const atrSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const clickHandlerRef = useRef<((param: { time?: Time; point?: { x: number; y: number } }) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showATR, setShowATR] = useState(false);
  const [showEMA, setShowEMA] = useState(true);
  const [isLongMark, setIsLongMark] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [atrData, setAtrData] = useState<{ time: Time; value: number }[]>([]);
  const [emaData, setEmaData] = useState<{ time: Time; value: number }[]>([]);
  const [clickedTimestamps, setClickedTimestamps] = useState<ClickedTimestamp[]>(() => {
    // Initialize state from local storage
    const savedTimestamps = localStorage.getItem('clickedTimestamps');
    if (savedTimestamps) {
      try {
        const parsedTimestamps: SerializedClickedTimestamp[] = JSON.parse(savedTimestamps);
        return parsedTimestamps.map(ts => ({
          ...ts,
          time: ts.time as Time
        }));
      } catch (error) {
        console.error('Error loading initial timestamps:', error);
        return [];
      }
    }
    return [];
  });

  // Add backtesting parameters state
  const [backtestParams, setBacktestParams] = useState({
    entryPrice: 'close' as 'close' | 'open' | 'low' | 'high',
    stopLossType: 'atr' as 'atr' | 'close' | 'open' | 'low' | 'high',
    stopLossATR: 2,
    takeProfitMultiplier: 2,
  });

  // Effect to save timestamps to local storage
  useEffect(() => {
    if (clickedTimestamps.length > 0) {
      const serializedTimestamps: SerializedClickedTimestamp[] = clickedTimestamps.map(ts => ({
        ...ts,
        time: Number(ts.time)
      }));
      localStorage.setItem('clickedTimestamps', JSON.stringify(serializedTimestamps));
    } else {
      localStorage.removeItem('clickedTimestamps');
    }
  }, [clickedTimestamps]);

  // Effect to update chart markers when timestamps change
  useEffect(() => {
    const candlestickSeries = candlestickSeriesRef.current;
    if (candlestickSeries && clickedTimestamps.length > 0) {
      try {
        candlestickSeries.setMarkers(
          clickedTimestamps.map(ts => ({
            time: ts.time,
            position: ts.position,
            color: ts.color,
            shape: ts.shape,
            text: ts.text,
          }))
        );
      } catch (error) {
        console.error('Error setting markers:', error);
      }
    }
  }, [clickedTimestamps, isDarkMode]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!chartRef.current) return;

      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) return;

      // Get the current bar spacing
      const barSpacing = timeScale.options().barSpacing || 6;
      
      if (event.key === 'ArrowRight') {
        // Move one bar to the right
        const newFrom = Number(visibleRange.from) + barSpacing;
        const newTo = Number(visibleRange.to) + barSpacing;
        timeScale.setVisibleRange({
          from: newFrom as Time,
          to: newTo as Time,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const backgroundColor = isDarkMode ? '#1a1a1a' : '#ffffff';
    const textColor = isDarkMode ? '#d1d5db' : '#333333';
    const gridColor = isDarkMode ? '#2d2d2d' : '#f0f0f0';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: 600,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Create ATR series
    const atrSeries = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      title: 'ATR (14)',
      visible: showATR,
    });

    // Create EMA series
    const emaSeries = chart.addLineSeries({
      color: '#FFA500',
      lineWidth: 2,
      title: 'EMA (37)',
      visible: showEMA,
    });

    atrSeriesRef.current = atrSeries;
    emaSeriesRef.current = emaSeries;
    candlestickSeriesRef.current = candlestickSeries;
    chartRef.current = chart;

    // Load and process CSV data
    const loadData = async () => {
      try {
        // Fetch the manifest file that lists all available CSV files
        const manifestResponse = await fetch('historical/manifest.json');
        if (!manifestResponse.ok) {
          throw new Error('Failed to fetch file manifest');
        }
        const manifest: FileManifest = await manifestResponse.json();
        const files = manifest.files.map(file => `historical/${file}`);

        if (files.length === 0) {
          throw new Error('No CSV files found in the manifest');
        }

        console.log(`Loading ${files.length} files...`);

        const loadFile = async (file: string): Promise<CandleData[]> => {
          try {
            console.log(`Fetching file: ${file}`);
            const response = await fetch(file);
            
            if (!response.ok) {
              console.error(`HTTP error for ${file}:`, response.status, response.statusText);
              throw new Error(`Failed to fetch ${file}: ${response.status} ${response.statusText}`);
            }

            const csvText = await response.text();
            
            return new Promise((resolve, reject) => {
              Papa.parse<CSVRow>(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results: ParseResult<CSVRow>) => {
                  if (results.data.length === 0) {
                    console.warn(`No data rows found in ${file}`);
                  }
                  if (results.errors && results.errors.length > 0) {
                    console.warn(`Parse errors in ${file}:`, results.errors);
                  }

                  const data = results.data
                    .filter(row => {
                      const isValid = 
                        row &&
                        row.open_time && !isNaN(parseInt(row.open_time)) &&
                        row.open && !isNaN(parseFloat(row.open)) &&
                        row.high && !isNaN(parseFloat(row.high)) &&
                        row.low && !isNaN(parseFloat(row.low)) &&
                        row.close && !isNaN(parseFloat(row.close)) &&
                        row.volume && !isNaN(parseFloat(row.volume));
                      
                      return isValid;
                    })
                    .map((row) => ({
                      time: parseInt(row.open_time) / 1000 as Time,
                      open: parseFloat(row.open),
                      high: parseFloat(row.high),
                      low: parseFloat(row.low),
                      close: parseFloat(row.close),
                      volume: parseFloat(row.volume),
                    }));

                  resolve(data);
                },
                error: (error) => {
                  console.error(`Error parsing ${file}:`, error);
                  reject(error);
                },
              });
            });
          } catch (error) {
            console.error(`Error loading ${file}:`, error);
            throw error;
          }
        };

        const allData = await Promise.all(files.map(loadFile));
        const flattenedData = allData.flat();

        if (flattenedData.length === 0) {
          throw new Error('No valid data points found in the CSV files.');
        }

        // Sort data by time
        flattenedData.sort((a, b) => Number(a.time) - Number(b.time));
        
        // Calculate ATR using technicalindicators library
        const atrPeriod = 14;
        const atrResult = ATR.calculate({
          high: flattenedData.map(d => d.high),
          low: flattenedData.map(d => d.low),
          close: flattenedData.map(d => d.close),
          period: atrPeriod
        });

        // Calculate EMA using technicalindicators library
        const emaPeriod = 37;
        const emaResult = EMA.calculate({
          values: flattenedData.map(d => d.close),
          period: emaPeriod
        });

        // Map ATR values to the required format
        const atrValues = flattenedData.slice(atrPeriod - 1).map((candle, index) => ({
          time: candle.time,
          value: atrResult[index]
        }));

        // Map EMA values to the required format
        const emaValues = flattenedData.slice(emaPeriod - 1).map((candle, index) => ({
          time: candle.time,
          value: emaResult[index]
        }));

        setAtrData(atrValues);
        setEmaData(emaValues);

        if (showATR) {
          atrSeries.setData(atrValues);
        }
        if (showEMA) {
          emaSeries.setData(emaValues);
        }

        // Calculate price change
        const firstPrice = flattenedData[0].close;
        const lastPrice = flattenedData[flattenedData.length - 1].close;
        setCurrentPrice(lastPrice);
        setPriceChange(lastPrice - firstPrice);
        setPriceChangePercent(((lastPrice - firstPrice) / firstPrice) * 100);

        // Update the date range
        const startDate = new Date(Number(flattenedData[0].time) * 1000);
        const endDate = new Date(Number(flattenedData[flattenedData.length - 1].time) * 1000);
        setDateRange({ start: startDate, end: endDate });
        
        candlestickSeries.setData(flattenedData);
        chart.timeScale().fitContent();
        
        // Apply markers after data is loaded
        if (clickedTimestamps.length > 0) {
          try {
            candlestickSeries.setMarkers(
              clickedTimestamps.map(ts => ({
                time: ts.time,
                position: ts.position,
                color: ts.color,
                shape: ts.shape,
                text: ts.text,
              }))
            );
          } catch (error) {
            console.error('Error setting initial markers:', error);
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
        setLoading(false);
      }
    };

    loadData();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        atrSeriesRef.current = null;
        emaSeriesRef.current = null;
      }
    };
  }, [isDarkMode]);

  // Add click handler effect that depends on isLongMark
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const chart = chartRef.current;
    const candlestickSeries = candlestickSeriesRef.current;

    // Clean up previous subscription if it exists
    if (clickHandlerRef.current) {
      chart.unsubscribeClick(clickHandlerRef.current);
    }

    const clickHandler = (param: { time?: Time; point?: { x: number; y: number } }) => {
      if (param.time && param.point) {
        const clickedTime = param.time;
        setClickedTimestamps(prev => {
          // Check if timestamp already exists in the current state
          const timestampExists = prev.some(ts => Number(ts.time) === Number(clickedTime));
          
          if (!timestampExists) {
            const newTimestamp: ClickedTimestamp = {
              time: clickedTime,
              position: isLongMark ? 'aboveBar' : 'belowBar',
              color: isLongMark ? (isDarkMode ? '#4ade80' : '#22c55e') : (isDarkMode ? '#f87171' : '#ef4444'),
              shape: isLongMark ? 'arrowUp' : 'arrowDown',
              text: new Date(Number(clickedTime) * 1000).toLocaleString(),
              type: isLongMark ? 'long' : 'short'
            };
            
            const newTimestamps = [...prev, newTimestamp];
            // Sort timestamps by time in ascending order
            newTimestamps.sort((a, b) => Number(a.time) - Number(b.time));
            
            // Update markers immediately after state update
            candlestickSeries.setMarkers(
              newTimestamps.map(ts => ({
                time: ts.time,
                position: ts.position,
                color: ts.color,
                shape: ts.shape,
                text: ts.text,
              }))
            );
            return newTimestamps;
          }
          return prev; // Return previous state if timestamp exists
        });
      }
    };

    // Store the handler in the ref
    clickHandlerRef.current = clickHandler;

    // Subscribe to clicks
    chart.subscribeClick(clickHandler);

    return () => {
      if (clickHandlerRef.current) {
        chart.unsubscribeClick(clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
    };
  }, [isLongMark, isDarkMode]);

  // Effect to handle ATR visibility
  useEffect(() => {
    if (atrSeriesRef.current) {
      atrSeriesRef.current.applyOptions({ visible: showATR });
      if (showATR && atrData.length > 0) {
        atrSeriesRef.current.setData(atrData);
      }
    }
  }, [showATR, atrData]);

  // Effect to handle EMA visibility
  useEffect(() => {
    if (emaSeriesRef.current) {
      emaSeriesRef.current.applyOptions({ visible: showEMA });
      if (showEMA && emaData.length > 0) {
        emaSeriesRef.current.setData(emaData);
      }
    }
  }, [showEMA, emaData]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const toggleATR = () => {
    setShowATR(!showATR);
  };

  const toggleEMA = () => {
    setShowEMA(!showEMA);
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                ETH/USDT Chart
              </h1>
              {currentPrice && (
                <div className="mt-2">
                  <span className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    ${currentPrice.toFixed(2)}
                  </span>
                  <span className={`ml-2 ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {priceChange >= 0 ? '▲' : '▼'} ${Math.abs(priceChange).toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
              {dateRange && (
                <div className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {dateRange.start.toLocaleDateString()} - {dateRange.end.toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setIsLongMark(!isLongMark)}
                className={`px-4 py-2 rounded-lg ${
                  isDarkMode 
                    ? `${isLongMark ? 'bg-green-600' : 'bg-red-600'} text-white hover:${isLongMark ? 'bg-green-500' : 'bg-red-500'}` 
                    : `${isLongMark ? 'bg-green-500' : 'bg-red-500'} text-white hover:${isLongMark ? 'bg-green-400' : 'bg-red-400'}`
                } transition-colors duration-200 shadow-sm`}
              >
                {isLongMark ? 'Long Mark' : 'Short Mark'}
              </button>
              <button
                onClick={toggleEMA}
                className={`px-4 py-2 rounded-lg ${
                  isDarkMode 
                    ? `${showEMA ? 'bg-orange-600' : 'bg-gray-700'} text-white hover:bg-orange-500` 
                    : `${showEMA ? 'bg-orange-500' : 'bg-white'} ${showEMA ? 'text-white' : 'text-gray-800'} hover:bg-orange-100`
                } transition-colors duration-200 shadow-sm`}
              >
                EMA (37)
              </button>
              <button
                onClick={toggleATR}
                className={`px-4 py-2 rounded-lg ${
                  isDarkMode 
                    ? `${showATR ? 'bg-blue-600' : 'bg-gray-700'} text-white hover:bg-blue-500` 
                    : `${showATR ? 'bg-blue-500' : 'bg-white'} ${showATR ? 'text-white' : 'text-gray-800'} hover:bg-blue-100`
                } transition-colors duration-200 shadow-sm`}
              >
                ATR (14)
              </button>
              <button
                onClick={toggleDarkMode}
                className={`px-4 py-2 rounded-lg ${
                  isDarkMode 
                    ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-white text-gray-800 hover:bg-gray-100'
                } transition-colors duration-200 shadow-sm`}
              >
                {isDarkMode ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-sm">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          </div>
        )}

        {loading && (
          <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg shadow-sm">
            <div className="flex items-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              Loading data...
            </div>
          </div>
        )}

        <div 
          ref={chartContainerRef} 
          className={`w-full rounded-lg shadow-lg overflow-hidden ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          } transition-colors duration-200`}
        />

        <div className={`mt-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Data source: Binance Historical Data
        </div>

        {clickedTimestamps.length > 0 && (
          <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
            {/* Backtesting Parameters Panel */}
            <div className="mb-6">
              <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Backtesting Parameters
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Entry Price Selection */}
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Entry Price
                  </label>
                  <select
                    value={backtestParams.entryPrice}
                    onChange={(e) => setBacktestParams(prev => ({
                      ...prev,
                      entryPrice: e.target.value as 'close' | 'open' | 'low' | 'high'
                    }))}
                    className={`w-full rounded-md border ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    <option value="close">Close</option>
                    <option value="open">Open</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {/* Stop Loss Type and Value */}
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Stop Loss Type
                  </label>
                  <select
                    value={backtestParams.stopLossType}
                    onChange={(e) => setBacktestParams(prev => ({
                      ...prev,
                      stopLossType: e.target.value as 'atr' | 'close' | 'open' | 'low' | 'high'
                    }))}
                    className={`w-full rounded-md border ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2`}
                  >
                    <option value="atr">ATR</option>
                    <option value="close">Close</option>
                    <option value="open">Open</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                  </select>
                  
                  {backtestParams.stopLossType === 'atr' && (
                    <div className="mt-2">
                      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        ATR Multiplier
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={backtestParams.stopLossATR}
                        onChange={(e) => setBacktestParams(prev => ({
                          ...prev,
                          stopLossATR: parseFloat(e.target.value)
                        }))}
                        className={`w-full rounded-md border ${
                          isDarkMode 
                            ? 'bg-gray-600 border-gray-500 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                        } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                    </div>
                  )}
                </div>

                {/* Take Profit Multiplier */}
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Take Profit (x Stop Loss)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={backtestParams.takeProfitMultiplier}
                    onChange={(e) => setBacktestParams(prev => ({
                      ...prev,
                      takeProfitMultiplier: parseFloat(e.target.value)
                    }))}
                    className={`w-full rounded-md border ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  />
                </div>
              </div>
            </div>

            {/* Existing Timestamps List */}
            <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Marked Timestamps
            </h3>
            <div className="space-y-2">
              {clickedTimestamps.map((ts, index) => (
                <div 
                  key={index} 
                  className={`flex items-center justify-between p-2 rounded ${
                    isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ts.type === 'long' 
                        ? (isDarkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800')
                        : (isDarkMode ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800')
                    }`}>
                      {ts.type === 'long' ? 'Long' : 'Short'}
                    </span>
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                      {ts.text}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setClickedTimestamps(prev => prev.filter((_, i) => i !== index));
                    }}
                    className={`p-1 rounded-full ${
                      isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App; 