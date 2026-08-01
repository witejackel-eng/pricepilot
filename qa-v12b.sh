#!/bin/bash
# QA test for leaderboard + price history (requires sample data)
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
echo "Server ready"

echo "=== [2] Open app + skip onboarding ==="
agent-browser close --all 2>&1 | tail -1
agent-browser set viewport 1440 900 2>&1
agent-browser open "http://127.0.0.1:3001/" 2>&1
sleep 10
agent-browser click "$(get_ref 'Skip setup')" 2>&1
sleep 3
agent-browser click "$(get_ref 'Not Now')" 2>&1
sleep 2

echo "=== [3] Go to Products page ==="
agent-browser snapshot -i -c 2>&1 | grep -E 'button.*Products|button.*Home' | head -5
PROD_REF=$(get_ref 'button "Products"')
echo "Products ref: $PROD_REF"
agent-browser click "$PROD_REF" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-08-products-page.png 2>&1
echo "Products page text (first 400):"
agent-browser eval "document.body.innerText.substring(0, 400)" 2>&1

echo ""
echo "=== [4] Click 'Try Sample Data' ==="
agent-browser snapshot -i -c 2>&1 | grep -iE "sample|data" | head -5
SAMPLE_REF=$(get_ref "Try Sample Data")
echo "Sample Data ref: $SAMPLE_REF"
if [ -n "$SAMPLE_REF" ]; then
  agent-browser click "$SAMPLE_REF" 2>&1
  sleep 5
  agent-browser screenshot /home/z/my-project/download/qa/v12-09-products-loaded.png 2>&1
  echo "After sample load (first 500):"
  agent-browser eval "document.body.innerText.substring(0, 500)" 2>&1
else
  echo "Sample Data not found - trying direct eval click"
  agent-browser eval "(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(b => b.textContent.includes('Sample Data')); if (b) { b.click(); return 'clicked'; } return 'not found: ' + btns.map(b=>b.textContent.substring(0,30)).join(' | '); })()" 2>&1
  sleep 5
  agent-browser screenshot /home/z/my-project/download/qa/v12-09-products-loaded.png 2>&1
fi

echo ""
echo "=== [5] Go to Home to see Leaderboard ==="
HOME_REF=$(get_ref 'button "Home"')
echo "Home ref: $HOME_REF"
agent-browser click "$HOME_REF" 2>&1
sleep 4
agent-browser screenshot /home/z/my-project/download/qa/v12-10-home-leaderboard.png 2>&1
echo "Home with leaderboard (check for 'Leaderboard' text):"
agent-browser eval "document.body.innerText.includes('Leaderboard') ? 'FOUND: ' + document.body.innerText.match(/.{0,30}Leaderboard.{0,80}/)?.[0] : 'NOT FOUND'" 2>&1

echo ""
echo "=== [6] Go back to Products + open first product drawer ==="
agent-browser click "$(get_ref 'button "Products"')" 2>&1
sleep 3
# Click the first product row by evaluating JS
agent-browser eval "(() => { const rows = document.querySelectorAll('tr[class*=cursor], tr[role=button], [data-testid*=product-row], tbody tr'); if (rows.length > 0) { rows[0].click(); return 'clicked row 1 of ' + rows.length; } return 'no rows found'; })()" 2>&1
sleep 3
agent-browser screenshot /home/z/my-project/download/qa/v12-11-product-drawer.png 2>&1
echo "Drawer tabs visible:"
agent-browser snapshot -i -c 2>&1 | grep -iE "tab|recommend|edit|history" | head -10

echo ""
echo "=== [7] Click History tab ==="
HIST_REF=$(get_ref "History")
echo "History ref: $HIST_REF"
if [ -n "$HIST_REF" ]; then
  agent-browser click "$HIST_REF" 2>&1
  sleep 3
  agent-browser screenshot /home/z/my-project/download/qa/v12-12-price-history.png 2>&1
  echo "History tab content (first 600):"
  agent-browser eval "document.body.innerText.substring(0, 600)" 2>&1
else
  echo "History tab not found via ref. Trying find by text"
  agent-browser find text "History" click 2>&1
  sleep 3
  agent-browser screenshot /home/z/my-project/download/qa/v12-12-price-history.png 2>&1
fi

echo ""
echo "=== QA DONE ==="
