#!/bin/bash
# Full app navigation QA - tests all pages and features
set +e
cd /home/z/my-project/pricepilot

echo "=== [1] Start server ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1
node pp-server.js > pp-server.log 2>&1 &
SERVER_PID=$!
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
  [ "$CODE" = "200" ] && { echo "Server ready"; break; }
  sleep 1
done

echo "=== [2] Open app ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 900 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10

echo "=== [3] Onboarding - Skip setup ==="
agent-browser screenshot /home/z/my-project/download/qa/03-onboarding.png 2>&1
agent-browser snapshot -i -c 2>&1 | head -20
# Click "Skip setup for now"
agent-browser find text "Skip setup for now" click 2>&1
sleep 4
agent-browser screenshot /home/z/my-project/download/qa/04-after-skip.png 2>&1
echo "After skip - URL: $(agent-browser get url 2>&1)"
agent-browser snapshot -i -c 2>&1 | head -40

echo ""
echo "=== [4] Look at app shell / navigation ==="
agent-browser eval "(() => { const navs = Array.from(document.querySelectorAll('nav a, nav button, [role=tablist] button, [role=navigation] a')); return navs.slice(0, 30).map(n => (n.textContent||'').trim().substring(0,40)).filter(Boolean).join(' | '); })()" 2>&1

echo ""
echo "=== [5] Explore current view (likely Owner Home / Dashboard) ==="
agent-browser eval "document.body.innerText.substring(0, 600)" 2>&1

echo ""
echo "=== [6] Take screenshots of all major views by clicking nav ==="
# Try to find and click each nav item
for label in "Dashboard" "Home" "Products" "Import" "Export" "Review" "Settings" "Simulator" "Scenarios" "Pricing"; do
  echo "--- Trying nav: $label ---"
  RESULT=$(agent-browser find text "$label" click 2>&1)
  echo "$RESULT" | head -2
  sleep 2
  agent-browser screenshot "/home/z/my-project/download/qa/nav-${label}.png" 2>&1 | tail -1
  URL=$(agent-browser get url 2>&1)
  echo "URL: $URL"
done

echo ""
echo "=== [7] Final document state ==="
agent-browser eval "(() => ({url: location.href, title: document.title, h1: (document.querySelector('h1')||{}).textContent||'none', h2count: document.querySelectorAll('h2').length, buttonCount: document.querySelectorAll('button').length}))()" 2>&1

echo ""
echo "=== QA NAV DONE ==="
