#!/usr/bin/env bash
set -euo pipefail
# Existing host/service/env only. Keep the old release and a consistent SQLite backup.
release=/opt/nobi-online/releases/20261012-huaian-chat
previous=$(readlink /opt/nobi-online/current)
case "$previous" in /opt/nobi-online/releases/*) ;; *) echo 'Unexpected current release' >&2; exit 1;; esac
sudo mkdir -p "$release"
sudo tar -xzf /tmp/nobi-huaian-20261012.tar.gz -C "$release"
sudo chown -R root:root "$release"
sudo chmod -R a+rX "$release"
sudo -u nobi-online /opt/nobi-online/runtime/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const db=new DatabaseSync("/var/lib/nobi-online/rooms.sqlite");db.exec("VACUUM INTO '\''/var/lib/nobi-online/pre-huaian-"+Date.now()+".sqlite'\''");db.close();'
sudo ln -sfn "$release" /opt/nobi-online/current
sudo systemctl restart nobi-online
healthy=false
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:55480/health | grep -q 'room-chat'; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then
  sudo ln -sfn "$previous" /opt/nobi-online/current
  sudo systemctl restart nobi-online
  echo 'Upgrade failed; previous release restored' >&2
  exit 1
fi
sudo systemctl is-active nobi-online
curl -fsS https://api.nobistudio.com/nobi-online/health
