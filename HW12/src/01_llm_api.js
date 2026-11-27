import { chatCompletion, assistantMessage } from "./llm_client.js";

export async function run() {
  console.log("\n=== Step 1: LLM API ===");
  const messages = [{ role: "user", content: "用一句話解釋什麼是 LLM API？" }];
  const res = await chatCompletion({ messages });
  const msg = assistantMessage(res);
  console.log("User:", messages[0].content);
  console.log("Assistant:", msg.content);
  console.log("重點: 單次 prompt -> completion，沒有記憶、沒有工具。");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
