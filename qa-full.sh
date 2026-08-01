#!/bin/bash
# Comprehensive QA: start server + run full browser QA in one session
set +e
cd /home/z/my-project/pricepilot

echo "=== [1] Kill any existing server ==="
pkill -f "pp-server.js" 2>/dev/null
sleep 1

echo "=== [2] Start static server on 0.0.0.0:3001 ==="
node pp-server.js > pp-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    echo "Server ready after ${i}s (HTTP $CODE)"
    break
  fi
  sleep 1
done

echo "=== [3] Verify assets load ==="
echo "HTML: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/)"
echo "CSS:  $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/_next/static/chunks/34d933785a17edf3.css)"
echo "JS:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/_next/static/chunks/9057167649f2d92e.js)"
echo "Font: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/_next/static/media/797e433ab948586e-s.p.29207c2f.woff2)"

echo "=== [4] Close existing browser ==="
agent-browser close --all 2>&1 | tail -1
sleep 1

echo "=== [5] Set viewport + open PricePilot directly ==="
agent-browser set viewport 1440 900 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 4

echo "=== [6] Initial page state ==="
echo "URL: $(agent-browser get url 2>&1)"
echo "Title: $(agent-browser get title 2>&1)"
agent-browser screenshot /home/z/my-project/download/qa/01-initial.png 2>&1

echo "=== [7] Wait for hydration (app uses IndexedDB) ==="
sleep 10
agent-browser screenshot /home/z/my-project/download/qa/02-hydrated.png 2>&1

echo "=== [8] Snapshot interactive elements ==="
agent-browser snapshot -i -c 2>&1 | head -80

echo "=== [9] Check document state ==="
agent-browser eval "(() => { try { return JSON.stringify({ready: document.readyState, bodyLen: document.body.innerText.length, text: document.body.innerText.substring(0, 500)}); } catch(e) { return 'ERR:' + e.message; } })()" 2>&1

echo "=== [10] Network requests (first 20) ==="
agent-browser network requests 2>&1 | head -25

echo "=== [11] Failed requests (non-200) ==="
agent-browser network requests 2>&1 | grep -v " 200 " | head -15

echo ""
echo "=== QA DONE. Server PID $SERVER_PID still alive? ==="
ps -p $SERVER_PID > /dev/null && echo "YES - server alive" || echo "NO - server died"
