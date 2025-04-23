# 📊 Interactive Backtest Engine

An interactive, browser-based backtest engine for manually marked trades. Upload historical OHLCV data, define trade entry points, adjust take-profit/stop-loss settings on the fly, and get instant performance feedback. Built with [Streamlit](https://streamlit.io/) and [Plotly](https://plotly.com/).

---

## 🚀 Features

- 📈 Candlestick chart from CSV data
- ✍️ Mark entries manually with timestamps
- ⚙️ Globally adjustable take-profit & stop-loss %
- 📋 Trade list with PnL% and outcome (TP/SL)
- 📉 Summary stats: total return, win rate
- 🧪 Fast and simple UI powered by Streamlit

---

## 🧪 Demo

![Backtest Engine Screenshot](docs/screenshot.png)

---

## 🛠️ Tech Stack

- **Python 3.10+**
- [Streamlit](https://streamlit.io/)
- [Plotly](https://plotly.com/)
- Pandas, NumPy

---

## 📁 CSV Format

The uploaded file should be in this format:

```csv
timestamp,open,high,low,close,volume
2024-01-01 09:00:00,100,105,95,102,5000
...
