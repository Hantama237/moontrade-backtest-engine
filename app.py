import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import numpy as np

st.title("📊 Backtest Engine with Candlestick Chart")

# --- Load Data ---
uploaded_file = st.file_uploader("Upload OHLCV CSV", type=["csv"], key="uploader")
if uploaded_file:
    df = pd.read_csv(uploaded_file)

    # Rename and convert timestamp
    df.rename(columns={
        "open_time": "Date",
        "open": "Open",
        "high": "High",
        "low": "Low",
        "close": "Close",
        "volume": "Volume"
    }, inplace=True)
    df["Date"] = pd.to_datetime(df["Date"], unit='ms')  # Convert timestamp from milliseconds
    df.set_index("Date", inplace=True)
    df.sort_index(inplace=True)

    st.write("Data Preview:", df.tail())

    # --- Candlestick Chart ---
    fig = go.Figure(data=[go.Candlestick(
        x=df.index,
        open=df['Open'],
        high=df['High'],
        low=df['Low'],
        close=df['Close'],
        name="OHLC"
    )])

    # --- Entry Points Input ---
    st.subheader("🔖 Trade Entry Points")
    entries_input = st.text_area("Enter entry timestamps (e.g., 2024-06-14 12:00:00), one per line:")
    entry_dates = []
    for line in entries_input.splitlines():
        try:
            dt = pd.to_datetime(line.strip())
            if dt in df.index:
                entry_dates.append(dt)
        except:
            pass
    st.write(f"Valid entries found: {len(entry_dates)}")

    # --- Exit Parameters ---
    st.subheader("⚙️ Exit Parameters")
    tp_pct = st.slider("Take Profit %", 1, 50, 10)
    sl_pct = st.slider("Stop Loss %", 1, 50, 5)

    # --- Backtest Logic ---
    trades = []
    for entry_date in entry_dates:
        entry_price = df.loc[entry_date, "Close"]

        forward_data = df.loc[entry_date:]
        exit_price = None
        result = None

        for date, row in forward_data.iterrows():
            if row["High"] >= entry_price * (1 + tp_pct / 100):
                exit_price = entry_price * (1 + tp_pct / 100)
                result = "TP"
                exit_date = date
                break
            elif row["Low"] <= entry_price * (1 - sl_pct / 100):
                exit_price = entry_price * (1 - sl_pct / 100)
                result = "SL"
                exit_date = date
                break
        else:
            exit_price = df.iloc[-1]["Close"]
            result = "Open"
            exit_date = df.index[-1]

        trades.append({
            "Entry Date": entry_date,
            "Entry Price": entry_price,
            "Exit Date": exit_date,
            "Exit Price": exit_price,
            "Result": result,
            "PnL %": (exit_price - entry_price) / entry_price * 100
        })

        fig.add_trace(go.Scatter(
            x=[entry_date],
            y=[entry_price],
            mode='markers+text',
            marker=dict(color='green', size=10),
            text=["Entry"],
            name="Entry"
        ))

        fig.add_trace(go.Scatter(
            x=[exit_date],
            y=[exit_price],
            mode='markers+text',
            marker=dict(color='red', size=10),
            text=[result],
            name="Exit"
        ))

    st.plotly_chart(fig, use_container_width=True)

    # --- Result Table ---
    if trades:
        st.subheader("📋 Trade Results")
        trades_df = pd.DataFrame(trades)
        st.dataframe(trades_df)

        total_return = trades_df["PnL %"].sum()
        win_rate = (trades_df["PnL %"] > 0).mean() * 100
        st.markdown(f"**Total Return:** {total_return:.2f}%")
        st.markdown(f"**Win Rate:** {win_rate:.2f}%")
