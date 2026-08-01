#!/bin/bash
# Focused QA: scroll to leaderboard + click History tab correctly
set +e
cd /home/z/my-project/pricepilot

start_server() {
  pkill -f "pp-server.js" 2>/dev/null
  sleep 1
  node pp-server.js > pp-server.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
    [ "$CODE" = "200" ] && return
    sleep 1
  done
}

get_ref() {
  agent-browser snapshot -i -c 2>&1 | grep "$1" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

echo "=== [1] Start server ==="
start_server

echo "=== [2] Open + setup ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 1200 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10
agent-browser click "$(get_ref 'Skip setup')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Not Now')" 2>&1
sleep 2

echo "=== [3] Products -> Load sample data ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Try Sample Data')" 2>&1
sleep 5

echo "=== [4] Go Home + scroll to leaderboard ==="
agent-browser click "$(get_ref 'button "Home"')" 2>&1
sleep 3
# Scroll down to find the leaderboard
agent-browser scroll down 600 2>&1
sleep 1
agent-browser scroll down 600 2>&1
sleep 1
agent-browser screenshot /home/z/my-project/download/qa/v12-13-leaderboard-scrolled.png 2>&1
echo "Leaderboard text check:"
agent-browser eval "document.body.innerText.includes('Top Earners') ? 'FOUND Top Earners' : document.body.innerText.includes('Product Leaderboard') ? 'FOUND Product Leaderboard' : 'NOT FOUND'" 2>&1

echo ""
echo "=== [5] Scroll back up + go to products ==="
agent-browser scroll up 1200 2>&1
sleep 1
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3

echo "=== [6] Open first product drawer ==="
agent-browser eval "(() => { const rows = document.querySelectorAll('tbody tr'); if (rows.length > 0) { rows[0].click(); return 'clicked'; } return 'no rows'; })()" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-14-drawer-default.png 2>&1

echo "=== [7] Click History tab (ref @e8) ==="
# Get fresh snapshot to find History tab ref
agent-browser snapshot -i -c 2>&1 | grep -E "tab |History" | head -5
HIST_TAB_REF=$(agent-browser snapshot -i -c 2>&1 | grep 'tab "History"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
echo "History tab ref: $HIST_TAB_REF"
if [ -n "$HIST_TAB_REF" ]; then
  agent-browser click "$HIST_TAB_REF" 2>&1
  sleep 3
  agent-browser screenshot /home/z/my-project/download/qa/v12-15-history-tab.png 2>&1
  echo "History tab content (first 800):"
  agent-browser eval "document.body.innerText.substring(0, 800)" 2>&1
else
  echo "History tab not found. Trying find by role"
  agent-browser find role tab "History" click 2>&1
  sleep 3
  agent-browser screenshot /home/z/my-project/download/qa/v12-15-history-tab.png 2>&1
fi

echo ""
echo "=== QA DONE ==="
