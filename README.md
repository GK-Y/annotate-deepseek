# Annotate for DeepSeek

A small Firefox/Zen extension that adds the missing "Ask ChatGPT"-style selection action to DeepSeek Chat: highlight text, click **Annotate**, ask a question, and attach context plus annotation to your prompt — powered by DeepSeek V4.1 Flash.

![Annotate for DeepSeek preview](docs/preview.svg)

## Features

- Highlight text on `chat.deepseek.com`, click **Annotate**, and type your question in the popup.
- A numbered diamond marks the text; the `Annotations: N` tab pops out of the prompt box and opens the review panel.
- The send button brightens when annotations exist; sending attaches `context` + `annotation` pairs.

## Install

Requires Firefox 142+ or a recent Zen build.

1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Pick `manifest.json` from this folder.
5. **Refresh any open `chat.deepseek.com` tab** so the content script is injected.
6. Select text, click **Annotate**, then type and send your question.

Temporary add-ons disappear when the browser closes.

### Flatpak Firefox/Zen

Flatpak's file picker can expose only the selected file, so `manifest.json` may load without `src/`, `icons/`, or `popup/`. Build and load the zip instead:

```sh
npx web-ext build --source-dir . --artifacts-dir dist --overwrite-dest
```

Then choose `dist/annotate_for_deepseek-1.1.0.zip` in **Load Temporary Add-on…**.

## Development

No build step. Edit `src/content.js` or `src/content.css`, reload the extension in `about:debugging`, and refresh the DeepSeek tab.

## How it works

**Annotate** opens a small editor; save the highlighted context and your question.
A numbered diamond marks the text, and the `Annotations: N` tab overlaps the prompt box.
The send button brightens when annotations exist, even if the prompt is empty.
On send, each annotation is appended as `context: "..."` and `annotation: "..."`.
No background script, no permissions, no network.
