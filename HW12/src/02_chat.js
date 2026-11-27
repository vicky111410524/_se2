import { chatCompletion, assistantMessage } from "./llm_client.js";

export async function run() {
  console.log("\n=== Step 2: Chat / Messages ===");
  const messages = [
    { role: "system", content: "你是簡潔的軟體工程助教。" },
    { role: "user", content: "什麼是 LLM API？" },
  ];
  let res = await chatCompletion({ messages });
  let msg = assistantMessage(res);
  messages.push(msg);
  console.log("User:", messages[1].content);
  console.log("Assistant:", msg.content);

  messages.push({ role: "user", content: "那它和 Agent 有什麼差別？" });
  res = await chatCompletion({ messages });
  msg = assistantMessage(res);
  console.log("User:", messages[messages.length - 1].content);
  console.log("Assistant:", msg.content);
  console.log("重點: 用 messages 保留上下文，但模型仍只會產生文字。");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
