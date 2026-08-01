#!/bin/bash
# Better QA using refs from snapshots
set +e
cd /home/z/my-project/pricepilot

echo "=== [1] Start server ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1
node pp-server.js > pp-server.log 2>&1 &
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

echo "=== [3] Snapshot to get refs ==="
agent-browser snapshot -i -c 2>&1

echo ""
echo "=== [4] Click Skip setup (ref e5) ==="
agent-browser click @e5 2>&1
sleep 5
agent-browser screenshot /home/z/my-project/download/qa/05-after-skip.png 2>&1
echo "URL: $(agent-browser get url 2>&1)"

echo ""
echo "=== [5] Snapshot main app ==="
agent-browser snapshot -i -c 2>&1 | head -60

echo ""
echo "=== [6] Full text of main view ==="
agent-browser eval "document.body.innerText.substring(0, 1500)" 2>&1

echo ""
echo "=== [7] Click through nav items using refs ==="
# Re-snapshot to get fresh refs for nav
agent-browser snapshot -i -c -u 2>&1 | head -80

echo ""
echo "=== DONE ==="
