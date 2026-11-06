# Design — Annotate for DeepSeek (v0)

## The one-sentence version

When you select text on `chat.deepseek.com`, show a small **Ask DeepSeek** button. Clicking it writes the selected text into DeepSeek's message box.

## The problem

ChatGPT lets you highlight text and choose "Ask ChatGPT". DeepSeek's web chat does not. Today you have to copy the text, click the message box, paste it, and maybe add a question. This extension removes the copy-paste steps.

Despite the name, v0 does **not** save annotations. It is a one-click "ask about this selection" action. Persistent annotations are a possible future direction.

## User flow

1. You are on <https://chat.deepseek.com>.
2. You select a sentence in a message.
3. A blue **Ask DeepSeek** button appears near the selection.
4. You click it.
5. The selected text appears in the message box, with the cursor at the end.
6. You can edit it, add a question, and press Enter yourself.

If the message box already contains a draft, the selection is appended on a new line. The draft is never replaced.

## How it works (plain English)

Firefox extensions can inject a **content script** into a website. This extension injects one script and one stylesheet into `chat.deepseek.com` only.

The script does four jobs:

1. **Watch for selections.** After a mouse-up or key-up, it asks the browser what text is selected.
2. **Show a button.** If the selection is non-empty and not inside an input, it positions one floating button near the last line of the selection.
3. **Find the message box.** On click, it looks for the visible `textarea` (DeepSeek uses a textarea), preferring `#chat-input` and elements near the bottom of the page.
4. **Write the text.** It puts the text into the box and tells React that the value changed.

That last part is the only slightly tricky bit, explained below.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ chat.deepseek.com                                           │
│                                                             │
│  user selects text                                          │
│        │                                                    │
│        ▼                                                    │
│  src/content.js                                             │
│   ├─ reads window.getSelection()                            │
│   ├─ positions #ds-annotate-pill                            │
│   └─ on click: findPromptInput()                            │
│            │                                                │
│            ▼                                                │
│  textarea / contenteditable                                  │
│   ├─ set value with the native setter                       │
│   ├─ dispatch "input" + "change"                            │
│   └─ DeepSeek's React state updates                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

There is no background script, no service worker, and no network request. The toolbar popup is static instructions; the actual work happens in the content script.

## Files

| File | Job |
| --- | --- |
| `manifest.json` | Tells Firefox the extension name, version, icons, and which site to run on. |
| `src/content.js` | All behavior: selection detection, button, prompt-box insertion, toast. |
| `src/content.css` | Styles for the floating button and the small confirmation toast. |
| `popup/popup.html` | Small toolbar popup with quick usage instructions. |
| `popup/popup.css` | Styles for the toolbar popup. |
| `icons/` | Toolbar/add-on icons (SVG sources plus PNG sizes). |
| `docs/DESIGN.md` | This document. |
| `README.md` | Install steps, features, privacy, limitations. |

## Decisions and why

| Decision | Why |
| --- | --- |
| Content script only | The task is entirely inside one page. No background process or permissions needed. |
| Toolbar popup is static | Gives the toolbar icon a useful landing page without adding background logic. |
| Manifest V3 | Current Firefox/Zen extension format. |
| Insert, do not auto-send | Safer: you can review or add a question before sending. Auto-send can be an option later. |
| Append instead of replace | Never destroys an existing draft. |
| CSS classes instead of Shadow DOM | Fewer moving parts for v0. Class names are prefixed with `ds-annotate-` to avoid collisions. |
| Allow any selected text | We do not depend on DeepSeek's internal message classes, which change often. Selection is the stable signal. |
| No storage, no network | Privacy and simplicity. There is nothing to configure yet. |

## The tricky part: React inputs

React does not read the textarea's value from the DOM on every keystroke. It keeps its own copy of the value in memory.

If you do this:

```js
textarea.value = "hello";
```

the screen may change, but React still thinks the box is empty. When React re-renders, it can wipe your text.

The fix is to use the browser's original value setter (the one React replaced) and then fire a normal `input` event:

```js
const setter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value",
).set;

setter.call(textarea, "hello");
textarea.dispatchEvent(new Event("input", { bubbles: true }));
```

Think of React as keeping its own notebook. Setting `.value` only changes the screen. The native setter plus the `input` event tells React, "the user typed this," so it updates the notebook too.

## Edge cases

| Situation | Behavior |
| --- | --- |
| Empty or collapsed selection | Button stays hidden. |
| Selection inside the prompt box or another input | Button stays hidden. |
| Escape pressed | Button hides. |
| Page scrolls or window resizes | Button hides (its position would be stale). |
| Prompt box missing, hidden, or disabled | Selection is copied to the clipboard and a toast explains. |
| Prompt box already has text | New text is appended after two newlines. |
| Very long selection | Inserted as-is; DeepSeek's own input limit applies. |
| SPA navigation inside DeepSeek | Content script stays alive; the next selection works normally. |
| Flatpak file picker exposes only `manifest.json` | Load the packaged zip, not the bare manifest. |
| Existing DeepSeek tab after install/reload | Refresh the tab so the content script is injected. |
| DeepSeek changes its DOM | `findPromptInput()` may need new selectors. The `#chat-input` preference is first. |

## Manual test checklist

- [ ] Select a sentence in a chat message: button appears near the selection.
- [ ] Click the button: text appears in the message box, cursor at the end.
- [ ] Type after insertion: DeepSeek keeps the text and normal typing works.
- [ ] Put a draft in the box first: highlight is appended, draft is kept.
- [ ] Select text inside the message box: no button appears.
- [ ] Press Escape: button disappears.
- [ ] Scroll while the button is visible: button disappears.
- [ ] Navigate between chats, then select text: button still works.
- [ ] Reload the page: button still works.
- [ ] Check the browser console: no errors.

## Not in v0

- Auto-send
- Prompt templates
- Keyboard shortcuts
- Settings/options page
- Permanent signed `.xpi`
- Firefox for Android
- Chrome/Edge port

## Next version ideas

1. Add a small settings page with prompt presets and an "auto-send" toggle.
2. Add a keyboard shortcut (for example `Alt+Shift+D`).
3. Add a "quote" mode that wraps the selection in a Markdown blockquote.
4. Publish a signed build on addons.mozilla.org for one-click permanent install.
