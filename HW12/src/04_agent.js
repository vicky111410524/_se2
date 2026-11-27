import { chatCompletion, assistantMessage } from "./llm_client.js";
import { tools, runTool } from "./tools.js";

export async function runAgent(goal, { maxSteps = 6, verbose = true } = {}) {
  const messages = [
    { role: "system", content: "你是一個任務型 Agent。先思考需要哪些工具，必要時呼叫工具，完成後給出簡潔結論。" },
    { role: "user", content: goal },
  ];

  for (let step = 1; step <= maxSteps; step++) {
    const res = await chatCompletion({ messages, tools });
    const msg = assistantMessage(res);
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      if (verbose) console.log(`Step ${step}: final`);
      return { answer: msg.content, messages, steps: step };
    }

    if (verbose) console.log(`Step ${step}: tool_calls = ${msg.tool_calls.map((c) => c.function.name).join(", ")}`);
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const result = runTool(call.function.name, args);
      if (verbose) console.log(`  -> ${call.function.name}(${JSON.stringify(args)}) => ${JSON.stringify(result)}`);
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
    }
  }
  throw new Error("Agent exceeded maxSteps");
}

export async function run() {
  console.log("\n=== Step 4: Agent Loop ===");
  const goal = "幫我規劃今天：先看待辦，再看現在台北時間，最後給我一個簡短建議。";
  console.log("Goal:", goal);
  const result = await runAgent(goal);
  console.log("Assistant:", result.answer);
  console.log("重點: Agent = LLM + Tools + State(messages) + Loop。");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
