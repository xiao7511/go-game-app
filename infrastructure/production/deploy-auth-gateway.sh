#!/usr/bin/env bash
set -euo pipefail
# Run as root on the authorized Hong Kong proxy host. No credentials required.
if [ "$(id -u)" != 0 ]; then echo 'Run with sudo bash' >&2; exit 1; fi
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
site=/etc/nginx/conf.d/supabase-proxy.conf
snippet=/etc/nginx/snippets/nobi-auth.conf
logging=/etc/nginx/conf.d/nobi-auth-logging.conf
for name in nginx-auth-location.conf nginx-auth-logging.conf; do test -f "$source_dir/$name"; done
test -f "$site"
nginx -t
# Validate the insertion before changing any live configuration.
python3 - "$site" <<'PY'
from pathlib import Path
import sys
text=Path(sys.argv[1]).read_text()
directive='    include /etc/nginx/snippets/nobi-auth.conf;'
assert 'server_name api.nobistudio.com;' in text, 'Unexpected server'
assert text.count(directive)<=1, 'Duplicate include'
assert directive in text or text.count('    location / {')==1, 'Unexpected site layout'
PY
backup=$(mktemp -d /var/backups/nobi-auth-XXXXXXXX)
for file in "$site" "$snippet" "$logging"; do
  if [ -e "$file" ]; then cp -p -- "$file" "$backup/$(basename "$file")"; fi
done
rollback() {
  for file in "$site" "$snippet" "$logging"; do
    if [ -e "$backup/$(basename "$file")" ]; then
      cp -p -- "$backup/$(basename "$file")" "$file"
    else
      rm -f -- "$file"
    fi
  done
  if nginx -t; then systemctl reload nginx; fi
  echo "Auth gateway deployment failed; restored configuration from $backup" >&2
}
trap rollback ERR
install -m 644 "$source_dir/nginx-auth-location.conf" "$snippet"
install -m 644 "$source_dir/nginx-auth-logging.conf" "$logging"
python3 - "$site" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
text=p.read_text()
directive='    include /etc/nginx/snippets/nobi-auth.conf;'
if directive not in text:
    p.write_text(text.replace('    location / {',directive+'\n\n    location / {',1))
PY
nginx -t
systemctl reload nginx
trap - ERR
echo "Auth gateway installed; backup: $backup"
