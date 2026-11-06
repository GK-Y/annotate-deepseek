(() => {
  "use strict";

  if (window.__dsAnnotateLoaded) return;
  window.__dsAnnotateLoaded = true;

  const BUTTON_ID = "ds-annotate-pill";
  const TOAST_ID = "ds-annotate-toast";
  const EDITABLE_SELECTOR =
    "textarea, input, [contenteditable='true'], [contenteditable='']";

  let button = null;
  let toast = null;
  let toastTimer = 0;
  let hideToastTimer = 0;
  let lastSelectionText = "";
  let mouseDown = false;
  let suppressUpdateUntil = 0;

  function createUi() {
    if (document.getElementById(BUTTON_ID)) return;

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.hidden = true;
    button.setAttribute("aria-label", "Ask DeepSeek about the selected text");
    button.innerHTML = `
      <svg class="ds-annotate-pill__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2.75l2.05 5.2 5.2 2.05-5.2 2.05L12 17.25l-2.05-5.2-5.2-2.05 5.2-2.05L12 2.75z" fill="currentColor"/>
        <path d="M19.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" fill="currentColor" opacity=".8"/>
      </svg>
      <span>Ask DeepSeek</span>`;

    button.addEventListener("mousedown", (event) => {
      // Keep the page selection alive while the button is pressed.
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", onAskClick);

    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.hidden = true;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    (document.body || document.documentElement).append(button, toast);

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", hideButton, true);
    window.addEventListener("resize", hideButton, { passive: true });
  }

  function onMouseDown(event) {
    mouseDown = true;
    if (!button.contains(event.target)) hideButton();
  }

  function onMouseUp() {
    mouseDown = false;
    window.setTimeout(updateFromSelection, 10);
  }

  function onKeyUp() {
    window.setTimeout(updateFromSelection, 10);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") hideButton();
  }

  function updateFromSelection() {
    if (mouseDown || Date.now() < suppressUpdateUntil) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideButton();
      return;
    }

    const text = selection.toString();
    if (!text.trim()) {
      hideButton();
      return;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element =
      container.nodeType === Node.ELEMENT_NODE
        ? container
        : container.parentElement;

    if (
      !element ||
      element.closest(EDITABLE_SELECTOR) ||
      element.closest(`#${BUTTON_ID}, #${TOAST_ID}`)
    ) {
      hideButton();
      return;
    }

    lastSelectionText = text;
    positionButton(range);
  }

  function positionButton(range) {
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    const rect = rects.length
      ? rects[rects.length - 1]
      : range.getBoundingClientRect();

    if (!rect || (!rect.width && !rect.height)) {
      hideButton();
      return;
    }

    button.hidden = false;

    // Measure after unhiding so the real button size is available.
    const buttonWidth = button.offsetWidth;
    const buttonHeight = button.offsetHeight;
    const gap = 8;

    let left = rect.left + rect.width / 2 - buttonWidth / 2;
    let top = rect.top - buttonHeight - gap;
    if (top < gap) top = rect.bottom + gap;

    left = Math.max(gap, Math.min(left, window.innerWidth - buttonWidth - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - buttonHeight - gap));

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
  }

  function hideButton() {
    if (button) button.hidden = true;
  }

  function onAskClick(event) {
    event.preventDefault();
    event.stopPropagation();
    suppressUpdateUntil = Date.now() + 400;

    const selection = window.getSelection();
    const text = ((selection && selection.toString()) || lastSelectionText).trim();

    hideButton();
    if (!text) return;

    const input = findPromptInput();
    if (!input) {
      copyToClipboard(text);
      return;
    }

    insertText(input, text);
    showToast("Added to the prompt box");

    if (selection) {
      try {
        selection.removeAllRanges();
      } catch (_) {
        // Ignore browsers that do not allow clearing the selection here.
      }
    }
  }

  function findPromptInput() {
    const candidates = [];

    const add = (element, bonus) => {
      if (!element || !isUsable(element)) return;
      candidates.push({ element, score: scoreInput(element) + bonus });
    };

    add(document.querySelector("textarea#chat-input"), 1000);
    document.querySelectorAll("textarea").forEach((element) => add(element, 0));
    document
      .querySelectorAll("[contenteditable='true']")
      .forEach((element) => add(element, 0));

    const seen = new Set();
    let best = null;

    for (const candidate of candidates) {
      if (seen.has(candidate.element)) continue;
      seen.add(candidate.element);
      if (!best || candidate.score > best.score) best = candidate;
    }

    return best ? best.element : null;
  }

  function isUsable(element) {
    if (element.disabled || element.readOnly) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 10) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function scoreInput(element) {
    const rect = element.getBoundingClientRect();
    const placeholder = element.getAttribute("placeholder") || "";
    let score = 0;

    if (element.tagName === "TEXTAREA") score += 100;
    if (element.id === "chat-input") score += 500;
    if (/message|deepseek|ask|send|prompt/i.test(placeholder)) score += 300;
    if (rect.top > window.innerHeight * 0.5) score += 150;

    score += Math.round(
      (rect.top / Math.max(window.innerHeight, 1)) * 50,
    );

    return score;
  }

  function insertText(input, text) {
    input.focus({ preventScroll: true });

    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      const current = input.value || "";
      const next = current.trim()
        ? `${current.replace(/\s+$/, "")}\n\n${text}`
        : text;

      setNativeValue(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      try {
        input.setSelectionRange(next.length, next.length);
      } catch (_) {
        // Some input types do not support selection ranges.
      }
      return;
    }

    insertIntoEditable(input, text);
  }

  function setNativeValue(element, value) {
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function insertIntoEditable(element, text) {
    const current = (element.innerText || "").replace(/\s+$/, "");
    const next = current ? `${current}\n\n${text}` : text;
    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, next);
    } catch (_) {
      inserted = false;
    }

    if (!inserted) {
      element.textContent = next;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(element);
    endRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(endRange);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Prompt box not found — copied to clipboard");
    } catch (_) {
      showToast("Couldn't find the prompt box. Click it once, then try again.");
    }
  }

  function showToast(message) {
    if (!toast) return;

    window.clearTimeout(toastTimer);
    window.clearTimeout(hideToastTimer);

    toast.textContent = message;
    toast.hidden = false;
    window.requestAnimationFrame(() => toast.classList.add("is-visible"));

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      hideToastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 180);
    }, 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createUi, { once: true });
  } else {
    createUi();
  }
})();
