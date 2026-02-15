# Quick Installation Guide

## Step 1: Add Icons (Optional but Recommended)

Create two PNG icons in the `icons/` directory:
- `icon-48.png` (48x48 pixels)
- `icon-96.png` (96x96 pixels)

You can use any icon generator or create simple ones. If you skip this, Firefox will use a default icon.

## Step 2: Load the Extension in Firefox

1. Open Firefox
2. Type `about:debugging` in the address bar and press Enter
3. Click **"This Firefox"** in the left sidebar
4. Click **"Load Temporary Add-on..."** button
5. Navigate to your `mlflow-viewport` folder
6. Select the `manifest.json` file
7. Click **Open**

✅ The extension is now loaded!

## Step 3: Test It

1. Open an MLflow experiment page (e.g., `http://localhost:5000/mlflow/experiments/1`)
2. Click the extension icon in the Firefox toolbar
3. Try exporting the viewport - a save dialog will appear
4. Try importing a previously saved viewport

## Troubleshooting

**Extension icon not showing?**
- Look in the Extensions menu (puzzle piece icon)
- Pin it to the toolbar for easy access

**"Not an MLflow page" error?**
- Make sure you're on a page with `/mlflow/` in the URL
- The extension works with localhost and remote MLflow instances

**Export/Import not working?**
- Check the browser console (F12) for errors
- Make sure you have the latest version of Firefox

## Uninstalling

1. Go to `about:debugging`
2. Find "MLflow Viewport" under "This Firefox"
3. Click **Remove**

## Making It Permanent

Temporary extensions are removed when Firefox restarts. To make it permanent:

1. Sign up at https://addons.mozilla.org/developers/
2. Zip your extension folder
3. Submit it for review
4. Once approved, install it normally

Or use Firefox Developer Edition or Nightly for longer-lasting temporary extensions.
