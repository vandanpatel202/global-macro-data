#!/usr/bin/env bash
# Keep IB Gateway alive. Run from cron every minute. If a Gateway process
# (IbcGateway → JVM under xvfb-run) is already up, exit. Otherwise start one.
#
# This is a stand-in for systemd in this container (PID 1 is sshd, no systemd).
# Note: when Gateway is restarted from cold, IBKR pushes 2FA — you'll need to
# approve on your phone within ~3 min or the launch aborts (TWOFA_TIMEOUT_ACTION=exit
# in ~/ibc/config.ini).

set -u

# Already running? ibcalpha.ibc.IbcGateway in the JVM cmdline is the marker.
if pgrep -f 'ibcalpha.ibc.IbcGateway' >/dev/null 2>&1; then
  exit 0
fi

LOG_DIR="/home/devuser/ibc/logs"
mkdir -p "$LOG_DIR"
echo "[$(date -Is)] starting gateway (no IbcGateway process found)" >> "$LOG_DIR/keepalive.log"

# Detach so cron's invocation can exit cleanly while the gateway keeps running.
nohup setsid /usr/bin/xvfb-run -a /home/devuser/ibc/gatewaystart.sh -inline \
  >> "$LOG_DIR/keepalive.out" 2>&1 < /dev/null &
disown
