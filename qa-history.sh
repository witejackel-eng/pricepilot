#!/bin/bash
# Targeted History tab test
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

# Open first product drawer by clicking the product name cell
agent-browser eval "(() => { const cell = document.querySelector('tbody tr td:first-child') || document.querySelector('tbody tr td'); if (cell) { cell.click(); return 'clicked first cell'; } return 'no cell'; })()" 2>&1
sleep 3

echo "=== Drawer open? Check tabs ==="
agent-browser snapshot -i -c 2>&1 | grep -E "tab |Recommendations|Edit|History" | head -10

echo ""
echo "=== Tab states before click ==="
agent-browser eval "Array.from(document.querySelectorAll('[role=tab]')).map(t => ({text: t.textContent, state: t.getAttribute('data-state')}))" 2>&1

echo ""
echo "=== Click History tab via agent-browser native click ==="
HIST_REF=$(agent-browser snapshot -i -c 2>&1 | grep 'tab "History"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
echo "History ref: $HIST_REF"
agent-browser scrollintoview "$HIST_REF" 2>&1
sleep 1
agent-browser click "$HIST_REF" 2>&1
sleep 2

echo ""
echo "=== Tab states after click ==="
agent-browser eval "Array.from(document.querySelectorAll('[role=tab]')).map(t => ({text: t.textContent, state: t.getAttribute('data-state')}))" 2>&1

echo ""
echo "=== Screenshot ==="
agent-browser screenshot /home/z/my-project/download/qa/v12-18-history-clicked.png 2>&1

echo ""
echo "=== Active tabpanel content ==="
agent-browser eval "(() => { const panels = document.querySelectorAll('[role=tabpanel]'); for (const p of panels) { if (p.getAttribute('data-state') === 'active' || !p.hasAttribute('hidden')) { return p.textContent.substring(0, 800); } } return 'panels: ' + panels.length; })()" 2>&1

echo ""
echo "=== Done ==="
