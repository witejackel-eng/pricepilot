#!/bin/bash
# QA test for v1.2 new features: currency converter, leaderboard, price history
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

get_ref() {
  local pattern="$1"
  agent-browser snapshot -i -c 2>&1 | grep "$pattern" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

echo "=== [1] Start server (rebuilt with v1.2) ==="
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
sleep 4

echo "=== [4] Dismiss tour ==="
NOTNOW_REF=$(get_ref "Not Now")
echo "Not Now ref: $NOTNOW_REF"
[ -n "$NOTNOW_REF" ] && agent-browser click "$NOTNOW_REF" 2>&1
sleep 2
agent-browser screenshot /home/z/my-project/download/qa/v12-01-home-empty.png 2>&1

echo ""
echo "=== [5] Verify version string v1.2.0 in footer ==="
agent-browser eval "document.body.innerText.match(/v[0-9]+\.[0-9]+\.[0-9]+/)?.[0] || 'NOT FOUND'" 2>&1

echo ""
echo "=== [6] Test Currency Converter widget ==="
# Find the converter trigger (the ArrowLeftRight icon button)
agent-browser snapshot -i -c 2>&1 | grep -i "converter\|currency\|ArrowLeftRight" | head -5
CONV_REF=$(get_ref "Open currency converter")
echo "Converter trigger ref: $CONV_REF"
if [ -n "$CONV_REF" ]; then
  agent-browser click "$CONV_REF" 2>&1
  sleep 2
  agent-browser screenshot /home/z/my-project/download/qa/v12-02-currency-converter.png 2>&1
  echo "Converter dialog text:"
  agent-browser eval "document.body.innerText.substring(0, 400)" 2>&1
  # Close dialog
  agent-browser press Escape 2>&1
  sleep 1
else
  echo "Converter trigger not found — checking by title attr"
  agent-browser find title "Open currency converter" click 2>&1
  sleep 2
  agent-browser screenshot /home/z/my-project/download/qa/v12-02-currency-converter.png 2>&1
  agent-browser press Escape 2>&1
fi

echo ""
echo "=== [7] Navigate to Products ==="
PROD_REF=$(get_ref 'button "Products"')
echo "Products ref: $PROD_REF"
agent-browser click "$PROD_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-03-products-empty.png 2>&1

echo ""
echo "=== [8] Load sample data ==="
SAMPLE_REF=$(get_ref "Try Sample Data")
echo "Sample Data ref: $SAMPLE_REF"
if [ -n "$SAMPLE_REF" ]; then
  agent-browser click "$SAMPLE_REF" 2>&1
  sleep 4
  agent-browser screenshot /home/z/my-project/download/qa/v12-04-products-loaded.png 2>&1
  echo "Products after sample load (first 600):"
  agent-browser eval "document.body.innerText.substring(0, 600)" 2>&1
else
  echo "Sample Data button not found"
fi

echo ""
echo "=== [9] Go to Home to see Leaderboard ==="
HOME_REF=$(get_ref 'button "Home"')
echo "Home ref: $HOME_REF"
[ -n "$HOME_REF" ] && agent-browser click "$HOME_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-05-home-leaderboard.png 2>&1
echo "Home with leaderboard (first 1000):"
agent-browser eval "document.body.innerText.substring(0, 1000)" 2>&1

echo ""
echo "=== [10] Check for Leaderboard text ==="
agent-browser eval "document.body.innerText.includes('Leaderboard') || document.body.innerText.includes('Top Earners') || document.body.innerText.includes('Product Leaderboard') ? 'FOUND' : 'NOT FOUND'" 2>&1

echo ""
echo "=== [11] Open a product detail drawer (click first product name) ==="
# Go back to products
PROD_REF2=$(get_ref 'button "Products"')
[ -n "$PROD_REF2" ] && agent-browser click "$PROD_REF2" 2>&1
sleep 3
# Click on the first product row
agent-browser snapshot -i -c 2>&1 | grep -iE "product|sku|row" | head -10
# Try clicking first cell link
agent-browser eval "(() => { const rows = document.querySelectorAll('[data-testid*=product], tr[class*=cursor], tr[role=button], button[class*=product]'); if (rows.length > 0) { rows[0].click(); return 'clicked ' + rows.length; } return 'no rows'; })()" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-06-product-drawer.png 2>&1

echo ""
echo "=== [12] Click History tab in drawer ==="
HIST_REF=$(get_ref "History")
echo "History tab ref: $HIST_REF"
if [ -n "$HIST_REF" ]; then
  agent-browser click "$HIST_REF" 2>&1
  sleep 3
  agent-browser screenshot /home/z/my-project/download/qa/v12-07-price-history.png 2>&1
  echo "History tab text (first 600):"
  agent-browser eval "document.body.innerText.substring(0, 600)" 2>&1
else
  echo "History tab not found"
fi

echo ""
echo "=== [13] Close drawer ==="
agent-browser press Escape 2>&1
sleep 1

echo ""
echo "=== QA v1.2 FEATURES COMPLETE ===
