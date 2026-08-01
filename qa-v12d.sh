#!/bin/bash
# Final QA: capture leaderboard + verify history tab via JS
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

echo "=== [1] Start + setup ==="
start_server
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 1200 2>&1
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

echo "=== [3] Go Home + scroll to leaderboard ==="
agent-browser click "$(get_ref 'button "Home"')" 2>&1
sleep 3

# Scroll the leaderboard into view using JS
agent-browser eval "(() => { const cards = Array.from(document.querySelectorAll('h3, h2, [class*=font-semibold]')); const lb = cards.find(c => c.textContent.includes('Product Leaderboard')); if (lb) { lb.scrollIntoView({block: 'start', behavior: 'smooth'}); return 'scrolled to leaderboard'; } return 'not found'; })()" 2>&1
sleep 2
agent-browser screenshot /home/z/my-project/download/qa/v12-16-leaderboard-full.png 2>&1
echo "Leaderboard section text:"
agent-browser eval "(() => { const cards = Array.from(document.querySelectorAll('[class*=border-slate]')); const lb = cards.find(c => c.textContent.includes('Product Leaderboard')); if (lb) return lb.textContent.substring(0, 500); return 'not found'; })()" 2>&1

echo ""
echo "=== [4] Products -> open drawer ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser eval "document.querySelectorAll('tbody tr')[0].click()" 2>&1
sleep 3

echo "=== [5] Click History tab via JS ==="
agent-browser eval "(() => { const tabs = Array.from(document.querySelectorAll('[role=tab]')); const h = tabs.find(t => t.textContent.includes('History')); if (h) { h.click(); return 'clicked History tab'; } return 'tabs: ' + tabs.map(t=>t.textContent).join(','); })()" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-17-history-tab.png 2>&1
echo "History tab content:"
agent-browser eval "(() => { const panel = document.querySelector('[role=tabpanel]'); if (panel) return panel.textContent.substring(0, 600); return 'no panel'; })()" 2>&1

echo ""
echo "=== QA DONE ==="
