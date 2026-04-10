"use strict";

let messages = [];
let streaming = false;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const chatEl = document.getElementById("chat");

async function init() {
  // Server proxies /v1/* to the backend — no config discovery needed
}

function appendMessage(role, content) {
  const el = document.createElement("div");
  el.classList.add("message", role);
  el.innerHTML = renderContent(content);
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function appendError(text) {
  const el = document.createElement("div");
  el.classList.add("message", "error");
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderContent(text) {
  // Escape HTML first
  let safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks: ```lang\n...\n```
  safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
    return "<pre><code>" + code.trimEnd() + "</code></pre>";
  });

  // Inline code: `...`
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

  return safe;
}

function setStreaming(value) {
  streaming = value;
  sendBtn.disabled = value;
  inputEl.disabled = value;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || streaming) return;

  inputEl.value = "";
  autoResize();
  appendMessage("user", text);
  messages.push({ role: "user", content: text });

  const assistantEl = document.createElement("div");
  assistantEl.classList.add("message", "assistant");
  const indicator = document.createElement("span");
  indicator.classList.add("streaming-indicator");
  assistantEl.appendChild(indicator);
  messagesEl.appendChild(assistantEl);
  scrollToBottom();

  setStreaming(true);
  let fullContent = "";

  try {
    const resp = await fetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        stream: true,
      }),
    });

    if (!resp.ok) {
      throw new Error("API returned " + resp.status + ": " + resp.statusText);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            assistantEl.innerHTML = renderContent(fullContent);
            indicator.classList.add("streaming-indicator");
            assistantEl.appendChild(indicator);
            scrollToBottom();
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } catch (err) {
    if (!fullContent) {
      assistantEl.remove();
      appendError("Error: " + err.message);
      setStreaming(false);
      return;
    }
  }

  // Finalize: remove indicator, store message
  indicator.remove();
  if (fullContent) {
    assistantEl.innerHTML = renderContent(fullContent);
    messages.push({ role: "assistant", content: fullContent });
  } else {
    assistantEl.remove();
  }
  setStreaming(false);
  inputEl.focus();
}

function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
}

// Event listeners
document.getElementById("input-form").addEventListener("submit", function (e) {
  e.preventDefault();
  sendMessage();
});

inputEl.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

inputEl.addEventListener("input", autoResize);

init();
