#!/usr/bin/env bash
# Install (or refresh) the macro-dashboard cron entries for the current user.
#
# Idempotent — replaces any prior block bounded by # macro-dashboard markers.
# Existing user crontab outside the block is preserved.
#
# Usage: bash scripts/setup_cron.sh
#        bash scripts/setup_cron.sh --uninstall

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NPM=$(command -v npm)
PY="$ROOT/.venv/bin/python"
LOG_DIR="${MACRO_LOG_DIR:-/tmp/macrodash}"

mkdir -p "$LOG_DIR"

START_MARK="# >>> macro-dashboard >>>"
END_MARK="# <<< macro-dashboard <<<"

current="$(crontab -l 2>/dev/null || true)"
# Drop any existing block.
filtered="$(printf '%s\n' "$current" | awk -v s="$START_MARK" -v e="$END_MARK" '
  $0==s {skip=1; next}
  $0==e {skip=0; next}
  !skip {print}
')"

if [[ "${1-}" == "--uninstall" ]]; then
  echo "$filtered" | crontab -
  echo "macro-dashboard cron block removed."
  exit 0
fi

block="$START_MARK
# Macro-dashboard scheduled tasks. Edit scripts/setup_cron.sh and re-run.
*    * * * * $ROOT/scripts/keep_gateway_alive.sh >> $LOG_DIR/gateway-keepalive.log 2>&1
*/5  * * * * cd $ROOT && $NPM run -s task:news      >> $LOG_DIR/news.log      2>&1
*/10 * * * * cd $ROOT && $NPM run -s task:sentiment >> $LOG_DIR/sentiment.log 2>&1
0    * * * * cd $ROOT && $NPM run -s task:calendar  >> $LOG_DIR/calendar.log  2>&1
*/30 * * * * cd $ROOT && $PY scripts/ibkr_backfill.py --all --duration '5 D' --throttle 2 >> $LOG_DIR/ibkr.log 2>&1
0    6 * * * cd $ROOT && $PY scripts/fred_backfill.py >> $LOG_DIR/fred.log 2>&1
$END_MARK"

# Combine and install.
{
  printf '%s\n' "$filtered"
  printf '%s\n' "$block"
} | sed '/^$/N;/\n$/D' | crontab -

echo "macro-dashboard cron installed. Logs → $LOG_DIR/"
echo
echo "Schedule:"
printf '%s\n' "$block" | grep -E '^\*|^[0-9]'
echo
echo "To remove: bash scripts/setup_cron.sh --uninstall"
