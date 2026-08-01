#!/bin/bash
# QA Runner: starts static server + runs agent-browser QA in one session
set +e

echo "=== [1] Starting static server on port 3001 ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1

cd /home/z/my-project/pricepilot
node /home/z/my-project/pricepilot/pp-server.js > /home/z/my-project/pricepilot/pp-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ | grep -q "200"; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

echo "=== [2] Close existing browser ==="
agent-browser close --all 2>&1 | tail -1
sleep 1

echo "=== [3] Open PricePilot via gateway ==="
agent-browser set viewport 1440 900 2>&1
agent-browser open "http://127.0.0.1:81/?XTransformPort=3001" 2>&1
sleep 8

echo "=== [4] Initial state ==="
agent-browser get url 2>&1
agent-browser get title 2>&1
agent-browser screenshot /home/z/my-project/download/qa/01-initial.png 2>&1

echo "=== [5] Snapshot (interactive) ==="
agent-browser snapshot -i -c 2>&1 | head -60

echo "=== [6] Wait for hydration (app uses IndexedDB) ==="
sleep 6
agent-browser screenshot /home/z/my-project/download/qa/02-hydrated.png 2>&1
agent-browser snapshot -i -c 2>&1 | head -80

echo "=== [7] Check for JS errors ==="
agent-browser eval "(() => { try { return JSON.stringify({ready: document.readyState, bodyLen: document.body.innerText.length, text: document.body.innerText.substring(0, 300)}); } catch(e) { return 'ERR:' + e.message; } })()" 2>&1

echo "=== [8] Network requests summary ==="
agent-browser network requests 2>&1 | head -30

echo "=== [9] Done. Server still running at PID $SERVER_PID ==="
echo "Server log:"
tail -5 /home/z/my-project/pricepilot/pp-server.log
