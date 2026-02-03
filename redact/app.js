const state = {
  activeIndex: 0,
  emails: [
    {
      to: "Jeffrey Epstein[jeevacation@gmail.com]",
      from: "<redact>REDACTED</redact>",
      sentLabel: "Sent",
      sent: "Sun 5/9/2010 10:14:50 PM",
      subject: "Re:",
      body: "Just leaving No10..will call",
      footer: "Sent from my BlackBerry® wireless device",
    },
    {
      from: "Jeffrey Epstein <jeevacation@gmail.com>",
      sentLabel: "Date",
      sent: "Sun, 9 May 2010 18:13:20 -0400",
      to: "<<redact>REDACTED</redact>>",
      subject: "Re:",
      body:
        "are you home\n\nOn Sun, May 9, 2010 at 5:39 PM, <<redact>REDACTED</redact>> wrote:\n\nSd be announced tonight",
      footer: "Sent from my BlackBerry® wireless device",
    },
    {
      from: "Jeffrey Epstein <jeevacation@gmail.com>",
      sentLabel: "Date",
      sent: "Sun, 9 May 2010 17:30:16 -0400",
      to: "PETER MANDELSON<redact>REDACTED</redact>",
      subject: "",
      body: "sources tell me 500 b euro bailout , almost compelte",
      footer: "",
    },
  ],
};

const blockList = document.getElementById("block-list");
const preview = document.getElementById("preview");
const rawJson = document.getElementById("raw-json");
const rawStatus = document.getElementById("raw-status");

const fields = {
  to: document.getElementById("field-to"),
  from: document.getElementById("field-from"),
  sentLabel: document.getElementById("field-sent-label"),
  sent: document.getElementById("field-sent"),
  subject: document.getElementById("field-subject"),
  body: document.getElementById("field-body"),
  footer: document.getElementById("field-footer"),
};

let lastFocusedInput = null;
let lastRawSync = "";

const EXPORT_LAYOUT = {
  width: 760,
  paddingX: 28,
  paddingTop: 20,
  paddingBottom: 22,
  headerLabelWidth: 90,
  headerGapX: 10,
  headerRowGap: 2,
  bodyTopMargin: 14,
  footerTopMargin: 14,
  fontFamily: "Times New Roman, Times, serif",
  fontSize: 17,
  lineHeight: 17 * 1.38,
  textColor: "#1a1a1a",
  borderColor: "#d7d7d7",
  borderWidth: 2,
  redactPadEm: 0.14,
};

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseRedactionSegments(value) {
  if (!value) {
    return [{ text: "", redacted: false }];
  }
  const useTag = /<redact>/i.test(value);
  const pattern = useTag ? /<redact>([\s\S]*?)<\/redact>/gi : /\[\[(.+?)\]\]/gs;
  const segments = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: value.slice(lastIndex, match.index), redacted: false });
    }
    segments.push({ text: match[1], redacted: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    segments.push({ text: value.slice(lastIndex), redacted: false });
  }
  if (segments.length === 0) {
    segments.push({ text: value, redacted: false });
  }
  return segments;
}

function renderText(value) {
  const segments = parseRedactionSegments(value || "");
  return segments
    .map((segment) => {
      const escaped = escapeHtml(segment.text);
      if (segment.redacted) {
        return `<span class="redact">${escaped}</span>`;
      }
      return escaped;
    })
    .join("");
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(value) {
  const html = renderText(value || "");
  return html.trim() ? html : "&nbsp;";
}

function renderMultiline(value) {
  const html = renderText(value || "");
  return html.replace(/\n/g, "<br>");
}

function renderEmailBlock(email) {
  return `
    <div class="email-block">
      <div class="email-header">
        <div class="email-label">From:</div>
        <div>${renderInline(email.from)}</div>
        <div class="email-label">${escapeHtml(email.sentLabel || "Date")}:</div>
        <div>${renderInline(email.sent)}</div>
        <div class="email-label">To:</div>
        <div>${renderInline(email.to)}</div>
        <div class="email-label">Subject:</div>
        <div>${renderInline(email.subject)}</div>
      </div>
      <div class="email-body">${renderMultiline(email.body)}</div>
      ${email.footer ? `<div class="email-footer">${renderText(email.footer)}</div>` : ""}
    </div>
  `;
}

function tokenizeRedactions(text) {
  return parseRedactionSegments(text || "");
}

function splitTokens(tokens) {
  const pieces = [];
  tokens.forEach((token) => {
    const parts = token.text.split(/(\\s+)/).filter((part) => part.length > 0);
    parts.forEach((part) => {
      pieces.push({ text: part, redacted: token.redacted });
    });
  });
  return pieces;
}

const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d");

function measureTextWidth(text, fontSize, fontFamily, fontWeight = 400) {
  measureContext.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return measureContext.measureText(text).width;
}

function wrapSegments(
  segments,
  maxWidth,
  fontSize,
  fontFamily,
  fontWeight = 400,
  redactPadEm = 0
) {
  const lines = [];
  let line = [];
  let lineWidth = 0;

  segments.forEach((segment) => {
    const isWhitespace = /^\\s+$/.test(segment.text);
    if (isWhitespace && lineWidth === 0) {
      return;
    }
    const baseWidth = measureTextWidth(segment.text, fontSize, fontFamily, fontWeight);
    const pad = segment.redacted ? fontSize * redactPadEm * 2 : 0;
    const segmentWidth = baseWidth + pad;
    if (lineWidth + segmentWidth > maxWidth && lineWidth > 0 && !isWhitespace) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    if (isWhitespace && lineWidth === 0) {
      return;
    }
    line.push({ ...segment, width: segmentWidth, baseWidth });
    lineWidth += segmentWidth;
  });

  if (line.length) {
    lines.push(line);
  }
  return lines;
}

function wrapText(text, maxWidth, fontSize, fontFamily, fontWeight = 400) {
  const tokens = tokenizeRedactions(text || "");
  const segments = splitTokens(tokens);
  return wrapSegments(
    segments,
    maxWidth,
    fontSize,
    fontFamily,
    fontWeight,
    EXPORT_LAYOUT.redactPadEm
  );
}

function wrapMultilineText(text, maxWidth, fontSize, fontFamily) {
  const paragraphs = (text || "").split("\\n");
  const lines = [];
  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push([]);
      return;
    }
    const wrapped = wrapText(paragraph, maxWidth, fontSize, fontFamily);
    if (wrapped.length === 0) {
      lines.push([]);
      return;
    }
    wrapped.forEach((line) => lines.push(line));
  });
  return lines;
}

function layoutEmailBlocks(emails, layout) {
  const elements = [];
  let cursorY = 0;
  const bodyWidth = layout.width - layout.paddingX * 2;
  const headerValueWidth = bodyWidth - layout.headerLabelWidth - layout.headerGapX;

  emails.forEach((email, index) => {
    cursorY += layout.paddingTop;
    const headerRows = [
      { label: "From:", value: email.from || "" },
      { label: `${email.sentLabel || "Date"}:`, value: email.sent || "" },
      { label: "To:", value: email.to || "" },
      { label: "Subject:", value: email.subject || "" },
    ];

    headerRows.forEach((row, rowIndex) => {
      const lines = wrapText(row.value, headerValueWidth, layout.fontSize, layout.fontFamily);
      const linesToDraw = lines.length ? lines : [[]];
      const rowHeight = linesToDraw.length * layout.lineHeight;
      const baseline = cursorY + layout.lineHeight;

      elements.push({
        type: "text",
        x: layout.paddingX,
        y: baseline,
        text: row.label,
        fontWeight: 700,
        fontSize: layout.fontSize,
        fontFamily: layout.fontFamily,
        fill: layout.textColor,
      });

      linesToDraw.forEach((lineSegments, lineIndex) => {
        const lineY = cursorY + layout.lineHeight * (lineIndex + 1);
        drawLineSegments(
          elements,
          layout.paddingX + layout.headerLabelWidth + layout.headerGapX,
          lineY,
          lineSegments,
          layout
        );
      });

      cursorY += rowHeight;
      if (rowIndex < headerRows.length - 1) {
        cursorY += layout.headerRowGap;
      }
    });

    cursorY += layout.bodyTopMargin;
    const bodyLines = wrapMultilineText(email.body || "", bodyWidth, layout.fontSize, layout.fontFamily);
    if (bodyLines.length === 0) {
      bodyLines.push([]);
    }
    bodyLines.forEach((lineSegments, lineIndex) => {
      const lineY = cursorY + layout.lineHeight * (lineIndex + 1);
      drawLineSegments(elements, layout.paddingX, lineY, lineSegments, layout);
    });
    cursorY += layout.lineHeight * bodyLines.length;

    if (email.footer) {
      cursorY += layout.footerTopMargin;
      const footerLines = wrapMultilineText(
        email.footer || "",
        bodyWidth,
        layout.fontSize,
        layout.fontFamily
      );
      footerLines.forEach((lineSegments, lineIndex) => {
        const lineY = cursorY + layout.lineHeight * (lineIndex + 1);
        drawLineSegments(elements, layout.paddingX, lineY, lineSegments, layout);
      });
      cursorY += layout.lineHeight * footerLines.length;
    }

    cursorY += layout.paddingBottom;
    if (index < emails.length - 1) {
      elements.push({
        type: "line",
        x1: 0,
        y1: cursorY,
        x2: layout.width,
        y2: cursorY,
        stroke: layout.borderColor,
        strokeWidth: layout.borderWidth,
      });
    }
  });

  return { width: layout.width, height: cursorY, elements };
}

function drawLineSegments(elements, startX, baselineY, lineSegments, layout) {
  let cursorX = startX;
  if (!lineSegments || lineSegments.length === 0) {
    return;
  }
  const rectHeight = layout.lineHeight * 0.78;
  const rectY = baselineY - rectHeight + layout.lineHeight * 0.08;

  lineSegments.forEach((segment) => {
    const width =
      segment.width ?? measureTextWidth(segment.text, layout.fontSize, layout.fontFamily);
    if (segment.redacted) {
      elements.push({
        type: "rect",
        x: cursorX,
        y: rectY,
        width,
        height: rectHeight,
        fill: "#000",
      });
    } else if (segment.text) {
      elements.push({
        type: "text",
        x: cursorX,
        y: baselineY,
        text: segment.text,
        fontWeight: 400,
        fontSize: layout.fontSize,
        fontFamily: layout.fontFamily,
        fill: layout.textColor,
      });
    }
    cursorX += width;
  });
}

function buildSvgFromLayout(layoutData) {
  const { width, height, elements } = layoutData;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff" />`,
  ];

  elements.forEach((el) => {
    if (el.type === "text") {
      parts.push(
        `<text x="${el.x}" y="${el.y}" fill="${el.fill}" font-family="${escapeXml(
          el.fontFamily
        )}" font-size="${el.fontSize}" font-weight="${el.fontWeight}">${escapeXml(
          el.text
        )}</text>`
      );
      return;
    }
    if (el.type === "rect") {
      parts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${el.fill}" />`
      );
      return;
    }
    if (el.type === "line") {
      parts.push(
        `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" />`
      );
    }
  });

  parts.push("</svg>");
  return parts.join("");
}

function renderPreviewHtml() {
  return state.emails.map(renderEmailBlock).join("");
}

function renderPreview() {
  preview.innerHTML = renderPreviewHtml();
}

function buildJsonPayload() {
  return {
    version: 1,
    emails: state.emails.map((email) => ({
      to: email.to,
      from: email.from,
      sentLabel: email.sentLabel,
      sent: email.sent,
      subject: email.subject,
      body: email.body,
      footer: email.footer,
    })),
  };
}

function updateRawJson(force = false) {
  if (!rawJson) {
    return;
  }
  if (!force && document.activeElement === rawJson) {
    return;
  }
  const json = JSON.stringify(buildJsonPayload(), null, 2);
  rawJson.value = json;
  lastRawSync = json;
}

function setRawStatus(message, isError = false) {
  if (!rawStatus) {
    return;
  }
  rawStatus.textContent = message || "";
  rawStatus.style.color = isError ? "#ff8f8f" : "var(--muted)";
}

function renderBlockList() {
  blockList.innerHTML = state.emails
    .map((email, index) => {
      const snippet = (email.subject || email.body || email.to || "")
        .replace(/\[\[|\]\]/g, "")
        .slice(0, 28);
      return `
        <div class="block-item ${index === state.activeIndex ? "active" : ""}" data-index="${index}">
          <span>Block ${index + 1}</span>
          <span>${escapeHtml(snippet || "...")}</span>
        </div>
      `;
    })
    .join("");
}

function updateEditor() {
  const email = state.emails[state.activeIndex];
  fields.to.value = email.to;
  fields.from.value = email.from;
  fields.sentLabel.value = email.sentLabel || "Sent";
  fields.sent.value = email.sent;
  fields.subject.value = email.subject;
  fields.body.value = email.body;
  fields.footer.value = email.footer;
}

function renderAll({ syncRaw = true } = {}) {
  renderPreview();
  renderBlockList();
  if (syncRaw) {
    updateRawJson();
  }
}

function setActive(index) {
  state.activeIndex = Math.max(0, Math.min(index, state.emails.length - 1));
  updateEditor();
  renderAll();
}

function addBlock() {
  const newEmail = {
    to: "",
    from: "",
    sentLabel: "Sent",
    sent: "",
    subject: "",
    body: "",
    footer: "Sent from my BlackBerry® wireless device",
  };
  state.emails.splice(state.activeIndex + 1, 0, newEmail);
  setActive(state.activeIndex + 1);
}

function duplicateBlock() {
  const current = state.emails[state.activeIndex];
  const clone = { ...current };
  state.emails.splice(state.activeIndex + 1, 0, clone);
  setActive(state.activeIndex + 1);
}

function removeBlock() {
  if (state.emails.length === 1) {
    return;
  }
  if (!window.confirm("Remove this block?")) {
    return;
  }
  state.emails.splice(state.activeIndex, 1);
  setActive(Math.min(state.activeIndex, state.emails.length - 1));
}

function moveBlock(delta) {
  const nextIndex = state.activeIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.emails.length) {
    return;
  }
  const temp = state.emails[state.activeIndex];
  state.emails[state.activeIndex] = state.emails[nextIndex];
  state.emails[nextIndex] = temp;
  setActive(nextIndex);
}

function bindInput(element, key) {
  element.addEventListener("input", () => {
    state.emails[state.activeIndex][key] = element.value;
    renderAll();
  });
}

function wrapSelectionInRedact(el) {
  if (!el || typeof el.selectionStart !== "number") {
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  const selected = value.slice(start, end);
  const insert = selected ? `<redact>${selected}</redact>` : "<redact>REDACTED</redact>";
  el.value = value.slice(0, start) + insert + value.slice(end);
  el.selectionStart = start + 8;
  el.selectionEnd = start + insert.length - 9;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleRedact() {
  wrapSelectionInRedact(lastFocusedInput || fields.body);
}

function buildMarkdownExport() {
  const blocks = state.emails.map((email, index) => {
    const body = email.body || "";
    const footer = email.footer || "";
    return [
      `## Block ${index + 1}`,
      `From: ${email.from || ""}`,
      `DateLabel: ${email.sentLabel || "Date"}`,
      `Date: ${email.sent || ""}`,
      `To: ${email.to || ""}`,
      `Subject: ${email.subject || ""}`,
      "Body:",
      "```",
      body,
      "```",
      "Footer:",
      "```",
      footer,
      "```",
    ].join("\n");
  });
  return ["# Redacted Mail Blocks", "", ...blocks.join("\n\n---\n\n").split("\n")].join("\n");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


function normalizeEmail(input = {}) {
  return {
    to: String(input.to ?? ""),
    from: String(input.from ?? ""),
    sentLabel: String(input.sentLabel ?? input.dateLabel ?? "Date"),
    sent: String(input.sent ?? input.date ?? ""),
    subject: String(input.subject ?? ""),
    body: String(input.body ?? ""),
    footer: String(input.footer ?? ""),
  };
}

function loadJsonFromTextarea() {
  if (!rawJson) {
    return;
  }
  try {
    const text = rawJson.value.trim();
    if (!text) {
      throw new Error("Paste JSON first.");
    }
    const parsed = JSON.parse(text);
    const emails = Array.isArray(parsed) ? parsed : parsed.emails;
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new Error("JSON must be an array or { emails: [...] }.");
    }
    state.emails = emails.map((entry) => normalizeEmail(entry));
    state.activeIndex = 0;
    updateEditor();
    renderAll({ syncRaw: true });
    setRawStatus(`Loaded ${state.emails.length} blocks.`);
  } catch (error) {
    setRawStatus(error.message, true);
  }
}

blockList.addEventListener("click", (event) => {
  const item = event.target.closest(".block-item");
  if (!item) {
    return;
  }
  const index = Number(item.dataset.index);
  if (!Number.isNaN(index)) {
    setActive(index);
  }
});

Object.entries(fields).forEach(([key, element]) => {
  if (key === "sentLabel") {
    element.addEventListener("change", () => {
      state.emails[state.activeIndex][key] = element.value;
      renderPreview();
      renderBlockList();
    });
    return;
  }
  bindInput(element, key);
});

Object.values(fields).forEach((element) => {
  element.addEventListener("focus", () => {
    lastFocusedInput = element;
  });
});

const addButton = document.getElementById("add-block");
const duplicateButton = document.getElementById("duplicate-block");
const removeButton = document.getElementById("remove-block");
const moveUpButton = document.getElementById("move-up");
const moveDownButton = document.getElementById("move-down");
const redactButton = document.getElementById("redact-selection");
const loadJsonButton = document.getElementById("load-json");
const refreshJsonButton = document.getElementById("refresh-json");
const downloadJsonButton = document.getElementById("download-json");
const downloadMdButton = document.getElementById("download-md");

addButton.addEventListener("click", addBlock);
duplicateButton.addEventListener("click", duplicateBlock);
removeButton.addEventListener("click", removeBlock);
moveUpButton.addEventListener("click", () => moveBlock(-1));
moveDownButton.addEventListener("click", () => moveBlock(1));
redactButton.addEventListener("click", handleRedact);
loadJsonButton.addEventListener("click", loadJsonFromTextarea);
refreshJsonButton.addEventListener("click", () => {
  updateRawJson(true);
  setRawStatus("JSON refreshed.");
});
downloadJsonButton.addEventListener("click", () => {
  const json = JSON.stringify(buildJsonPayload(), null, 2);
  downloadFile("redacted-mail.json", json, "application/json");
});
downloadMdButton.addEventListener("click", () => {
  const md = buildMarkdownExport();
  downloadFile("redacted-mail.md", md, "text/markdown");
});

updateEditor();
renderAll({ syncRaw: true });
