#!/usr/bin/env bash
set -euo pipefail
# Run on the authorized Shanghai host after uploading the allowlisted release and public env.
release=/opt/nobi-online/releases/20261011-avatar-rooms
runtime=/opt/nobi-online/node-v24.21.0-linux-x64
sudo mkdir -p "$release" /opt/nobi-online /var/lib/nobi-online
if ! id nobi-online >/dev/null 2>&1; then sudo useradd --system --user-group --home-dir /var/lib/nobi-online --shell /usr/sbin/nologin nobi-online; fi
sudo chown nobi-online:nobi-online /var/lib/nobi-online
sudo chmod 700 /var/lib/nobi-online
if [ ! -x "$runtime/bin/node" ]; then
  curl -fsSL --retry 2 https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz -o /tmp/nobi-node24.tar.xz
  echo 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6  /tmp/nobi-node24.tar.xz' | sha256sum -c -
  sudo tar -xJf /tmp/nobi-node24.tar.xz -C /opt/nobi-online
fi
sudo ln -sfn "$runtime" /opt/nobi-online/runtime
sudo tar -xzf /tmp/nobi-online-release-20261011.tar.gz -C "$release"
sudo install -m 600 /tmp/nobi-online.env /etc/nobi-online.env
sudo install -m 644 "$release/infrastructure/nobi-online.service" /etc/systemd/system/nobi-online.service
if [ -L /opt/nobi-online/current ]; then readlink /opt/nobi-online/current | sudo tee /opt/nobi-online/previous-release >/dev/null; fi
sudo ln -sfn "$release" /opt/nobi-online/current
sudo systemctl daemon-reload
sudo systemctl enable --now nobi-online
sudo systemctl restart nobi-online
for attempt in {1..20}; do if curl -fsS http://127.0.0.1:55480/health >/dev/null; then break; fi; sleep 1; done
curl -fsS http://127.0.0.1:55480/health
sudo install -m 644 "$release/infrastructure/nginx-online-location.conf" /etc/nginx/snippets/nobi-online.conf
sudo python3 - <<'PY'
from pathlib import Path
from datetime import datetime
p=Path('/etc/nginx/sites-enabled/supabase-game').resolve()
source=p.read_text()
directive='    include /etc/nginx/snippets/nobi-online.conf;\n'
if directive not in source:
    anchor='    location / {'
    if source.count(anchor)!=1: raise RuntimeError('Unexpected nginx site layout; no changes made')
    backup=p.with_name(p.name+'.nobi-backup-'+datetime.now().strftime('%Y%m%d%H%M%S'))
    backup.write_text(source)
    p.write_text(source.replace(anchor,directive+'\n'+anchor,1))
    Path('/opt/nobi-online/nginx-backup').write_text(str(backup))
PY
if ! sudo nginx -t; then
  if [ -f /opt/nobi-online/nginx-backup ]; then sudo cp "$(cat /opt/nobi-online/nginx-backup)" /etc/nginx/sites-enabled/supabase-game; fi
  exit 1
fi
sudo systemctl reload nginx
curl -fsS https://supabase-game.nobistudio.com/nobi-online/health
sudo systemctl is-active nobi-online
rm -f /tmp/nobi-online.env
