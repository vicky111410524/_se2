from datetime import date
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

COLUMNS = ["日期", "分類", "項目名稱", "金額"]
CATEGORIES = ["餐飲", "交通", "娛樂", "購物", "居住", "其他"]
DATA_FILE = Path(__file__).with_name("expenses.csv")


def ensure_data_file():
    if not DATA_FILE.exists():
        pd.DataFrame(columns=COLUMNS).to_csv(
            DATA_FILE, index=False, encoding="utf-8-sig"
        )


def load_expenses():
    if DATA_FILE.stat().st_size == 0:
        return pd.DataFrame(columns=COLUMNS)

    try:
        df = pd.read_csv(DATA_FILE, encoding="utf-8-sig")
    except pd.errors.EmptyDataError:
        return pd.DataFrame(columns=COLUMNS)

    for column in COLUMNS:
        if column not in df.columns:
            df[column] = None

    df = df[COLUMNS].copy()
    df["金額"] = pd.to_numeric(df["金額"], errors="coerce").fillna(0)
    return df


def save_expenses(df):
    df.to_csv(DATA_FILE, index=False, encoding="utf-8-sig")


st.set_page_config(
    page_title="個人理財記帳與可視化儀表板",
    page_icon="📊",
    layout="wide",
)

ensure_data_file()
df = load_expenses()

with st.sidebar:
    st.header("新增記帳")
    with st.form("expense_form", clear_on_submit=True):
        expense_date = st.date_input("日期", value=date.today())
        category = st.selectbox("分類", CATEGORIES)
        item_name = st.text_input("項目名稱", placeholder="例如：午餐")
        amount = st.number_input(
            "金額", min_value=1, value=100, step=1, format="%d"
        )
        submitted = st.form_submit_button("新增紀錄", width="stretch")

    if submitted:
        if not item_name.strip():
            st.error("請輸入項目名稱。")
        else:
            new_record = pd.DataFrame(
                [
                    {
                        "日期": expense_date.isoformat(),
                        "分類": category,
                        "項目名稱": item_name.strip(),
                        "金額": amount,
                    }
                ]
            )
            save_expenses(pd.concat([df, new_record], ignore_index=True))
            st.session_state["flash_message"] = "已新增紀錄。"
            st.rerun()

st.title("📊 個人理財記帳與可視化儀表板")

flash_message = st.session_state.pop("flash_message", None)
if flash_message:
    st.success(flash_message)

total_amount = df["金額"].sum()
record_count = len(df)

metric_col1, metric_col2 = st.columns(2)
metric_col1.metric("總支出金額", f"NT$ {total_amount:,.0f}")
metric_col2.metric("總記帳筆數", f"{record_count:,} 筆")

if df.empty:
    st.info("目前尚無記帳資料，請從左側側邊欄新增第一筆紀錄。")
else:
    chart_col1, chart_col2 = st.columns(2)

    category_summary = df.groupby("分類", as_index=False)["金額"].sum()
    category_fig = px.pie(
        category_summary,
        names="分類",
        values="金額",
        hole=0.45,
        title="各類別支出比例",
    )
    category_fig.update_layout(margin=dict(t=60, b=20, l=20, r=20))
    chart_col1.plotly_chart(category_fig, width="stretch")

    trend_df = df.copy()
    trend_df["日期"] = pd.to_datetime(trend_df["日期"], errors="coerce")
    trend_df = trend_df.dropna(subset=["日期"])

    if trend_df.empty:
        chart_col2.info("日期資料格式不正確，無法繪製每日支出趨勢。")
    else:
        daily_summary = (
            trend_df.assign(日期=trend_df["日期"].dt.strftime("%Y-%m-%d"))
            .groupby("日期", as_index=False)["金額"]
            .sum()
        )
        trend_fig = px.bar(
            daily_summary,
            x="日期",
            y="金額",
            title="每日支出趨勢",
            text_auto=True,
        )
        trend_fig.update_layout(
            margin=dict(t=60, b=20, l=20, r=20),
            xaxis_title="日期",
            yaxis_title="支出金額",
        )
        chart_col2.plotly_chart(trend_fig, width="stretch")

st.subheader("歷史紀錄")
st.dataframe(
    df,
    width="stretch",
    hide_index=True,
    column_config={
        "金額": st.column_config.NumberColumn("金額", format="NT$ %d"),
    },
)

if df.empty:
    st.button("清空所有紀錄", disabled=True)
elif not st.session_state.get("confirm_clear", False):
    if st.button("清空所有紀錄"):
        st.session_state["confirm_clear"] = True
        st.rerun()
else:
    st.warning("確定要清空所有記帳紀錄嗎？此操作無法復原。")
    confirm_col1, confirm_col2 = st.columns(2)
    if confirm_col1.button("確認清空", type="primary", width="stretch"):
        save_expenses(pd.DataFrame(columns=COLUMNS))
        st.session_state["confirm_clear"] = False
        st.session_state["flash_message"] = "所有記帳紀錄已清空。"
        st.rerun()
    if confirm_col2.button("取消", width="stretch"):
        st.session_state["confirm_clear"] = False
        st.rerun()
