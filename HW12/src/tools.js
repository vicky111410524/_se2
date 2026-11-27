export const tools = [
  {
    type: "function",
    function: {
      name: "get_time",
      description: "取得指定時區目前時間",
      parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "計算數學表達式",
      parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "取得城市天氣（示範用假資料）",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_todos",
      description: "列出待辦事項",
      parameters: { type: "object", properties: {} },
    },
  },
];

const fakeTodos = ["完成 HW12 報告", "複習 LLM tool calling", "測試 agent loop"];

export function runTool(name, args) {
  if (name === "get_time") return { timezone: args.timezone, now: new Date().toLocaleString("sv-SE", { timeZone: args.timezone || "UTC" }) };
  if (name === "calculate") {
    if (!/^[0-9\.\+\-\*\/\(\)\s]+$/.test(args.expression)) throw new Error("Unsafe expression");
    // eslint-disable-next-line no-eval
    return { expression: args.expression, result: Function(`"use strict"; return (${args.expression})`)() };
  }
  if (name === "get_weather") return { city: args.city, weather: "sunny", tempC: 26, source: "mock" };
  if (name === "list_todos") return { todos: fakeTodos };
  throw new Error(`Unknown tool: ${name}`);
}
