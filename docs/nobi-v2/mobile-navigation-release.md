# Mobile scrolling and back navigation

The lobby, account, music and room-directory pages use native vertical scrolling.
Only active matches lock the outer viewport; portrait Go uses its inner layout
scroller. A right swipe starting within 32 CSS pixels of the left edge returns
to the previous internal page and restores its scroll position.

Vertical/diagonal gestures, cancelled touches, multi-touch, board input, card
hands, horizontal scrollers and form controls do not navigate back. Open chat
and settings dialogs close first. Single-player exits use existing engine
cleanup after confirmation. Active online exits wait for the authority service
to confirm `leave`; offline/pending commands retain the room. Waiting-room
back follows the existing directory button and retains the room for re-entry.
Android system back uses the same flow; at the home page it backgrounds the app.

## Verification

- `node scripts/mobile-navigation-check.mjs`: 12 browser checks using native
  Chromium touch events and disposable, locally authenticated accounts, including
  two-player Go, offline protection and opponent synchronization.
- Full Vitest regression suite: 180 passing tests with lockfile-installed
  dependencies in a clean validation directory. Existing working-copy dependency
  modifications are not part of this release.
- `node scripts/verify-apk-assets.mjs --phase=mobile-device`: packaged UI hashes,
  protected Go rendering, original card images and audio.
- Android upgrade: versionName `1.0.2`, versionCode `3`, same debug signing
  identity as the manually installed phone test packages.

## iOS distribution

Use `main`, workflow `ios-testflight-release`. Its stable workflow counter and
App Store Connect lookup keep CFBundleVersion increasing; the marketing version
remains `1.0`. Existing Apple Distribution/profile/integration settings remain.
Production main pushes automatically start this workflow when the connected
Codemagic repository webhook is active.

The current request is internal TestFlight testing. The workflow uploads the IPA
but does not request external beta review (`submit_to_testflight: false`).
Configure the existing App Store Connect internal test group to distribute new
builds automatically. External testing requires separate feedback/review contact
information; missing contact fields must not invalidate internal distribution.
Never count a prepared workflow as an actual TestFlight upload: verify the
new build's processing status and internal group assignment in App Store Connect.
