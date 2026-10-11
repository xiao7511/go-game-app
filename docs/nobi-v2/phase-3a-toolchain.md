# Phase 3A Android toolchain verification

2026-10-10, Windows; local debug verification only.

| Item | Actual result |
|---|---|
| Global Java | Existing Temurin 21; Android Studio JBR 25; neither is selected for this Gradle 8.0.2 build |
| Project-local JDK | Temurin 17.0.20.1+1, official Windows ZIP SHA-256 verified; ignored `.nobi-isolated/toolchains/jdk17` |
| Android SDK | Existing user SDK; Platform 34 and Build Tools 34.0.0 installed and files checked |
| AGP | 8.0.0 → 8.1.4 for SDK 34 compatibility; Gradle remains 8.0.2, Java compilation remains 17 |
| Actual build tools | AGP also installed its default 33.0.1 using previously accepted SDK license; 34.0.0 remains available |
| Capacitor | Installed 5.7.8; Web source and generated mobile artifacts are shared |
| Android generation | `cap sync android` restores missing Cordova variables/project; generated plugin folder remains ignored |
| Latest Debug APK | PASS, BUILD SUCCESSFUL in 24s; 82 tasks (23 executed / 59 up-to-date) |
| APK contents | PASS: all 56 original PNG hashes, source 7 Go baseline regions, App's actual 3 protected regions, 5 existing effects, publication guard, no PC adapter |
| iOS resources | PASS: cap copy and original resources; Xcode/IPA NOT RUN on Windows |
| Device execution | NOT RUN; no installation or physical-device validation in this phase |
| Formal release signing | BLOCKED by existing exposed materials; no signing material submitted or used for release |

APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 6,042,374 bytes.
SHA-256: `e99adb529370f6674103dc5e41d4f5fdbd263e69b46965788b905a2ad39eaa34`.
It is a debug artifact, not an IPA, store release, or proof of on-device success. APK is ignored by Git.

JDK ZIP SHA-256: `e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0`.

```powershell
# Project-local JDK preparation; no global JAVA_HOME change
node scripts/prepare-jdk17.mjs
Expand-Archive -LiteralPath .nobi-isolated/toolchains/jdk17.zip -DestinationPath .nobi-isolated/toolchains/jdk17 -Force
# Current native Android CLI (legacy sdkmanager wrapper split package names incorrectly)
& "$env:LOCALAPPDATA/Android/Sdk/cmdline-tools/latest/bin/android.exe" sdk install 'platforms;android-34'
& "$env:LOCALAPPDATA/Android/Sdk/cmdline-tools/latest/bin/android.exe" sdk install 'build-tools;34.0.0'
npm run android:check
npm run android:prepare
npm run android:debug
npm run verify:apk-assets
npx cap copy ios
npm run verify:mobile-assets
```

Debug command sets JAVA_HOME/ANDROID_HOME/GRADLE_USER_HOME only in its child process, uses an ignored independent Gradle cache, and terminates only its owned process tree after 240 seconds. Downloads are bounded; retry only after fixing the reported cause. The first real Gradle build failed because `cordova.variables.gradle` was absent; `cap sync android` fixed it. The next full build succeeded in 3m35s. The latest build succeeded after preserving the exact wood CSS declaration: Vite color minification previously rewrote rgba values, so `cssMinify:false` and compiled render checks now enforce the original baseline. Historical `www/` audit copies are checked among the seven source baselines but are intentionally not packaged; App uses the three root-source regions.

Warnings remain: flatDir repository metadata and old AGP's SDK XML version warning. They did not prevent the observed build. Do not run forced dependency upgrades: root Capacitor 5 dependency audit still has 3 high / 1 critical findings, while the separated frontend tooling and Supabase CLI audit show zero.

References: [AGP 8.1 compatibility](https://developer.android.com/build/releases/agp-8-1-0-release-notes), [Gradle JVM compatibility](https://docs.gradle.org/current/userguide/compatibility.html), [Temurin binary](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.20.1%2B1).
