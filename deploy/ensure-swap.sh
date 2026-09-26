#!/bin/bash
# ============================================
# OnlyFunds — make sure there is somewhere to overflow to
#
# The droplet has 1GB of RAM. `vite build` wants most of that on its own,
# and when it asks for more than is left the kernel kills it — the build
# stops, the old files stay where they are, and the site quietly keeps
# serving the previous version. Nothing in the app looks broken, which is
# the worst way for this to fail.
#
# A swap file is the fix: slower than RAM and never touched when there is
# room, but it turns "killed" into "took a bit longer".
#
# Safe to run any number of times; it does nothing when swap already
# exists, or when the disk is too full to spare the space.
# ============================================

set -uo pipefail

SIZE_GB="${1:-2}"
SWAP_FILE="/swapfile"

if [[ "$(id -u)" != "0" ]]; then
  echo "[swap] needs root — skipping"
  exit 0
fi

if [[ -n "$(swapon --show --noheadings 2>/dev/null)" ]]; then
  echo "[swap] already on: $(free -h | awk '/Swap:/ {print $2}')"
  exit 0
fi

FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
if (( FREE_GB < SIZE_GB + 2 )); then
  echo "[swap] only ${FREE_GB}GB free on / — not creating a ${SIZE_GB}GB swap file"
  exit 0
fi

echo "[swap] creating a ${SIZE_GB}GB swap file (one time)"
fallocate -l "${SIZE_GB}G" "$SWAP_FILE" 2>/dev/null || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$((SIZE_GB * 1024)) status=none
chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE" >/dev/null
swapon "$SWAP_FILE"

# Survive a reboot.
if ! grep -q "^$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# Prefer RAM; the swap is a safety net for the build, not a place to live.
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "[swap] on: $(free -h | awk '/Swap:/ {print $2}')"
