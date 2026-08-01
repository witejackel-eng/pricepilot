#!/bin/bash
# Robust QA: fixed ref extraction
set +e
cd /home/z/my-project/pricepilot

start_server() {
  pkill -f "pp-server.js" 2>/dev/null
  sleep 1
  node pp-server.js > pp-server.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
    [ "$CODE" = "200" ] && { echo "Server ready"; return; }
    sleep 1
  done
}

# Helper: extract @eN ref from snapshot output for a given text pattern
get_ref() {
  local pattern="$1"
  agent-browser snapshot -i -c 2>&1 | grep "$pattern" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

echo "=== [1] Start server ==="
start_server

echo "=== [2] Open app ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 900 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10

echo "=== [3] Skip onboarding ==="
SKIP_REF=$(get_ref "Skip setup")
echo "Skip ref: $SKIP_REF"
agent-browser click "$SKIP_REF" 2>&1
sleep 5

echo "=== [4] Dismiss tour prompt ==="
NOTNOW_REF=$(get_ref "Not Now")
echo "Not Now ref: $NOTNOW_REF"
[ -n "$NOTNOW_REF" ] && agent-browser click "$NOTNOW_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/10-home.png 2>&1
echo "Home URL: $(agent-browser get url 2>&1)"
echo "Home text (first 500):"
agent-browser eval "document.body.innerText.substring(0, 500)" 2>&1

echo ""
echo "=== [5] Products page ==="
PROD_REF=$(get_ref 'button "Products"')
echo "Products ref: $PROD_REF"
agent-browser click "$PROD_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/11-products.png 2>&1
echo "Products text (first 800):"
agent-browser eval "document.body.innerText.substring(0, 800)" 2>&1

echo ""
echo "=== [6] Import page ==="
IMPORT_REF=$(get_ref "Import Price List")
echo "Import ref: $IMPORT_REF"
agent-browser click "$IMPORT_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/12-import.png 2>&1
echo "Import text (first 800):"
agent-browser eval "document.body.innerText.substring(0, 800)" 2>&1

echo ""
echo "=== [7] Review Prices ==="
REVIEW_REF=$(get_ref "Review Prices")
echo "Review ref: $REVIEW_REF"
agent-browser click "$REVIEW_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/13-review.png 2>&1
echo "Review text (first 800):"
agent-browser eval "document.body.innerText.substring(0, 800)" 2>&1

echo ""
echo "=== [8] Export/Download ==="
DL_REF=$(get_ref "Download Excel")
echo "Download ref: $DL_REF"
agent-browser click "$DL_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/14-export.png 2>&1
echo "Export text (first 800):"
agent-browser eval "document.body.innerText.substring(0, 800)" 2>&1

echo ""
echo "=== [9] Settings ==="
SET_REF=$(get_ref 'button "Settings"')
echo "Settings ref: $SET_REF"
agent-browser click "$SET_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/15-settings.png 2>&1
echo "Settings text (first 1000):"
agent-browser eval "document.body.innerText.substring(0, 1000)" 2>&1

echo ""
echo "=== [10] Advanced Tools menu ==="
ADV_REF=$(get_ref "Advanced Tools")
echo "Advanced Tools ref: $ADV_REF"
agent-browser click "$ADV_REF" 2>&1
sleep 2
echo "Menu after click:"
agent-browser snapshot -i -c 2>&1 | head -50
agent-browser screenshot /home/z/my-project/download/qa/16-advanced-menu.png 2>&1

echo ""
echo "=== [11] Home (reset state) ==="
HOME_REF=$(get_ref 'button "Home"')
echo "Home ref: $HOME_REF"
[ -n "$HOME_REF" ] && agent-browser click "$HOME_REF" 2>&1
sleep 2

echo ""
echo "=== [12] Switch to Advanced mode ==="
ADV_MODE_REF=$(get_ref 'button "Advanced"')
echo "Advanced mode ref: $ADV_MODE_REF"
agent-browser click "$ADV_MODE_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/17-advanced-mode.png 2>&1
echo "Advanced mode text (first 600):"
agent-browser eval "document.body.innerText.substring(0, 600)" 2>&1

echo ""
echo "=== QA COMPLETE ==="
