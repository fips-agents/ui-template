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
  var safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Phase 1: Extract code blocks so they aren't parsed for markdown.
  // Replace each code block with a placeholder token.
  var codeBlocks = [];
  safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push("<pre><code>" + code.trimEnd() + "</code></pre>");
    return "\x00CODEBLOCK" + idx + "\x00";
  });

  // Phase 2: Extract inline code spans.
  var inlineCode = [];
  safe = safe.replace(/`([^`]+)`/g, function (_, code) {
    var idx = inlineCode.length;
    inlineCode.push("<code>" + code + "</code>");
    return "\x00INLINE" + idx + "\x00";
  });

  // Phase 3: Process block-level markdown on each line.
  // Split into paragraphs (double newline), then lines within paragraphs.
  var paragraphs = safe.split(/\n\n+/);
  var rendered = [];

  for (var p = 0; p < paragraphs.length; p++) {
    var para = paragraphs[p];

    // Check if this paragraph is a standalone code block placeholder
    if (/^\x00CODEBLOCK\d+\x00$/.test(para.trim())) {
      rendered.push(para.trim());
      continue;
    }

    var lines = para.split("\n");
    var out = [];
    var listType = null; // "ul" or "ol"
    var listItems = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Check for list items — flush previous list if type changes
      var ulMatch = /^(\-|\*) (.+)$/.exec(line);
      var olMatch = /^(\d+)\. (.+)$/.exec(line);

      if (ulMatch) {
        if (listType && listType !== "ul") {
          out.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
          listItems = [];
        }
        listType = "ul";
        listItems.push("<li>" + processInline(ulMatch[2]) + "</li>");
        continue;
      }

      if (olMatch) {
        if (listType && listType !== "ol") {
          out.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
          listItems = [];
        }
        listType = "ol";
        listItems.push("<li>" + processInline(olMatch[2]) + "</li>");
        continue;
      }

      // Not a list item — flush any open list
      if (listType) {
        out.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
        listType = null;
        listItems = [];
      }

      // Headers
      var headerMatch = /^(#{1,3}) (.+)$/.exec(line);
      if (headerMatch) {
        var level = headerMatch[1].length;
        out.push("<h" + level + ">" + processInline(headerMatch[2]) + "</h" + level + ">");
        continue;
      }

      // Regular line — apply inline formatting
      out.push(processInline(line));
    }

    // Flush trailing list
    if (listType) {
      out.push("<" + listType + ">" + listItems.join("") + "</" + listType + ">");
    }

    // Join non-block lines with <br> for single newlines within a paragraph.
    // Block elements (headers, lists, code blocks) are already self-contained.
    var joined = "";
    for (var j = 0; j < out.length; j++) {
      if (joined && !isBlockElement(out[j]) && !isBlockElement(out[j - 1 >= 0 ? j - 1 : 0])) {
        joined += "<br>";
      } else if (joined) {
        // no separator needed between block elements
      }
      joined += out[j];
    }

    rendered.push(joined);
  }

  // Join paragraphs — block-level elements don't need wrapping, but regular
  // text paragraphs get <p> tags when there are multiple paragraphs.
  var result;
  if (rendered.length === 1) {
    result = rendered[0];
  } else {
    var parts = [];
    for (var k = 0; k < rendered.length; k++) {
      if (isBlockElement(rendered[k])) {
        parts.push(rendered[k]);
      } else if (rendered[k].trim()) {
        parts.push("<p>" + rendered[k] + "</p>");
      }
    }
    result = parts.join("");
  }

  // Phase 4: Restore code blocks and inline code.
  result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, function (_, idx) {
    return codeBlocks[parseInt(idx, 10)];
  });
  result = result.replace(/\x00INLINE(\d+)\x00/g, function (_, idx) {
    return inlineCode[parseInt(idx, 10)];
  });

  return result;
}

function processInline(text) {
  // Links: [text](url) — process before bold/italic to avoid conflicts
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* (but not inside bold, which is already converted)
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return text;
}

function isBlockElement(html) {
  if (!html) return false;
  return /^<(h[1-3]|ul|ol|pre|p|blockquote)[\s>]/.test(html)
      || /^\x00CODEBLOCK\d+\x00$/.test(html);
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
