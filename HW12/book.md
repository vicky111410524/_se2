# 《從零手刻 AI Agent：不依賴任何框架的底層實作指南》

> **寫給讀者的話：**
> 市面上的 AI 開發教學往往一上來就教你 `pip install langchain` 或各種高階框架。框架雖然方便，卻把最核心的運作邏輯藏在層層封裝的「黑盒子」裡——一旦系統報錯或行為失控，你根本無從下手除錯。
> 
> 本書反其道而行：**我們不使用任何 Agent 框架**，只用 Python 內建標準庫與最基礎的 HTTP 請求（或官方極簡 SDK），帶你親手把「單純的文字接龍 API」一步步組裝成「會思考、會用工具、能自我修正的自主 AI Agent」。

---

## 第一章：打破黑盒子——LLM API 的本質其實只是「文字接龍」

### 1.1 生活化類比：健忘但博學的筆友
想像你有一位無所不知、但患有「順行性遺忘症」（只有幾秒鐘記憶）的超級天才筆友。
你每次寫信問他問題，他都會根據你信紙上寫的所有內容，用極高的機率推測「接下來最合理的幾個字是什麼」，寫完後把信寄回給你，然後**立刻忘記剛才發生過的一切**。

這就是大型語言模型（LLM）API 的全部真相。它不是一個一直開著機、在雲端幫你記住一切的「真人」，而是一個**無狀態（Stateless）的文字接龍引擎**。

### 1.2 資料流向圖解
當你呼叫 LLM API 時，資料在網路上的流動非常單純，就是一次標準的 HTTP POST 請求：

```text
[ 你的 Python 程式 ]                                [ LLM 雲端伺服器 (如 OpenAI / Gemini) ]
        |                                                            |
        |  1. HTTP POST 請求 (打包 JSON 格式的對話紀錄)               |
        | ---------------------------------------------------------> |
        |                                                            |  2. 讀取整串陣列
        |                                                            |     計算下一個最合理的 Token
        |  3. HTTP 200 回應 (回傳模型接龍出來的文字 JSON)             |
        | <--------------------------------------------------------- |
        |                                                            |
   (伺服器立刻清空記憶體，忘記剛才的請求)
```

### 1.3 實作：不用任何 AI 套件，純用 `requests` 呼叫模型
為了徹底破除黑盒子，我們甚至不用官方 SDK，直接用 Python 最基礎的 `requests` 套件發送 HTTP 請求（以相容 OpenAI 格式的標準端點為例）：

```python
import os
import requests
import json

# 1. 設定 API 端點與金鑰
API_URL = "https://api.openai.com/v1/chat/completions"
API_KEY = os.environ.get("OPENAI_API_KEY", "你的_API_KEY")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# 2. 核心資料結構：messages 陣列
# 透過三種角色（role）來模擬對話劇本
payload = {
    "model": "gpt-4o-mini",
    "temperature": 0.7,  # 控制隨機性：0 越精準死板，1 越有創意
    "messages": [
        {"role": "system", "content": "你是一個講話簡潔俐落的資深工程師。"},
        {"role": "user", "content": "用一句話解釋什麼是 HTTP POST？"}
    ]
}

# 3. 發送請求並解析回傳的 JSON
response = requests.post(API_URL, headers=headers, json=payload)
result = response.json()

# 4. 取出模型接龍出來的文字
ai_reply = result["choices"][0]["message"]["content"]
print("AI 回覆：", ai_reply)
```

---

## 第二章：賦予金魚腦記憶——狀態管理與 Context Window 的極限遊戲

### 2.1 為什麼 AI 記得你上一句說什麼？
既然伺服器是「無狀態」的，那 ChatGPT 為什麼能跟你連續聊天？
秘密在於：**是你的 Python 程式在本地端用一個 List（陣列）把所有歷史對話存起來，每次發送新問題時，都把「從第一句到現在的所有對話」全部重新打包寄給伺服器！**

```text
第 1 輪傳送: [System, User_1] -------------------> 回傳: Assistant_1
第 2 輪傳送: [System, User_1, Assistant_1, User_2] -> 回傳: Assistant_2
第 3 輪傳送: [System, User_1, Assistant_1, User_2, Assistant_2, User_3] -> ...
```

### 2.2 工程難題：滑動視窗（Sliding Window）記憶體管理
隨著對話越來越長，每次傳送的資料量（Token 數）會呈線性暴增，不僅花錢，一旦超過模型的 Context Window 上限，API 就會直接報錯崩潰。因此，我們必須自己實作記憶體管理：

```python
class MemoryManager:
    def __init__(self, system_prompt: str, max_history: int = 10):
        # 永遠保留第一條 system 指令作為人格設定
        self.system_message = {"role": "system", "content": system_prompt}
        self.history = []
        self.max_history = max_history

    def add_message(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        # 滑動視窗策略：當歷史紀錄超過上限時，丟棄最舊的對話（保留最新 N 條）
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history:]

    def get_messages(self) -> list:
        # 組合系統指令與近期對話，準備餵給 API
        return [self.system_message] + self.history

# 測試記憶體運作
mem = MemoryManager("你是一個私人助理", max_history=4)
mem.add_message("user", "我叫小明")
mem.add_message("assistant", "你好小明！")
mem.add_message("user", "我喜歡寫 Python")
mem.add_message("assistant", "Python 很棒！")
mem.add_message("user", "我剛才說我叫什麼？") # 此時最早的「我叫小明」剛好在視窗邊緣
print(json.dumps(mem.get_messages(), ensure_ascii=False, indent=2))
```

---

## 第三章：教會 AI 講規矩——結構化輸出（Structured Outputs）

### 3.1 為什麼需要結構化輸出？
如果我們要讓 AI 控制外部程式（例如查詢資料庫、控制家電），AI 回傳「好的，我現在幫你查詢台北的天氣喔！」這種人類自然語言是沒有用的，Python 程式無法穩定解析。
我們必須強迫 AI **只能吐出標準的 JSON 格式**。

### 3.2 實作：強迫模型輸出可解析的指令
現代 LLM API 支援 `response_format={"type": "json_object"}`，配合明確的 Prompt 規範，就能讓模型化身為精準的資料轉換器：

```python
def parse_user_intent(user_input: str) -> dict:
    payload = {
        "model": "gpt-4o-mini",
        "response_format": {"type": "json_object"}, # 強制開啟 JSON 模式
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一個意圖解析器。請將使用者的話轉換為 JSON 格式，"
                    "必須包含 'action' (可選: 'search', 'calculate', 'chat') "
                    "與 'parameter' 兩個欄位。"
                )
            },
            {"role": "user", "content": user_input}
        ]
    }
    res = requests.post(API_URL, headers=headers, json=payload).json()
    raw_json_str = res["choices"][0]["message"]["content"]
    
    # 安全地將字串轉為 Python 字典
    try:
        return json.loads(raw_json_str)
    except json.JSONDecodeError:
        return {"action": "chat", "parameter": user_input}
```

---

## 第四章：長出手腳的第一步——Function Calling（工具調用）的底層真相

### 4.1 業界最大誤解：模型「不會」自己執行程式！
許多初學者以為 Function Calling 是「AI 伺服器連到你的電腦上執行函數」。**完全錯誤！**
雲端模型跟你的本地環境完全隔離。Function Calling 的真實流程是一場**四步驟的雙向交握（Handshake）**：

```text
[ 你的 Python 程式 ]                                      [ LLM 雲端伺服器 ]
        |                                                          |
        | 1. 傳送問題 + 工具說明書 (Tools JSON Schema)              |
        | -------------------------------------------------------> |
        |                                                          | 2. 模型判斷自己不知道答案
        | 3. 回傳「意圖請求」(不回文字，而是回傳 tool_calls JSON)    |    決定呼叫 get_weather("台北")
        | <------------------------------------------------------- |
        |                                                          |
  [4. 你的本地 Python 程式攔截該請求]                                 |
  [   親自執行本地函數 get_weather("台北") -> 得到 "26°C, 晴天" ]     |
        |                                                          |
        | 5. 把「剛才的歷史 + 工具執行結果 (role: tool)」再寄回去     |
        | -------------------------------------------------------> |
        |                                                          | 6. 模型讀取工具結果
        | 7. 回傳最終人類自然語言：「台北目前 26°C，天氣晴朗。」      |
        | <------------------------------------------------------- |
```

### 4.2 實作：工具說明書與雙向交握
你要給模型看一份「工具說明書」（JSON Schema），讓模型知道這個函數叫什麼名字、需要什麼參數：

```python
# 1. 定義本地真實執行的 Python 函數
def get_weather(city: str) -> str:
    # 實務上這裡會接氣象局 API，這裡用模擬資料展示
    weather_db = {"台北": "26°C 晴天", "東京": "18°C 多雲"}
    return weather_db.get(city, f"找不到 {city} 的天氣資料")

# 2. 撰寫給 LLM 看的「工具說明書」
tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查詢指定城市的即時天氣狀況",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名稱，例如：台北、東京"}
                },
                "required": ["city"]
            }
        }
    }
]

# 3. 工具註冊表（方便程式根據名稱動態呼叫函數）
available_tools = {
    "get_weather": get_weather
}
```

---

## 第五章：大腦與雙手的結合——ReAct 自主迴圈（The Agent Loop）

### 5.1 什麼是 Agent？一句話講完
**Agent = LLM（大腦） + Memory（記憶） + Tools（工具） + `while` 迴圈（自主迭代控制權）。**

傳統程式是寫死的流程（`步驟A -> 步驟B -> 結束`）；而 Agent 則是把「下一步該做什麼」的決定權交給 `while` 迴圈裡的 LLM。模型會不斷重複 **Thought（思考） → Action（呼叫工具） → Observation（觀察工具回傳結果）**，直到它認為資訊已經足夠回答人類的問題，才跳出迴圈。

### 5.2 完整可執行的純手刻 ReAct Agent（無任何框架）
以下這段不到 100 行的程式碼，就是所有現代 AI Agent 框架（LangChain、AutoGen、CrewAI）最底層的心臟：

```python
import os
import json
import requests

API_URL = "https://api.openai.com/v1/chat/completions"
API_KEY = os.environ.get("OPENAI_API_KEY")

# --- 準備兩個工具：查天氣 + 數學計算 ---
def get_weather(city: str) -> str:
    data = {"台北": "28", "東京": "15"}
    return data.get(city, "20")

def calculate(expression: str) -> str:
    try:
        # 警告：生產環境應使用安全的數學解析器取代 eval
        return str(eval(expression))
    except Exception as e:
        return f"計算錯誤: {e}"

TOOLS_MAP = {
    "get_weather": get_weather,
    "calculate": calculate
}

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "取得城市氣溫（回傳純數字攝氏溫度）",
            "parameters": {
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "計算數學算式，例如 '28 - 15'",
            "parameters": {
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"]
            }
        }
    }
]

# --- 核心引擎：Agent 自主迴圈 ---
def run_agent(user_query: str, max_iterations: int = 5):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    
    # 初始化記憶體
    messages = [
        {"role": "system", "content": "你是一個善用工具解決問題的自主代理人。請逐步思考並呼叫工具。"},
        {"role": "user", "content": user_query}
    ]

    # 進入自主迴圈
    for step in range(1, max_iterations + 1):
        print(f"\n--- [第 {step} 輪思考] ---")
        
        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "tools": TOOLS_SCHEMA,
            "tool_choice": "auto" # 讓模型自己決定要「呼叫工具」還是「直接回答」
        }
        
        response = requests.post(API_URL, headers=headers, json=payload).json()
        assistant_msg = response["choices"][0]["message"]
        
        # 1. 務必把模型的回覆（無論是文字還是 tool_calls）存入記憶中！
        messages.append(assistant_msg)

        # 2. 檢查模型是否決定「結束任務並直接回答」
        if not assistant_msg.get("tool_calls"):
            print("✅ [任務完成] 模型決定直接給出最終答案：")
            return assistant_msg["content"]

        # 3. 如果模型要求呼叫工具，逐一在本地端執行
        for tool_call in assistant_msg["tool_calls"]:
            func_name = tool_call["function"]["name"]
            func_args = json.loads(tool_call["function"]["arguments"])
            call_id = tool_call["id"]
            
            print(f"🛠️ [執行工具] {func_name}({func_args})")
            
            # 執行本地 Python 函數
            if func_name in TOOLS_MAP:
                observation = TOOLS_MAP[func_name](**func_args)
            else:
                observation = f"錯誤：找不到名為 {func_name} 的工具"
                
            print(f"👀 [觀察結果] {observation}")

            # 4. 將工具執行結果以 role="tool" 塞回記憶體，準備進入下一輪迴圈
            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "name": func_name,
                "content": str(observation)
            })

    return "⚠️ 達到最大執行步數上限，強制終止任務。"

# 測試複合型任務：模型必須先查兩個城市氣溫，再自己決定呼叫計算機算溫差！
if __name__ == "__main__":
    answer = run_agent("請問台北和東京現在氣溫相差幾度？")
    print("\n最終輸出：\n", answer)
```

---

## 第六章：打造你的瑞士刀——給 Agent 接上真實世界的能力

當你掌握了第五章的迴圈，擴充 Agent 能力的本質就是**寫更多 Python 函數並註冊進 `TOOLS_SCHEMA`**。以下是三個最實用的真實世界工具設計原則：

1. **本地檔案系統工具（讀寫筆記、分析程式碼）：**
   *   **安全紅線（沙盒隔離）：** 絕對不要直接把 `os.remove` 或無限制的 `open()` 交給 AI！務必用 `os.path.abspath()` 檢查路徑，確保 AI 只能在指定的 `./workspace/` 資料夾內活動，防止「路徑穿越攻擊（Path Traversal）」誤刪系統檔案。
2. **資料庫查詢工具（Text-to-SQL）：**
   *   在 System Prompt 裡附上資料庫的 `CREATE TABLE` 結構定義，提供一個 `run_readonly_sql(query)` 工具。
   *   **安全紅線：** 資料庫連線務必使用唯讀（Read-Only）權限帳號，並在程式端攔截 `DROP`、`DELETE`、`UPDATE` 等關鍵字。
3. **本地知識庫檢索（極簡手刻 RAG）：**
   *   不需要龐大的向量資料庫。對於幾千份以內的筆記，只要將文字切成段落，呼叫 Embedding API 轉成浮點數陣列（Vector），用 NumPy 計算兩個向量的**餘弦相似度（Cosine Similarity）**，找出分數最高的前 3 段文字回傳給 Agent 即可。

---

## 第七章：別讓它變成無頭蒼蠅——錯誤處理、防呆與可觀測性

野生 Agent 在真實環境中最常遇到三大災難，以下是資深架構師的防呆設計模式：

### 7.1 災難一：工具報錯導致程式崩潰
*   **錯誤做法：** 工具函數裡發生 `FileNotFoundError` 或 SQL 語法錯誤時，直接讓 Python 程式拋出例外（Exception）當掉。
*   **正確做法（錯誤即觀察）：** 用 `try...except` 接住所有工具執行錯誤，**把完整的錯誤訊息當作 `observation` 字串回傳給 LLM**！現代 LLM 非常聰明，看到 `SQL syntax error near 'FROM'` 時，它會在下一輪迴圈自動修正 SQL 語法再試一次（這就是 **Self-Correction 自我修正**）。

### 7.2 災難二：陷入死胡同（Infinite Loop）
*   **症狀：** 模型連續 3 輪呼叫一模一樣的工具與一模一樣的參數，卻得到同樣的失敗結果。
*   **解法：**
    1.  設定硬性天花板：`max_iterations = 10`（第五章已實作）。
    2.  **重複動作偵測：** 記錄上一輪的 `(func_name, func_args)`，如果本輪完全相同，系統自動在回傳的 `observation` 後面附加一句提示：`"[系統警告] 你剛才已經用完全相同的參數呼叫過此工具且失敗了，請嘗試換一種方法或直接向使用者說明困難。"`

---

## 第八章：超越單兵作戰——多代理人協作（Multi-Agent）的極簡實作

當任務變得極度複雜（例如：「上網搜集競品資料 → 寫成分析報告 → 翻譯成日文並檢查文法」），把所有工具和規則塞進單一 Agent 會導致 Prompt 過長、模型注意力分散。

此時，多代理人協作（Multi-Agent）最優雅、最不依賴框架的實作模式叫做：**Agent-as-a-Tool（把代理人包裝成工具）**。

### 架構圖解
```text
                        [ 使用者任務 ]
                              |
                              v
                   [ 主編 Agent (Manager) ]
                     /                 \
    呼叫工具: research()               呼叫工具: translate()
           /                                     \
          v                                       v
[ 研究員 Agent (獨立迴圈) ]              [ 翻譯官 Agent (獨立迴圈) ]
  - 擁有工具: 網頁搜尋                     - 無外部工具，專精日文潤飾
  - 擁有獨立的短期記憶                     - 擁有獨立的短期記憶
```

### 極簡實作概念
你只需要把第五章的 `run_agent()` 改寫成一個類別 `Agent(name, system_prompt, tools)`，然後把「子 Agent 的執行方法」註冊為「主 Agent 的一個工具」：

```python
# 假設我們已經將第五章封裝成 Agent 類別
researcher_agent = Agent(
    name="研究員",
    system_prompt="你專精於搜尋資料並整理成客觀重點。",
    tools=[web_search_tool]
)

# 把「研究員 Agent」包裝成一個普通的 Python 函數！
def delegate_to_researcher(topic: str) -> str:
    print(f"\n📢 [任務委派] 主編正在呼叫研究員調查：{topic}")
    # 子 Agent 擁有自己獨立的 messages 陣列，做完工作只把最終結論回傳給主編
    return researcher_agent.run(f"請幫我調查以下主題並提供重點摘要：{topic}")

# 主編 Agent 只需要把 delegate_to_researcher 當作工具註冊即可！
manager_agent = Agent(
    name="總編輯",
    system_prompt="你負責統籌專案。需要查資料時請委派給研究員，最後由你撰寫完整報告。",
    tools=[delegate_to_researcher]
)
```

透過這種設計，每個子 Agent 都有乾淨獨立的 Context Window（不會互相污染記憶），而整個多代理人系統依然沒有依賴任何一行外部框架程式碼！

---

## 結語：你的下一步實戰清單

1. **環境準備：** 取得任一 LLM 服務的 API Key（OpenAI、Anthropic 或 Google Gemini 皆支援類似結構）。
2. **跑通第五章：** 將第五章的 100 行程式碼存成 `agent.py` 並實際執行，親眼觀察終端機印出的 `[第 1 輪思考] -> [執行工具] -> [觀察結果] -> [第 2 輪思考]` 過程。
3. **替換真實工具：** 把假的天氣函數換成真正能讀取你電腦某個 `.txt` 檔案的工具，讓你的第一個本地 AI 助手正式上線。