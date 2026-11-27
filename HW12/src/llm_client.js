import { mockChatCompletion } from "./mock_llm.js";

export async function chatCompletion({ messages, tools = [], model = process.env.OPENAI_MODEL || "gpt-4o-mini" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return mockChatCompletion({ messages, tools, model: "mock-llm" });

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, tools: tools.length ? tools : undefined }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function assistantMessage(response) {
  return response.choices[0].message;
}
