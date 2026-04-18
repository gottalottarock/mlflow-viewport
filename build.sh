#!/bin/bash
set -e

cd "$(dirname "$0")"

# Read version from manifest.json
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
OUTFILE="build/mlflow-viewport-${VERSION}.xpi"

echo "Building MLflow Viewport v${VERSION}..."

mkdir -p build

# Clean previous build
rm -f "$OUTFILE"

# Package extension files
zip -r "$OUTFILE" \
  manifest.json \
  popup.html \
  popup.js \
  options.html \
  options.js \
  icons/ \
  scripts/ \
  -x "*.DS_Store"

echo ""
echo "Done: $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
echo ""
echo "Install in Firefox Developer Edition:"
echo "  1. Open about:config → set xpinstall.signatures.required = false"
echo "  2. Open about:addons → gear icon → Install Add-on From File"
echo "  3. Select $OUTFILE"
