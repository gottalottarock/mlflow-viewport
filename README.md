# MLflow Viewport

Firefox/Zen browser extension for saving and restoring MLflow experiment viewport configurations — chart layouts, sections, filters, run visibility and other UI state.

Tested with MLflow 3.11.1.

## Why this exists

MLflow stores all UI state (which charts are visible, how sections are ordered, run visibility, filters, etc.) in the browser's `localStorage`. Each experiment(s) page gets its own key like:

```
MLflowLocalStorage-1.1-ExperimentPage-["7"]-ReactComponentState
```

This means:
- Your carefully configured chart layout **lives only in one browser** — no way to share it, back it up, or transfer between machines
- If you clear browser data or switch browsers, **all chart configurations are gone**
- There's no built-in way to copy chart layout from one experiment to another

This extension solves all three problems.

## How it works

1. **Export** reads the current experiment's `localStorage`/`sessionStorage` keys and saves them as a JSON file or into the browser's extension storage
2. **Import (charts only)** — default mode — takes the chart-related fields (`compareRunCharts`, `compareRunSections`, `globalLineChartConfig`, etc.) from a saved config and merges them into whatever experiment you currently have open. Runs, filters, and other settings stay untouched.
3. **Import (full)** — restores everything and navigates to the saved experiment's URL, fully reproducing the original viewport

## Installation

### Option 1: Temporary extension (any Firefox)

Works in any Firefox, but **the extension disappears after browser restart**.

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `manifest.json` from the project folder

### Option 2: Permanent install (Firefox Developer Edition only)

Regular Firefox will silently reject unsigned extensions — no error, no notification, nothing happens. You need **Firefox Developer Edition**, which allows installing unsigned extensions.

1. In `about:config`, set `xpinstall.signatures.required` to `false`
2. Build the `.xpi` package:
   ```bash
   ./build.sh
   ```
   This creates `build/mlflow-viewport-<version>.xpi`
3. Open `about:addons` (Ctrl+Shift+A)
4. Click the gear icon ⚙ → **Install Add-on From File...**
5. Select the `.xpi` file

The extension will persist across restarts.

> **Note:** Regular Firefox (Release) enforces extension signing and will silently ignore unsigned `.xpi` files — you won't even see an error. This is by design from Mozilla.

## Usage

### First-time setup

1. Click the extension icon → it will say "No MLflow URLs configured"
2. Right-click the icon → **Manage Extension** → **Preferences** (or open extension settings)
3. Add your MLflow server URL (e.g. `http://localhost:5000`)

You can also create `config.local.json` in the extension folder for auto-seeding:
```json
{
  "mlflowUrls": ["http://localhost:5000"]
}
```

### Export

1. Open an MLflow experiment page
2. Click the extension icon → **Export Viewport**
3. Choose **Save to file** (JSON download) or **Save to browser** (stored in extension storage)

### Import

1. Open any MLflow experiment page
2. Click the extension icon → **Import Viewport**
3. By default, only chart layout is imported (charts-only mode)
4. Check **Full import** to restore everything and navigate to the saved experiment
5. Pick a saved config from the list, or click **Import from file**

### Backup / Restore

All configs saved to browser storage can be backed up as a single JSON file and restored later (or on another machine).

## File structure

```
mlflow-viewport/
├── manifest.json       # Extension manifest (Manifest V2, Gecko)
├── popup.html/js       # Extension popup UI
├── options.html/js     # Settings page (MLflow URLs, preferences)
├── scripts/
│   └── content.js      # Content script — reads/writes MLflow localStorage
├── icons/              # Extension icons
├── build.sh            # Build script → produces .xpi
└── config.local.json   # (optional, gitignored) auto-seed MLflow URLs
```

## License

MIT
