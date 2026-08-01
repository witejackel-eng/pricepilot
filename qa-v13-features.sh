#!/bin/bash
# QA test for v1.3 features: margin alerts, health gauge, recently viewed
set +e
cd /home/z/my-project/pricepilot

echo "=== [0] Start server ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1
node pp-server.js > pp-server.log 2>&1 &
SERVER_PID=$!
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
  [ "$CODE" = "200" ] && { echo "Server ready"; break; }
  sleep 1
done

get_ref() {
  agent-browser snapshot -i -c 2>&1 | grep "$1" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

echo "=== [1] Open + setup ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 1100 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10
agent-browser click "$(get_ref 'Skip setup')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Not Now')" 2>&1
sleep 2

echo "=== [2] Load sample data ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Try Sample Data')" 2>&1
sleep 5

echo "=== [3] Go Home — check for Health Gauge + Recently Viewed ==="
agent-browser click "$(get_ref 'button "Home"')" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v13-10-home-with-gauge.png 2>&1
echo "Check for Health Gauge text:"
agent-browser eval "document.body.innerText.includes('Pricing Health Score') ? 'FOUND Health Gauge' : 'NOT FOUND'" 2>&1
echo "Check for score number:"
agent-browser eval "document.body.innerText.match(/(\d+)\s*\/\s*100/)?.[0] || 'no score'" 2>&1

echo ""
echo "=== [4] Open a product to populate Recently Viewed ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
# Click first 3 products to populate recently viewed
agent-browser eval "(() => { const rows = document.querySelectorAll('tbody tr'); for (let i = 0; i < Math.min(3, rows.length); i++) { rows[i].click(); } return 'clicked ' + Math.min(3, rows.length); })()" 2>&1
sleep 2
agent-browser press Escape 2>&1
sleep 1
# Click a couple more
agent-browser eval "(() => { const rows = document.querySelectorAll('tbody tr'); for (let i = 3; i < Math.min(5, rows.length); i++) { rows[i].click(); } return 'clicked more'; })()" 2>&1
sleep 2
agent-browser press Escape 2>&1
sleep 1

echo ""
echo "=== [5] Go Home — check Recently Viewed ==="
agent-browser click "$(get_ref 'button "Home"')" 2>&1
sleep 3
agent-browser scroll down 300 2>&1
sleep 1
agent-browser screenshot /home/z/my-project/download/qa/v13-11-recently-viewed.png 2>&1
echo "Check for Recently Viewed text:"
agent-browser eval "document.body.innerText.includes('Recently Viewed') ? 'FOUND Recently Viewed' : 'NOT FOUND'" 2>&1
echo "Check for 'Pick up where you left off':"
agent-browser eval "document.body.innerText.includes('Pick up where you left off') ? 'FOUND subtitle' : 'NOT FOUND'" 2>&1

echo ""
echo "=== [6] Test Margin Alerts bell icon ==="
# Need products with low margins. Let me check if sample data has any
agent-browser scroll up 600 2>&1
sleep 1
# Find the bell icon button by title
agent-browser snapshot -i -c 2>&1 | grep -iE "alert|bell|attention" | head -5
ALERT_REF=$(agent-browser snapshot -i -c 2>&1 | grep -i "need attention\|alert" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
echo "Alert ref: $ALERT_REF"
if [ -n "$ALERT_REF" ]; then
  agent-browser click "$ALERT_REF" 2>&1
  sleep 2
  agent-browser screenshot /home/z/my-project/download/qa/v13-12-alerts-panel.png 2>&1
  echo "Alert panel text (first 400):"
  agent-browser eval "document.querySelector('[role=dialog], [data-state=open]')?.innerText.substring(0, 400) || 'no panel'" 2>&1
  agent-browser press Escape 2>&1
else
  echo "No alert button found — checking via title attr"
  agent-browser find title "products need attention" click 2>&1
  sleep 2
  agent-browser screenshot /home/z/my-project/download/qa/v13-12-alerts-panel.png 2>&1
fi

echo ""
echo "=== [7] Check 'All clear' state (if no alerts) ==="
agent-browser eval "document.body.innerText.includes('All clear') ? 'FOUND all clear' : 'no all clear'" 2>&1

echo ""
echo "=== QA DONE ==="
echo "Server alive: $(ps -p $SERVER_PID > /dev/null && echo YES || echo NO)"
