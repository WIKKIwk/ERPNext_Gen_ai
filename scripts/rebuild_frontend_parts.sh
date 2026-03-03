#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS_DIR="$ROOT_DIR/erpnext_ai_tutor/public/js/ai_tutor"

cat "$JS_DIR"/src/widget/*.js > "$JS_DIR/widget_core.js"
cat "$JS_DIR"/src/guide/*.js > "$JS_DIR/guide.js"

echo "Rebuilt:"
echo " - $JS_DIR/widget_core.js"
echo " - $JS_DIR/guide.js"
