import { chatCompletion, assistantMessage } from "./llm_client.js";
import { tools, runTool } from "./tools.js";

export async function run() {
  console.log("\n=== Step 3: Tool Calling ===");
  const messages = [
    { role: "system", content: "你可以在需要時使用工具。" },
    { role: "user", content: "幫我計算 12 * (8 + 2) 是多少？" },
  ];

  let res = await chatCompletion({ messages, tools });
  let msg = assistantMessage(res);
  messages.push(msg);
  console.log("Model decides:", msg.tool_calls ? "tool_calls" : "final answer");

  if (msg.tool_calls) {
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const result = runTool(call.function.name, args);
      console.log(`Tool ${call.function.name}(${JSON.stringify(args)}) ->`, result);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
    res = await chatCompletion({ messages, tools });
    msg = assistantMessage(res);
  }

  console.log("Assistant:", msg.content);
  console.log("重點: LLM 決定何時用工具；程式執行工具；結果回餵給 LLM。");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
