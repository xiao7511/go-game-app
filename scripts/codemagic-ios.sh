#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

next_build_number() {
  # Codemagic BUILD_NUMBER is unique within the ios-testflight-release workflow.
  # Never reset that workflow ID or use a fallback for a failed Apple API request.
  [[ "${BUILD_NUMBER:-}" =~ ^[1-9][0-9]{0,3}$ ]] || { echo 'Codemagic BUILD_NUMBER must be an integer from 1 to 9999' >&2; return 2; }
  local lookup_log latest lookup_status current_versions current next
  lookup_log="$(mktemp)"
  if latest="$(app-store-connect get-latest-testflight-build-number "$APP_STORE_APPLE_ID" \
    --platform IOS --pre-release-version "$NOBI_IOS_MARKETING_VERSION" \
    --log-stream stderr --no-color 2>"$lookup_log")"; then
    lookup_status=0
  else
    lookup_status=$?
  fi
  cat "$lookup_log" >&2
  if [[ "$lookup_status" -ne 0 ]]; then
    rm -f "$lookup_log"
    echo 'Apple build lookup failed; refusing to infer a first release' >&2
    return "$lookup_status"
  fi
  if [[ -z "$latest" ]]; then
    if ! grep -Fxq "Did not find latest build for app $APP_STORE_APPLE_ID" "$lookup_log"; then
      rm -f "$lookup_log"
      echo 'Unexpected empty Apple build lookup; refusing to infer a first release' >&2
      return 2
    fi
    latest=0
  fi
  rm -f "$lookup_log"
  [[ "$latest" =~ ^(0|[1-9][0-9]{0,3})$ ]] || { echo 'Invalid Apple build number; no fallback applied' >&2; return 2; }
  next=$((10#$BUILD_NUMBER))
  if [[ "$latest" -gt 0 ]] && [[ "$((10#$latest+1))" -gt "$next" ]]; then
    next=$((10#$latest+1))
  fi
  current_versions="$(cd ios/App && agvtool what-version -terse)" || return $?
  [[ -n "$current_versions" ]] || { echo 'No Xcode project build number found' >&2; return 2; }
  while IFS= read -r current; do
    [[ "$current" =~ ^[1-9][0-9]{0,3}$ ]] || { echo 'Invalid Xcode project build number' >&2; return 2; }
    if [[ "$((10#$current))" -gt "$next" ]]; then next=$((10#$current)); fi
  done <<< "$current_versions"
  [[ "$next" -le 9999 ]] || { echo 'Build number exceeds the CFBundleVersion integer range' >&2; return 2; }
  printf '%s\n' "$next"
}

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
  [[ "${NOBI_IOS_MARKETING_VERSION:-}" == '1.0' ]] || { echo 'The game release version must remain 1.0'; exit 2; }
  xcode-project use-profiles
  next="$(next_build_number)"
  (cd ios/App && agvtool new-version -all "$next" && agvtool new-marketing-version "$NOBI_IOS_MARKETING_VERSION")
  node scripts/verify-ios-release.mjs project "$next" "$NOBI_IOS_MARKETING_VERSION"
  ;;
 *) echo 'Use prepare or signing'; exit 2;;
esac
