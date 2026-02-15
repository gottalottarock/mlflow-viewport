# MLflow Viewport Extension

A Firefox extension to export and import MLflow experiment viewport configurations.

## Features

- **Export Viewport**: Save the current experiment's layout, chart configurations, and settings as a JSON file
- **Import Viewport**: Load a previously saved viewport configuration
- **Automatic Naming**: Exports are named with the experiment name
- **Safety Warning**: Import shows a confirmation dialog before overwriting

## Installation

### Load Temporary Extension (Development)

1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension directory and select `manifest.json`

### Build for Production

1. Zip all files in the extension directory
2. Submit to Firefox Add-ons (addons.mozilla.org)

## Usage

1. Open an MLflow experiment page in your browser
2. Click the MLflow Viewport extension icon in your browser toolbar
3. Use the **Export Viewport** button to save the current configuration
4. Use the **Import Viewport** button to load a saved configuration

## What Gets Exported?

The extension captures:
- LocalStorage data related to MLflow experiments
- SessionStorage data
- Chart configurations and layouts
- Current experiment name and URL
- Timestamp of export

## Technical Details

- Built as a WebExtension for Firefox
- Uses content scripts to interact with MLflow pages
- Stores configurations as JSON files
- Automatically detects MLflow pages

## Development

### File Structure

```
mlflow-viewport/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── scripts/
│   └── content.js       # Content script for MLflow pages
└── icons/               # Extension icons (add your own)
```

### Adding Icons

Create icons in the `icons/` directory:
- `icon-48.png` (48x48 pixels)
- `icon-96.png` (96x96 pixels)

## License

MIT
