#!/bin/bash
# History tab via keyboard
set +e
cd /home/z/my-project/pricepilot

pkill -f "pp-server.js" 2>/dev/null
sleep 1
node pp-server.js > pp-server.log 2>&1 &
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null)
  [ "$CODE" = "200" ] && break
  sleep 1
done

get_ref() {
  agent-browser snapshot -i -c 2>&1 | grep "$1" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/'
}

agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 1200 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10
agent-browser click "$(get_ref 'Skip setup')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Not Now')" 2>&1
sleep 2
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Try Sample Data')" 2>&1
sleep 5

# Open drawer
agent-browser eval "document.querySelector('tbody tr td')?.click()" 2>&1
sleep 3

echo "=== Tabs before ==="
agent-browser eval "Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.trim() + ':' + t.getAttribute('data-state')).join(' | ')" 2>&1

echo ""
echo "=== Focus + keyboard navigate to History ==="
# Click the Recommendations tab first to focus the tablist
REC_REF=$(agent-browser snapshot -i -c 2>&1 | grep 'tab "Recommendations"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
echo "Rec tab ref: $REC_REF"
agent-browser click "$REC_REF" 2>&1
sleep 1
# Press Right twice to go to History (Edit is in between)
agent-browser press ArrowRight 2>&1
sleep 0.5
agent-browser press ArrowRight 2>&1
sleep 1
echo "Tab states after keyboard nav:"
agent-browser eval "Array.from(document.querySelectorAll('[role=tab]')).map(t => t.textContent.trim() + ':' + t.getAttribute('data-state')).join(' | ')" 2>&1

echo ""
echo "=== Screenshot ==="
agent-browser screenshot /home/z/my-project/download/qa/v12-19-history-keyboard.png 2>&1

echo ""
echo "=== Active panel ==="
agent-browser eval "(() => { const p = document.querySelector('[role=tabpanel]:not([hidden])') || document.querySelector('[data-state=active][role=tabpanel]'); if (p) return p.textContent.substring(0, 600); const all = document.querySelectorAll('[role=tabpanel]'); return 'panels: ' + all.length + ' | hidden: ' + Array.from(all).filter(x=>x.hidden).length; })()" 2>&1

echo ""
echo "=== Check for Price History / No price changes text ==="
agent-browser eval "document.body.innerText.includes('Price History') ? 'FOUND Price History' : document.body.innerText.includes('No price changes') ? 'FOUND empty state' : 'NOT FOUND'" 2>&1
