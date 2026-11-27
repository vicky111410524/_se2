# HW12 - 從 LLM API 到 Agent 是怎麼建構出來的

AI 對話:https://share.gemini.google/FhuhCcqbvqf0


這個專案用最小可執行的 Node.js 範例，展示從「呼叫 LLM API」一路演進到「Agent」的四個階段。

## 執行

```bash
cd HW12
npm run demo      # 一次跑完 4 個階段
npm run step1     # 01: 基本 LLM API
npm run step2     # 02: Chat / Messages
npm run step3     # 03: Tool Calling
npm run step4     # 04: Agent Loop
```

預設使用內建 `mock LLM`，不需要 API key，也能看到完整流程。  
若要接真實 OpenAI-compatible API：

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_BASE_URL="https://api.openai.com/v1"   # 可選
$env:OPENAI_MODEL="gpt-4o-mini"                    # 可選
npm run demo
```

## 核心演進

| 階段 | 檔案 | 新增的能力 | 關鍵概念 |
|---|---|---|---|
| 1. LLM API | `src/01_llm_api.js` | 單次文字生成 | prompt -> completion |
| 2. Chat | `src/02_chat.js` | 多輪對話 | messages / role / context |
| 3. Tool Calling | `src/03_tool_calling.js` | 模型可要求外部工具 | tools schema, tool_calls, tool result |
| 4. Agent | `src/04_agent.js` | 自主迴圈直到完成 | observe -> think -> act -> observe |

## 1. LLM API

最底層只是「輸入文字，輸出文字」。

```js
const result = await llm.complete("用一句話解釋什麼是 Agent");
```

限制：沒有對話歷史、不會用工具、不會自行規劃多步驟。

## 2. Chat / Messages

把輸入改成 `messages` 陣列，讓模型有角色與上下文。

```js
[
  { role: "system", content: "你是助教" },
  { role: "user", content: "什麼是 LLM API?" },
  { role: "assistant", content: "..." },
  { role: "user", content: "那 Agent 呢?" }
]
```

限制：模型還是只能「說」，不能「做」。

## 3. Tool Calling

給模型工具說明書（JSON Schema）。模型不直接執行工具，而是回傳 `tool_calls`；程式執行工具後，再把結果以 `role: "tool"` 放回 messages。

```js
tools = [{ type: "function", function: { name: "get_weather", parameters: ... } }]
// model -> tool_calls
// program -> executes get_weather
// messages += { role: "tool", content: result }
// model -> final answer
```

這一步把 LLM 從「文字生成器」變成「能決定何時使用能力的控制器」。

## 4. Agent

Agent = LLM + Tools + Memory/State + Loop + Goal。

```text
user goal
  -> LLM 思考
  -> 需要工具? 是 -> 執行工具 -> 結果寫回 messages -> 回到 LLM
              否 -> 回傳最終答案
```

`src/04_agent.js` 實作了最小 agent loop：

1. 接收使用者目標。
2. 呼叫 LLM，附上 tools。
3. 若有 `tool_calls`，執行對應工具並把結果 append 回 messages。
4. 重複直到模型不再要求工具，或達到最大步數。

## 檔案

- `src/mock_llm.js`: 模擬 OpenAI chat completions 格式，離線可跑。
- `src/tools.js`: Agent 可用工具（時間、計算、待辦查詢）。
- `src/01_llm_api.js` ~ `src/04_agent.js`: 四個演進階段。
- `src/demo.js`: 串起全部示範。
