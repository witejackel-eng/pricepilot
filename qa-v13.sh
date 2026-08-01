#!/bin/bash
# QA test: start server + run QA in same session (server dies between calls)
set +e
cd /home/z/my-project/pricepilot

echo "=== [0] Start server (in this session) ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1
node pp-server.js > pp-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
  [ "$CODE" = "200" ] && { echo "Server ready"; break; }
  sleep 1
done

get_ref() {
  agent-browser snapshot -i -c 2>&1 | grep "$1" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

echo "=== [1] Open app + skip onboarding ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 1100 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10
agent-browser click "$(get_ref 'Skip setup')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Not Now')" 2>&1
sleep 2
agent-browser screenshot /home/z/my-project/download/qa/v13-01-home.png 2>&1

echo ""
echo "=== [2] Load sample data ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Try Sample Data')" 2>&1
sleep 5
agent-browser screenshot /home/z/my-project/download/qa/v13-02-products-loaded.png 2>&1
echo "Products count:"
agent-browser eval "document.body.innerText.match(/(\d+)\s*products/)?.[0] || 'not found'" 2>&1

echo ""
echo "=== [3] Check home page ==="
agent-browser click "$(get_ref 'button "Home"')" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v13-03-home-top.png 2>&1
agent-browser scroll down 500 2>&1
sleep 1
agent-browser screenshot /home/z/my-project/download/qa/v13-04-home-middle.png 2>&1
agent-browser scroll down 500 2>&1
sleep 1
agent-browser screenshot /home/z/my-project/download/qa/v13-05-home-bottom.png 2>&1
agent-browser scroll up 1000 2>&1
sleep 1

echo ""
echo "=== [4] Test currency converter ==="
agent-browser find title "Open currency converter" click 2>&1
sleep 2
agent-browser screenshot /home/z/my-project/download/qa/v13-06-currency.png 2>&1
echo "Converter text (first 400):"
agent-browser eval "document.querySelector('[role=dialog]')?.innerText.substring(0, 400) || 'no dialog'" 2>&1
agent-browser press Escape 2>&1
sleep 1

echo ""
echo "=== [5] Open a product drawer ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser eval "document.querySelector('tbody tr')?.click()" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v13-07-drawer.png 2>&1
echo "Drawer tabs:"
agent-browser eval "Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.trim()).join(' | ')" 2>&1

echo ""
echo "=== [6] Check Review Prices page ==="
agent-browser press Escape 2>&1
sleep 1
agent-browser click "$(get_ref 'Review Prices')" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v13-08-review.png 2>&1
echo "Review text (first 500):"
agent-browser eval "document.body.innerText.substring(0, 500)" 2>&1

echo ""
echo "=== [7] Check Settings page ==="
agent-browser click "$(get_ref 'button "Settings"')" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v13-09-settings.png 2>&1
echo "Settings sections:"
agent-browser eval "Array.from(document.querySelectorAll('h2, h3')).map(h => h.textContent.trim()).filter(t => t.length > 0 && t.length < 50).slice(0, 15).join(' | ')" 2>&1

echo ""
echo "=== [8] Server still alive? ==="
ps -p $SERVER_PID > /dev/null && echo "YES - server alive" || echo "NO - server died"
echo "=== QA DONE ==="
