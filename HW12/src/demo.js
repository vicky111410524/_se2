import { run as step1 } from "./01_llm_api.js";
import { run as step2 } from "./02_chat.js";
import { run as step3 } from "./03_tool_calling.js";
import { run as step4 } from "./04_agent.js";

await step1();
await step2();
await step3();
await step4();

console.log("\n=== Summary ===");
console.log("LLM API -> Chat(messages) -> Tool Calling -> Agent(loop)");
