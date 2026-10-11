#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
 prepare)
  [[ "$(uname -s)" == Darwin ]] || { echo 'Cloud macOS runner required'; exit 2; }
  [[ -n "${NOBI_ONLINE_URL:-}" ]] || { echo 'Configure production online URL'; exit 2; }
  [[ -z "${NOBI_DEVICE_ONLINE:-}" ]] || { echo 'USB test mode must not be shipped to iOS'; exit 2; }
  xcode_major="$(xcodebuild -version | awk '/^Xcode / {split($2,v,"."); print v[1]}')"
  [[ "$xcode_major" -ge 26 ]] || { echo 'Xcode 26+ required'; exit 2; }
  npm ci --ignore-scripts
  npm ci --prefix tooling --ignore-scripts
  npm test
  npm run check:authority
  if [[ -n "${SUPABASE_URL:-}" || -n "${SUPABASE_ANON_KEY:-}" ]]; then
    [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" ]] || { echo 'Both public Auth values required'; exit 2; }
    npm run build:mobile
  else
    node scripts/prepare-mobile-test.mjs --platform=ios
  fi
  node node_modules/@capacitor/cli/bin/capacitor sync ios
  npm run ios:check
  ;;
 signing)
  [[ "${APP_STORE_APPLE_ID:-}" =~ ^[1-9][0-9]+$ ]] || { echo 'Configure the game APP_STORE_APPLE_ID in codemagic.yaml'; exit 2; }
  xcode-project use-profiles
  latest="$(app-store-connect get-latest-testflight-build-number "$APP_STORE_APPLE_ID")"
  [[ "$latest" =~ ^[0-9]+$ ]] || { echo 'Could not obtain latest TestFlight build number'; exit 2; }
  cd ios/App
  agvtool new-version -all "$((latest+1))"
  ;;
 *) echo 'Use prepare or signing'; exit 2;;
esac
