(() => {
  "use strict";

  if (window.__dsAnnotateLoaded) return;
  window.__dsAnnotateLoaded = true;

  const BUTTON_ID = "ds-annotate-pill";
  const TOAST_ID = "ds-annotate-toast";
  const CHIP_ID = "ds-annotate-chip";
  const PANEL_ID = "ds-annotate-panel";
  const EDITOR_ID = "ds-annotate-editor";
  const MARKER_LAYER_ID = "ds-annotate-markers";
  const SEND_SHIELD_ID = "ds-annotate-send-shield";
  const ANNOTATION_MARKER = "\n\n--- Annotations ---\n";
  const EDITABLE_SELECTOR =
    "textarea, input, [contenteditable='true'], [contenteditable='']";
  const UI_SELECTOR = `#${BUTTON_ID}, #${TOAST_ID}, #${CHIP_ID}, #${PANEL_ID}, #${EDITOR_ID}, #${MARKER_LAYER_ID}, #${SEND_SHIELD_ID}`;

  let button = null;
  let toast = null;
  let chip = null;
  let panel = null;
  let panelList = null;
  let editor = null;
  let editorPreview = null;
  let editorInput = null;
  let editorAdd = null;
  let markerLayer = null;
  let sendShield = null;
  let toastTimer = 0;
  let hideToastTimer = 0;
  let lastSelectionText = "";
  let mouseDown = false;
  let suppressUpdateUntil = 0;
  let annotations = [];
  let nextAnnotationId = 1;
  let panelOpen = false;
  let editorOpen = false;
  let editorContextText = "";
  let editorRange = null;
  let editorAnchorRect = null;
  let markerElements = new Map();
  let cachedInput = null;
  let cachedSendButton = null;
  let styledSendButton = null;
  let suppressSendInterception = false;
  let sendingWithAnnotations = false;
  let positionFrame = 0;
  let resizeObserver = null;
  let observedInput = null;
  let lastUrl = location.href;

  function createUi() {
    if (document.getElementById(BUTTON_ID)) return;

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.hidden = true;
    button.setAttribute("aria-label", "Add an annotation from the selected text");
    button.innerHTML = `
      <svg class="ds-annotate-pill__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2.75l2.05 5.2 5.2 2.05-5.2 2.05L12 17.25l-2.05-5.2-5.2-2.05 5.2-2.05L12 2.75z" fill="#ffffff"/>
        <path d="M19.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" fill="#ffffff" opacity=".8"/>
      </svg>
      <span>Annotate</span>`;

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

    chip = document.createElement("button");
    chip.id = CHIP_ID;
    chip.type = "button";
    chip.hidden = true;
    chip.setAttribute("aria-haspopup", "dialog");
    chip.setAttribute("aria-expanded", "false");
    chip.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    chip.addEventListener("click", onChipClick);

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Annotations");
    panel.innerHTML = `
      <div class="ds-annotate-panel__header">
        <span>Annotations</span>
        <button class="ds-annotate-panel__close" type="button" aria-label="Close annotations">×</button>
      </div>
      <ol class="ds-annotate-panel__list"></ol>
      <div class="ds-annotate-panel__footer">
        <button class="ds-annotate-panel__send" type="button">Send with annotations</button>
        <button class="ds-annotate-panel__clear" type="button">Clear all</button>
      </div>`;

    panelList = panel.querySelector(".ds-annotate-panel__list");
    panel
      .querySelector(".ds-annotate-panel__close")
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      });
    panel
      .querySelector(".ds-annotate-panel__send")
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        suppressUpdateUntil = Date.now() + 400;
        const input = findPromptInput();
        closePanel();
        if (input) sendWithAnnotations(input);
        else showToast("Couldn't find the prompt box.");
      });
    panel
      .querySelector(".ds-annotate-panel__clear")
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        suppressUpdateUntil = Date.now() + 400;
        clearAnnotations();
      });

    editor = document.createElement("div");
    editor.id = EDITOR_ID;
    editor.hidden = true;
    editor.setAttribute("role", "dialog");
    editor.setAttribute("aria-label", "Add annotation");
    editor.innerHTML = `
      <div class="ds-annotate-editor__preview"></div>
      <textarea class="ds-annotate-editor__input" rows="2" placeholder="Type your question…"></textarea>
      <div class="ds-annotate-editor__actions">
        <button class="ds-annotate-editor__cancel" type="button">Cancel</button>
        <button class="ds-annotate-editor__add" type="button" disabled>Add annotation</button>
      </div>`;

    editorPreview = editor.querySelector(".ds-annotate-editor__preview");
    editorInput = editor.querySelector(".ds-annotate-editor__input");
    editorAdd = editor.querySelector(".ds-annotate-editor__add");

    editor
      .querySelector(".ds-annotate-editor__cancel")
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelEditor();
      });

    editorAdd.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commitEditor();
    });

    editorInput.addEventListener("input", () => {
      editorAdd.disabled = !editorInput.value.trim();
    });

    editorInput.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        event.stopPropagation();
        commitEditor();
      }
    });

    markerLayer = document.createElement("div");
    markerLayer.id = MARKER_LAYER_ID;
    markerLayer.setAttribute("aria-label", "Annotation markers");

    sendShield = document.createElement("div");
    sendShield.id = SEND_SHIELD_ID;
    sendShield.hidden = true;
    sendShield.setAttribute("aria-hidden", "true");
    sendShield.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressUpdateUntil = Date.now() + 400;
      closePanel();
      hideButton();
    });
    sendShield.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const input = findPromptInput();
      if (input) sendWithAnnotations(input);
    });

    (document.body || document.documentElement).append(
      button,
      toast,
      chip,
      panel,
      editor,
      markerLayer,
      sendShield,
    );

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onSendKeyDown, true);
    document.addEventListener("click", onSendClick, true);
    document.addEventListener("input", onDocumentInput, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange, { passive: true });
    window.setInterval(checkUrlChange, 500);
  }

  function onMouseDown(event) {
    mouseDown = true;
    if (!button.contains(event.target)) hideButton();

    if (editorOpen && !editor.contains(event.target)) {
      closeEditor();
    }

    if (
      panelOpen &&
      !chip.contains(event.target) &&
      !panel.contains(event.target)
    ) {
      closePanel();
    }
  }

  function onMouseUp() {
    mouseDown = false;
    window.setTimeout(updateFromSelection, 10);
  }

  function onKeyUp() {
    window.setTimeout(updateFromSelection, 10);
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (editorOpen) cancelEditor();
    if (panelOpen) closePanel();
    hideButton();
  }

  function onDocumentInput() {
    if (annotations.length) scheduleChipPosition();
  }

  function onViewportChange() {
    hideButton();
    if (editorOpen) positionEditor();
    if (annotations.length) scheduleChipPosition();
  }

  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      cachedInput = null;
      cachedSendButton = null;
      closeEditor();
      if (annotations.length) clearAnnotations({ silent: true });
    }

    // Keeps the tab above the prompt box if the page moves it without
    // firing a resize event.
    if (editorOpen) positionEditor();
    if (annotations.length) scheduleChipPosition();
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
      element.closest(UI_SELECTOR)
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
    const range =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).cloneRange()
        : null;
    const anchorRect =
      (range && getRangeRect(range)) || button.getBoundingClientRect();

    hideButton();
    if (!text) return;

    openEditor(text, range, anchorRect);
  }

  function addAnnotation(context, query, range, input) {
    const annotation = {
      id: nextAnnotationId++,
      context,
      query,
      range,
      fallbackRange: null,
    };

    annotations.push(annotation);
    renderAnnotations();

    if (input) input.focus({ preventScroll: true });
    return annotation;
  }

  function openEditor(context, range, anchorRect) {
    if (!editor) return;

    closePanel();
    editorContextText = context;
    editorRange = range;
    editorAnchorRect = anchorRect || null;

    editorPreview.textContent = truncate(context, 160);
    editorPreview.title = context;
    editorInput.value = "";
    editorAdd.disabled = true;
    editorOpen = true;
    editor.hidden = false;
    if (sendShield) sendShield.hidden = true;
    updateSendButtonStyle(null, false);

    positionEditor();
    scheduleChipPosition();

    window.requestAnimationFrame(() => {
      if (!editorOpen) return;
      editorInput.focus({ preventScroll: true });
      try {
        editorInput.setSelectionRange(0, 0);
      } catch (_) {
        // Ignore browsers that do not support selection ranges.
      }
    });
  }

  function closeEditor() {
    editorOpen = false;
    if (editor) editor.hidden = true;
    editorContextText = "";
    editorRange = null;
    editorAnchorRect = null;
    if (editorInput) editorInput.value = "";
    if (editorAdd) editorAdd.disabled = true;
    if (annotations.length) scheduleChipPosition();
  }

  function positionEditor() {
    if (!editor || editor.hidden) return;

    const anchor = getEditorAnchorRect() || {
      left: window.innerWidth / 2,
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
    };

    const gap = 8;
    const width = editor.offsetWidth;
    const height = editor.offsetHeight;
    let left = anchor.left;
    let top = anchor.bottom + gap;

    if (top + height > window.innerHeight - gap) {
      top = anchor.top - height - gap;
    }

    left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - height - gap));

    editor.style.left = `${Math.round(left)}px`;
    editor.style.top = `${Math.round(top)}px`;
  }

  function getEditorAnchorRect() {
    if (editorRange) {
      const rect = getRangeRect(editorRange);
      if (rect) return rect;
    }

    return editorAnchorRect;
  }

  function getRangeRect(range) {
    if (!range) return null;

    const start = range.startContainer;
    const end = range.endContainer;
    if (start && !start.isConnected) return null;
    if (end && !end.isConnected) return null;

    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    if (rects.length) return rects[0];

    const rect = range.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function commitEditor() {
    if (!editorOpen) return;

    const query = editorInput.value.trim();
    if (!query) {
      editorInput.focus();
      return;
    }

    const context = editorContextText;
    const range = editorRange;
    const input = findPromptInput();

    closeEditor();
    clearSelection();

    if (!input) {
      copyToClipboard(formatAnnotationBlock(context, query));
      return;
    }

    addAnnotation(context, query, range, input);
    showToast(`Annotation ${annotations.length} added`);
  }

  function cancelEditor() {
    closeEditor();
    clearSelection();
  }

  function clearSelection() {
    const selection = window.getSelection();
    if (!selection) return;

    try {
      selection.removeAllRanges();
    } catch (_) {
      // Ignore browsers that do not allow clearing the selection here.
    }
  }

  function formatAnnotationBlock(context, query) {
    return `context: ${quoteForPrompt(context)}\nannotation: ${quoteForPrompt(query)}`;
  }

  function quoteForPrompt(value) {
    const clean = value.replace(/\s+/g, " ").trim();
    return `"${clean.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  function renderAnnotations() {
    if (!chip) return;

    const count = annotations.length;
    chip.textContent = `Annotations: ${count}`;
    chip.hidden = count === 0;
    chip.setAttribute(
      "aria-expanded",
      panelOpen && count > 0 ? "true" : "false",
    );

    renderMarkers();

    if (count === 0) {
      closePanel();
    } else if (panelOpen) {
      renderPanel();
    }

    scheduleChipPosition();
  }

  function onChipClick(event) {
    event.preventDefault();
    event.stopPropagation();
    suppressUpdateUntil = Date.now() + 400;

    if (!annotations.length) return;

    if (panelOpen) closePanel();
    else openPanel();
  }

  function openPanel() {
    if (!annotations.length) return;

    panelOpen = true;
    if (chip) chip.setAttribute("aria-expanded", "true");
    renderPanel();
    if (panel) panel.hidden = false;
    scheduleChipPosition();
  }

  function closePanel() {
    panelOpen = false;
    if (panel) panel.hidden = true;
    if (chip) chip.setAttribute("aria-expanded", "false");
  }

  function renderPanel() {
    if (!panelList) return;

    panelList.textContent = "";

    annotations.forEach((annotation, index) => {
      const item = document.createElement("li");
      item.className = "ds-annotate-panel__item";

      const number = document.createElement("span");
      number.className = "ds-annotate-panel__num";
      number.textContent = String(index + 1);

      const body = document.createElement("div");
      body.className = "ds-annotate-panel__body";

      const context = document.createElement("span");
      context.className = "ds-annotate-panel__context";
      context.textContent = truncate(annotation.context, 120);
      context.title = annotation.context;

      const query = document.createElement("span");
      query.className = "ds-annotate-panel__query";
      query.textContent = truncate(annotation.query, 160);
      query.title = annotation.query;

      body.append(context, query);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ds-annotate-panel__remove";
      remove.setAttribute("aria-label", `Remove annotation ${index + 1}`);
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        suppressUpdateUntil = Date.now() + 400;
        removeAnnotation(annotation.id);
      });

      item.append(number, body, remove);
      panelList.append(item);
    });
  }

  function removeAnnotation(id) {
    annotations = annotations.filter((annotation) => annotation.id !== id);
    renderAnnotations();

    if (!annotations.length) showToast("Annotations cleared");
  }

  function clearAnnotations(options = {}) {
    annotations = [];
    nextAnnotationId = 1;
    renderAnnotations();
    closePanel();

    if (!options.silent) showToast("Annotations cleared");
  }

  function truncate(value, maxLength) {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > maxLength
      ? `${clean.slice(0, maxLength - 1)}…`
      : clean;
  }

  function renderMarkers() {
    if (!markerLayer) return;

    const ids = new Set(annotations.map((annotation) => annotation.id));

    for (const [id, marker] of markerElements) {
      if (!ids.has(id)) {
        marker.remove();
        markerElements.delete(id);
      }
    }

    annotations.forEach((annotation, index) => {
      let marker = markerElements.get(annotation.id);

      if (!marker) {
        marker = document.createElement("button");
        marker.type = "button";
        marker.className = "ds-annotate-marker";
        marker.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        marker.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          suppressUpdateUntil = Date.now() + 400;
          openPanel();
        });
        markerLayer.append(marker);
        markerElements.set(annotation.id, marker);
      }

      marker.textContent = String(index + 1);
      marker.setAttribute("aria-label", `Annotation ${index + 1}`);
    });

    positionMarkers();
  }

  function positionMarkers() {
    if (!markerLayer) return;

    annotations.forEach((annotation) => {
      const marker = markerElements.get(annotation.id);
      if (!marker) return;

      const range = resolveAnnotationRange(annotation);
      const rect = getRangeRect(range);

      if (
        !rect ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        marker.hidden = true;
        return;
      }

      marker.hidden = false;

      const size = marker.offsetWidth || 20;
      const gap = 4;
      let left = rect.left - size - gap;
      let top = rect.top + rect.height / 2 - size / 2;

      if (left < gap) {
        left = rect.left + gap;
        top = rect.top - size - gap;
      }

      left = Math.max(gap, Math.min(left, window.innerWidth - size - gap));
      top = Math.max(gap, Math.min(top, window.innerHeight - size - gap));

      marker.style.left = `${Math.round(left)}px`;
      marker.style.top = `${Math.round(top)}px`;
    });
  }

  function resolveAnnotationRange(annotation) {
    if (
      annotation.range &&
      annotation.range.startContainer &&
      annotation.range.startContainer.isConnected &&
      annotation.range.endContainer &&
      annotation.range.endContainer.isConnected
    ) {
      return annotation.range;
    }

    if (
      annotation.fallbackRange &&
      annotation.fallbackRange.startContainer &&
      annotation.fallbackRange.startContainer.isConnected
    ) {
      return annotation.fallbackRange;
    }

    annotation.fallbackRange = findTextRange(annotation.context);
    return annotation.fallbackRange;
  }

  function findTextRange(text) {
    const needle = text.replace(/\s+/g, " ").trim();
    if (needle.length < 4 || !document.body) return null;

    const probes = [needle];
    if (needle.length > 40) probes.push(needle.slice(0, 40));

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(UI_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(EDITABLE_SELECTOR)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue;

      for (const probe of probes) {
        const index = value.indexOf(probe);
        if (index !== -1) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + probe.length);
          return range;
        }
      }

      node = walker.nextNode();
    }

    return null;
  }

  function scheduleChipPosition() {
    if (positionFrame) return;

    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = 0;
      positionChip();
    });
  }

  function positionChip() {
    if (!chip) return;

    positionMarkers();
    positionSendShield();

    if (!annotations.length) return;

    chip.hidden = false;

    const input = findPromptInput();
    if (!input) {
      chip.hidden = true;
      closePanel();
      return;
    }

    ensureObserved(input);

    const box = findPromptBox(input) || input;
    const boxRect = box.getBoundingClientRect();
    if (!boxRect.width || !boxRect.height) {
      chip.hidden = true;
      closePanel();
      return;
    }

    const chipWidth = chip.offsetWidth;
    const chipHeight = chip.offsetHeight;
    const gap = 8;
    const overlap = 6;
    let left = boxRect.left + 12;
    let top = boxRect.top - chipHeight + overlap;

    left = Math.max(gap, Math.min(left, window.innerWidth - chipWidth - gap));
    top = Math.max(gap, top);

    chip.style.left = `${Math.round(left)}px`;
    chip.style.top = `${Math.round(top)}px`;

    if (panelOpen) positionPanel();
  }

  function positionSendShield() {
    if (!sendShield) return;

    const input = findPromptInput();
    if (!input || !annotations.length || editorOpen) {
      sendShield.hidden = true;
      updateSendButtonStyle(null, false);
      return;
    }

    const sendButton = findSendButton(input);
    if (!sendButton) {
      sendShield.hidden = true;
      updateSendButtonStyle(null, false);
      return;
    }

    const hasPrompt = getInputText(input).trim().length > 0;
    const shouldShow = !hasPrompt;
    updateSendButtonStyle(sendButton, shouldShow);

    if (!shouldShow) {
      sendShield.hidden = true;
      return;
    }

    const rect = sendButton.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      sendShield.hidden = true;
      return;
    }

    const pad = 2;
    sendShield.hidden = false;
    sendShield.style.left = `${Math.round(rect.left - pad)}px`;
    sendShield.style.top = `${Math.round(rect.top - pad)}px`;
    sendShield.style.width = `${Math.round(rect.width + pad * 2)}px`;
    sendShield.style.height = `${Math.round(rect.height + pad * 2)}px`;
    sendShield.style.borderRadius =
      rect.width > rect.height + 2 ? "12px" : "50%";
  }

  function updateSendButtonStyle(sendButton, active) {
    if (styledSendButton && styledSendButton !== sendButton) {
      styledSendButton.classList.remove("ds-annotate-send-ready");
      styledSendButton = null;
    }

    if (!sendButton) return;

    if (active) {
      sendButton.classList.add("ds-annotate-send-ready");
      styledSendButton = sendButton;
    } else {
      sendButton.classList.remove("ds-annotate-send-ready");
      if (styledSendButton === sendButton) styledSendButton = null;
    }
  }

  function ensureObserved(input) {
    if (observedInput === input) return;

    if (resizeObserver) resizeObserver.disconnect();
    observedInput = input;

    if (typeof ResizeObserver !== "function") return;
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => scheduleChipPosition());
    }

    resizeObserver.observe(input);
    const box = findPromptBox(input);
    if (box && box !== input) resizeObserver.observe(box);
  }

  function findPromptBox(input) {
    const inputRect = input.getBoundingClientRect();
    let element = input.parentElement;

    for (
      let depth = 0;
      element && depth < 7;
      depth += 1, element = element.parentElement
    ) {
      const rect = element.getBoundingClientRect();
      if (rect.width < inputRect.width) continue;
      if (rect.height < inputRect.height + 16) continue;
      if (rect.width > inputRect.width * 2 + 160) continue;
      if (rect.height > inputRect.height * 5 + 160) continue;

      const style = window.getComputedStyle(element);
      const radius = parseFloat(style.borderTopLeftRadius || "0");
      const background = style.backgroundColor;
      const hasBackground =
        background !== "rgba(0, 0, 0, 0)" && background !== "transparent";

      if (radius >= 8 || hasBackground) return element;
    }

    return input.parentElement;
  }

  function positionPanel() {
    if (!panel || panel.hidden || !chip) return;

    const chipRect = chip.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const gap = 8;
    let left = chipRect.left;

    left = Math.max(gap, Math.min(left, window.innerWidth - panelWidth - gap));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.bottom = `${Math.round(
      window.innerHeight - chipRect.top + gap,
    )}px`;
    panel.style.maxHeight = `${Math.max(120, chipRect.top - gap * 2)}px`;
  }

  function onSendKeyDown(event) {
    if (suppressSendInterception || sendingWithAnnotations) return;
    if (!annotations.length) return;
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing
    ) {
      return;
    }

    const input = findPromptInput();
    if (!input) return;
    if (event.target !== input && !input.contains(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    sendWithAnnotations(input);
  }

  function onSendClick(event) {
    if (suppressSendInterception || sendingWithAnnotations) return;
    if (!annotations.length) return;

    const input = findPromptInput();
    if (!input) return;

    const sendButton = findSendButton(input);
    if (!sendButton || !sendButton.contains(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    sendWithAnnotations(input);
  }

  function sendWithAnnotations(input) {
    if (sendingWithAnnotations) return;
    sendingWithAnnotations = true;

    const payload = buildAnnotationPayload();
    const current = getInputText(input);
    const markerIndex = current.indexOf(ANNOTATION_MARKER);
    const base = markerIndex === -1 ? current : current.slice(0, markerIndex);
    const next = base.trim()
      ? `${base.replace(/\s+$/, "")}${payload}`
      : payload.replace(/^\n+/, "");

    setInputText(input, next);
    input.focus({ preventScroll: true });

    window.setTimeout(() => {
      const sendButton = findSendButton(input);
      suppressSendInterception = true;

      if (sendButton && !isDisabled(sendButton)) {
        sendButton.click();
      } else {
        triggerSendFallback(input);
      }

      window.setTimeout(() => {
        suppressSendInterception = false;

        const stillThere =
          input.isConnected &&
          getInputText(input).includes(ANNOTATION_MARKER);
        if (stillThere) {
          const retryButton = findSendButton(input);
          if (retryButton && !isDisabled(retryButton)) {
            suppressSendInterception = true;
            retryButton.click();
            window.setTimeout(() => {
              suppressSendInterception = false;
            }, 100);
          }
        }

        clearAnnotations({ silent: true });
        sendingWithAnnotations = false;
        showToast(
          stillThere
            ? "Annotations added to the prompt"
            : "Sent with annotations",
        );
      }, 320);
    }, 60);
  }

  // Keep each highlighted span and its question paired so the model can tell
  // what was selected from what the user asked about it.
  function buildAnnotationPayload() {
    const blocks = annotations.map((annotation, index) => {
      return [
        `${index + 1}.`,
        `context: ${quoteForPrompt(annotation.context)}`,
        `annotation: ${quoteForPrompt(annotation.query)}`,
      ].join("\n");
    });

    return `${ANNOTATION_MARKER}${blocks.join("\n\n")}`;
  }

  function triggerSendFallback(input) {
    const form = input.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function findSendButton(input) {
    if (cachedSendButton && cachedSendButton.isConnected) {
      return cachedSendButton;
    }

    const box = findPromptBox(input) || input.parentElement;
    if (!box) return null;

    const labelled = box.querySelector(
      'button[type="submit"], [aria-label*="send" i], [title*="send" i]',
    );
    if (labelled && isVisible(labelled)) {
      cachedSendButton = labelled;
      return labelled;
    }

    const boxRect = box.getBoundingClientRect();
    let best = null;
    let bestScore = -Infinity;

    for (const element of box.querySelectorAll("*")) {
      if (element === input || element.contains(input)) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) continue;
      if (rect.width > 72 || rect.height > 72) continue;
      if (rect.right > boxRect.right + 4) continue;
      if (rect.bottom > boxRect.bottom + 4) continue;
      if (boxRect.right - rect.right > 96) continue;
      if (boxRect.bottom - rect.bottom > 96) continue;

      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }

      const label = `${element.getAttribute("aria-label") || ""} ${
        element.getAttribute("title") || ""
      }`;
      if (/attach|file|upload|paperclip/i.test(label)) continue;

      const background = style.backgroundColor;
      const hasBackground =
        background !== "rgba(0, 0, 0, 0)" && background !== "transparent";
      let score = rect.right;

      if (element.matches('button[type="submit"]')) score += 1000;
      if (/send/i.test(label)) score += 500;
      if (hasBackground) score += 200;
      if (element.matches('button, [role="button"]')) score += 100;

      if (score > bestScore) {
        bestScore = score;
        best = element;
      }
    }

    if (!best) {
      cachedSendButton = null;
      return null;
    }

    const target = best.closest('button, [role="button"]') || best;
    const targetRect = target.getBoundingClientRect();
    const targetStyle = window.getComputedStyle(target);
    const targetBackground = targetStyle.backgroundColor;
    const targetHasBackground =
      targetBackground !== "rgba(0, 0, 0, 0)" &&
      targetBackground !== "transparent";
    const targetLabel = `${target.getAttribute("aria-label") || ""} ${
      target.getAttribute("title") || ""
    }`;
    const nearRight = boxRect.right - targetRect.right <= 24;
    const nearBottom = boxRect.bottom - targetRect.bottom <= 24;
    const confident =
      target.matches('button[type="submit"]') ||
      /send/i.test(targetLabel) ||
      targetHasBackground ||
      (nearRight && nearBottom && target.matches('button, [role="button"]'));

    cachedSendButton = confident ? target : null;
    return cachedSendButton;
  }

  function isDisabled(element) {
    return (
      element.disabled === true ||
      element.getAttribute("aria-disabled") === "true"
    );
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  function getInputText(input) {
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      return input.value || "";
    }

    return input.innerText || "";
  }

  function setInputText(input, value) {
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      setNativeValue(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      try {
        input.setSelectionRange(value.length, value.length);
      } catch (_) {
        // Some input types do not support selection ranges.
      }
      return;
    }

    setEditableText(input, value);
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

  function setEditableText(element, value) {
    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, value);
    } catch (_) {
      inserted = false;
    }

    if (!inserted) {
      element.textContent = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(element);
    endRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(endRange);
  }

  function findPromptInput() {
    if (cachedInput && cachedInput.isConnected && isUsable(cachedInput)) {
      return cachedInput;
    }

    const candidates = [];

    const add = (element, bonus) => {
      if (!element || element.closest(UI_SELECTOR)) return;
      if (!isUsable(element)) return;
      candidates.push({ element, score: scoreInput(element) + bonus });
    };

    add(document.querySelector("textarea#chat-input"), 1000);
    document.querySelectorAll("textarea").forEach((element) => add(element, 0));
    document
      .querySelectorAll("[contenteditable='true'], [contenteditable='']")
      .forEach((element) => add(element, 0));

    const seen = new Set();
    let best = null;

    for (const candidate of candidates) {
      if (seen.has(candidate.element)) continue;
      seen.add(candidate.element);
      if (!best || candidate.score > best.score) best = candidate;
    }

    cachedInput = best ? best.element : null;
    return cachedInput;
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
