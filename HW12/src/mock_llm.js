function lastUser(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return "";
}

export async function mockChatCompletion({ messages, tools }) {
  const last = messages[messages.length - 1];
  const user = lastUser(messages);

  // Step 3/4: after tool result, decide next action.
  if (last.role === "tool") {
    const hasTodos = messages.some((m) => m.role === "tool" && m.name === "list_todos");
    const hasTime = messages.some((m) => m.role === "tool" && m.name === "get_time");
    const isPlanning = /規劃|安排|plan/.test(user);
    if (isPlanning && (!hasTodos || !hasTime)) {
      if (!hasTodos) return toolCall("list_todos", {});
      if (!hasTime) return toolCall("get_time", { timezone: "Asia/Taipei" });
    }
    const toolMsgs = messages.filter((m) => m.role === "tool").map((m) => `${m.name}: ${m.content}`);
    if (isPlanning) {
      return wrap(`根據工具結果：\n- ${toolMsgs.join("\n- ")}\n\n建議：先做最重要的「完成 HW12 報告」，再複習 tool calling，最後測試 agent loop。`);
    }
    return wrap(`根據工具結果：\n- ${toolMsgs.join("\n- ")}\n\n我已完成查詢並整理給你。`);
  }

  // Tool calling decision for agent/tool demo.
  const hasTools = tools?.length;
  if (hasTools && /天氣|weather/i.test(user)) {
    return toolCall("get_weather", { city: /台北|taipei/i.test(user) ? "Taipei" : "Tokyo" });
  }
  if (hasTools && /時間|time/i.test(user)) {
    return toolCall("get_time", { timezone: "Asia/Taipei" });
  }
  if (hasTools && /計算|算|calculate|[0-9]+\s*[\+\-\*\/]/.test(user)) {
    const expr = (user.match(/[0-9\.\+\-\*\/\(\)\s]+/) || ["1+1"])[0].trim();
    return toolCall("calculate", { expression: expr });
  }
  if (hasTools && /待辦|todo|任務/.test(user)) {
    return toolCall("list_todos", {});
  }
  if (hasTools && /規劃|幫我|安排|plan/.test(user)) {
    // Agent demo: first fetch todos, then time, then final answer.
    const hasTodos = messages.some((m) => m.role === "tool" && m.name === "list_todos");
    const hasTime = messages.some((m) => m.role === "tool" && m.name === "get_time");
    if (!hasTodos) return toolCall("list_todos", {});
    if (!hasTime) return toolCall("get_time", { timezone: "Asia/Taipei" });
  }

  if (/agent/i.test(user) && /什麼/.test(user)) {
    return wrap("Agent 是以 LLM 為核心，結合工具、記憶與迴圈，能自主規劃並執行步驟來達成目標的系統。");
  }
  if (messages.length > 2) return wrap(`我記得前文。你剛問：「${user}」。在 Chat 模式下，模型會根據 messages 歷史回答。`);
  return wrap(`LLM API 的基本形式是：輸入 prompt，模型產生 completion。你問的是：「${user}」`);
}

function wrap(content) {
  return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] };
}

function toolCall(name, args) {
  return {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id: `call_${name}_${Date.now()}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
      finish_reason: "tool_calls",
    }],
  };
}
