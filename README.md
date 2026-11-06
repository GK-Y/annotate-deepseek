# Annotate for DeepSeek

Highlight text on [DeepSeek Chat](https://chat.deepseek.com), click **Ask DeepSeek**, and the highlighted text lands in the prompt box. No copy-paste.

![Annotate for DeepSeek preview](docs/preview.svg)

## Why

DeepSeek's web chat does not have the "Ask ChatGPT" selection action that ChatGPT has. This extension adds a small, local-only version of it: select text, get a button, send the selection to the message box.

## Features

- Floating **Ask DeepSeek** button when you select text
- Puts the selection straight into DeepSeek's prompt box
- Keeps an existing draft (appends on a new line)
- Clipboard fallback if the prompt box cannot be found
- Toolbar icon with a quick how-to popup
- No background service, no network calls, no permissions
- Declares "no data collection" in the Firefox manifest
- Works in Firefox and Zen

## Install (temporary, for development)

Requires Firefox 142+ or a recent Zen build.

1. Download or clone this repo.
2. Open `about:debugging#/runtime/this-firefox` in Firefox or Zen.
3. Click **Load Temporary Add-on…**.
4. Pick `manifest.json` from this folder.
5. **Refresh any open `chat.deepseek.com` tab** so the content script is injected.
6. Select some text and click **Ask DeepSeek**.

Temporary add-ons disappear when the browser closes. After changing the code, reload the extension and refresh the DeepSeek tab.

### Flatpak Firefox/Zen: load the zip instead

Flatpak's file picker uses a document portal. If you select `manifest.json`, Firefox may only receive that one file — not `src/`, `icons/`, or `popup/`. The symptoms are a generic add-on icon and no **Ask DeepSeek** button.

Build a zip and load that instead:

```sh
npx web-ext build --source-dir . --artifacts-dir dist --overwrite-dest
```

Then choose `dist/annotate_for_deepseek-0.1.0.zip` in **Load Temporary Add-on…**.

> There is no build step for normal development. The files in this repo are the extension; the zip is only for loading through Flatpak portals.

## Troubleshooting

- **Generic add-on icon / nothing happens on highlight:** load the built zip (see above), not the bare `manifest.json`.
- **Button still missing:** refresh the DeepSeek tab after loading or reloading the extension.
- **Still missing:** open DevTools (`F12`) → **Console** and check for errors from `content.js`.

## Development

Edit `src/content.js` or `src/content.css`, then reload the extension from `about:debugging`. If you change the manifest or icons, reload the temporary add-on there as well.

Optional manifest/lint check (downloads `web-ext` on first run):

```sh
npx web-ext lint --source-dir .
```

## How it works

1. Firefox injects `src/content.js` and `src/content.css` into `chat.deepseek.com` only.
2. The script watches for a non-empty text selection.
3. It shows one floating button near the selection.
4. On click, it finds the visible message box, writes the text into it, and fires an `input` event so DeepSeek's React UI notices the change.
5. If the box already has text, the highlight is appended instead of replacing the draft.

More detail, in plain English: [docs/DESIGN.md](docs/DESIGN.md).

## Project layout

```text
.
├── manifest.json          # Extension metadata and permissions
├── src/
│   ├── content.js         # Selection button + prompt-box insertion
│   └── content.css        # Button and toast styles
├── popup/
│   ├── popup.html         # Toolbar popup with quick instructions
│   └── popup.css          # Popup styles
├── icons/                 # Toolbar/add-on icons (SVG sources + PNG sizes)
├── docs/
│   ├── DESIGN.md          # Simple design doc
│   └── preview.svg        # README preview illustration
├── LICENSE
└── README.md
```

## Privacy

- No analytics, telemetry, or network requests.
- No extension permissions are requested.
- Selected text never leaves your browser through this extension. It is only written into the page's own prompt box.

## Limitations

- v0 inserts the text; it does **not** press Enter for you.
- DeepSeek's page structure can change. If the button stops finding the prompt box, update the selectors in `findPromptInput()`.
- Only runs on `https://chat.deepseek.com/*`.
- Any selectable text on the page can trigger the button, not just chat messages.
- Temporary add-ons must be reloaded after a browser restart.

## Roadmap

- [ ] Optional auto-send
- [ ] Prompt presets ("Explain this", "Summarize", "Translate")
- [ ] Keyboard shortcut
- [ ] Options page
- [ ] Signed `.xpi` release for permanent installation
- [ ] Chrome/Edge port

## License

[MIT](LICENSE)
