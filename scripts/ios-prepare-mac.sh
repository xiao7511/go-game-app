#!/bin/bash
# Run on a Mac from the clean preparation source package. No upload is performed.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---simulator}"
case "$mode" in --simulator|--archive) ;; *) echo 'Use --simulator or --archive'; exit 2;; esac
[[ "$(uname -s)" == Darwin ]] || { echo 'Mac required'; exit 2; }
command -v node >/dev/null
command -v pod >/dev/null
xcode_major="$(xcodebuild -version | awk '/^Xcode / {split($2,v,"."); print v[1]}')"
sdk_major="$(xcrun --sdk iphoneos --show-sdk-version | cut -d. -f1)"
[[ "$xcode_major" -ge 26 && "$sdk_major" -ge 26 ]] || { echo 'Xcode 26+ / iOS 26 SDK required for current TestFlight submissions'; exit 2; }
npm ci --ignore-scripts
npm ci --prefix tooling --ignore-scripts
npm run mobile:prepare:test -- --platform=ios
node node_modules/@capacitor/cli/bin/capacitor sync ios
node scripts/ios-readiness.mjs
mkdir -p .nobi-isolated/mobile-device
if [[ "$mode" == --simulator ]]; then
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath .nobi-isolated/mobile-device/ios-derived CODE_SIGNING_ALLOWED=NO build
else
  [[ "${IOS_DEVELOPMENT_TEAM:-}" =~ ^[A-Z0-9]{10}$ ]] || { echo 'Set IOS_DEVELOPMENT_TEAM in this Mac session'; exit 2; }
  [[ "${IOS_BUILD_NUMBER:-}" =~ ^[1-9][0-9]*$ ]] || { echo 'Set a new IOS_BUILD_NUMBER, higher than previous uploaded builds'; exit 2; }
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath ".nobi-isolated/mobile-device/Nobi-${IOS_BUILD_NUMBER}.xcarchive" \
    DEVELOPMENT_TEAM="$IOS_DEVELOPMENT_TEAM" CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
    CODE_SIGN_STYLE=Automatic archive
  echo 'Archive created. Validate in Xcode Organizer before TestFlight upload.'
fi
