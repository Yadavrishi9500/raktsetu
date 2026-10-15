#!/usr/bin/env bash
# Run as root on a fresh Amazon Linux 2023 instance launched with the CI instance profile:
#   sudo dnf install -y git && git clone <your repo> && cd raktsetu/infra/chef
#   cp node.json.example node.json && nano node.json
#   sudo ./bootstrap.sh
# Re-run any time to re-converge (fixes drift, applies attribute changes).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v cinc-client >/dev/null 2>&1 && ! command -v chef-client >/dev/null 2>&1; then
  echo "Installing Cinc Client 18 (the free, community build of Chef Infra Client)"
  curl -fsSL https://omnitruck.cinc.sh/install.sh | bash -s -- -v 18
fi
CLIENT=$(command -v cinc-client || command -v chef-client)

[ -f node.json ] || { echo "Create node.json from node.json.example first"; exit 1; }

"$CLIENT" --local-mode --config solo.rb --json-attributes node.json --chef-license accept-silent
echo
echo "Converged. First deploy:  sudo -u deploy raktsetu-deploy --force"
echo "Auto-deploy timer:        systemctl list-timers raktsetu-deploy.timer"
echo "Deploy log:               tail -f /var/log/raktsetu/deploy.log"
