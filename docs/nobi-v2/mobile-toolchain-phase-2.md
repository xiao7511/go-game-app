# Phase 2 App 工具链与 Codemagic 接入条件

2026-10-11 最新进展见 [Android 真机批次](mobile-device-testing.md) 与 [TestFlight 准备](testflight-preparation.md)：当前已具备 SDK 34 / Java 17，Debug APK 构建和资源校验成功，ZTE 真机原生冒烟完成；下面保留历史工具链阻断记录。

## 正式指令复查（2026-10-10，最新）

Web/mobile与Android/iOS cap copy、复制后56 PNG/7渲染区域/5音效/UI守卫PASS；66单元/23 Edge通过。仅网页产物，不是APK/IPA。

最新JAVA_HOME和java为Temurin21.0.12.1（旧报告的JDK17已不适用）；当前SDK仍只有platform36/37.0、build-tools35/36，缺compileSdk34。`adb devices`实际为空，检查启动了本机daemon，未操作设备。Docker Server29.7.2可用，Supabase CLI未在PATH发现，且没有配置一次性测试实例/四账号。

重新执行下方相同Gradle Debug命令：wrapper进入8.0.2-all下载，持续未完成分发，最终主动中止（退出1）；**本次不是已发生10s读取超时**。没有执行JUnit/APK任务，未交付APK。不要把下载进度当构建成功。未改签名、SDK级别、wrapper配置或执行sync。

重试建议：在受控网络完整下载并核验所需Gradle分发、准备SDK34与兼容JDK，检查生成插件工程后重试Debug任务；单纯加`--offline`不能补齐缺失分发。iOS仍需Mac/Xcode/Pods；Codemagic/签名/正式发布未执行。下方保留历史失败和工具链状态，以本节覆盖当前环境信息。

## 此前检查记录（历史）

2026-10-10，只读核查和一次本地 Debug 构建尝试。没有安装/升级 SDK、创建发布签名、调用云构建或上传文件。

## 实际证据

| 项目 | 状态 / 证据 |
| --- | --- |
| Capacitor | `webDir=dist/mobile`、appName=Nobi 游戏、appId=`cn.obsmd.gogame`、Android https scheme；未改 ID/协议 |
| Android | namespace/applicationId 一致，Java 17、min 22 / compile & target 34；Activity 已声明 orientation/screenSize 等 configChanges，不强制锁方向 |
| SDK | SDK 目录实际存在；platforms 为 android-36、android-37.0，build-tools 35.0.0 / 36.0.0，**缺当前 compileSdk 34**；SDK 两个环境变量和 local.properties 均未设置 |
| Java / Gradle | JAVA_HOME 为 JDK 17；项目 wrapper 8.0.2，缓存只有 zip.part/zip.lck，没有完整分发；缺生成的 capacitor-cordova-android-plugins 目录 |
| Android 设备 | SDK 路径中的 `adb devices` 实际运行，列表为空；ADB 为该检查自动启动了本机 daemon，未操作任何设备 |
| iOS | Xcode 工程/xcworkspace/Podfile 存在；平台 iOS 13、Capacitor 本地 Pods；PRODUCT_BUNDLE_IDENTIFIER=`cn.obsmd.gogame`，未改；Xcode/Pods 在 Windows NOT RUN |
| 横竖屏 | iPhone 支持 portrait / landscapeLeft / landscapeRight，iPad 另有 upsideDown；JS 不再在普通点击/resize 强制全屏，不使用未经验证的方向锁插件 |
| 资源 | Web/mobile 构建及 Android/iOS cap copy、复制后守卫 PASS；App 无 PC adapter，牌图/音效/新 match UI 均进入 public |

Debug 尝试：在 android 目录，临时为当前进程设置已有 SDK 路径，然后运行：

```powershell
$env:ANDROID_HOME='C:/Users/yexiao/AppData/Local/Android/Sdk'
.\gradlew.bat --offline --no-daemon :app:testDebugUnitTest :app:assembleDebug '-Dorg.gradle.internal.http.connectionTimeout=10000' '-Dorg.gradle.internal.http.socketTimeout=10000'
```

命令 **FAIL / 1**：wrapper 引导下载 `gradle-8.0.2-all.zip`，Read timed out（10000ms）。`--offline` 不阻止没有分发时 wrapper 首次下载。JUnit / APK 构建步骤 **NOT RUN**，无 APK 交付。仍需 SDK 34、依赖缓存和经评估的 Android sync；不能通过更改 compileSdk 假装已有匹配版本。

## Codemagic：接入评估，不触发

Codemagic 支持通过仓库根 `codemagic.yaml` 定义 Capacitor 构建，需授权连接仓库、选定分支和配置环境；原生 iOS 构建需 macOS。依据 [官方 Capacitor 指南](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/)。本仓库当前无根 codemagic.yaml，本轮没有创建自动触发的云 workflow，没有登录账户或授权连接。

**云接入目前 NO-GO**：现有分支/历史含签名材料，未经人工处理或批准的无历史安全源码出口，不能把整个仓库上传/连接云端。不能用“无发布”掩盖 clone 仍会复制历史秘密。签名处置另需所有者确认，不在本轮执行。

解除阻断后的最小方案：

1. 所有者批准安全源码来源、仓库访问边界及 Codemagic 团队权限；先扫描源码、构建产物与历史风险，安全门禁不能 ignore_failure。
2. 固定 Node 24、Java 17、SDK 34、Gradle 8.0.2；iOS 固定支持现有 Capacitor 5 / Pods 的 Xcode版本（上云实测后锁定，不能猜最新 Xcode必兼容）。分别跑根和 tooling 的 `npm ci --ignore-scripts`，审计依赖。
3. `npm test`、`npm run verify:assets`、`npm run build:app`、`npm run verify:build`、`npm run verify:mobile-assets`。
4. Android 在专用 CI 执行经审查的 `npx cap sync android`、Debug unit / assembleDebug；iOS 在 Mac 执行 sync、Pods，先 build Simulator 且 `CODE_SIGNING_ALLOWED=NO`。sync 是工具链准备，不是本次已完成的 copy。
5. 只保留精确 Debug/Simulator 产物，不归档仓库根、配置秘密、私钥、整个缓存目录。测试日志必须脱敏。首轮不启用发布、TestFlight、商店上传、自动 branch/tag trigger。
6. 真实设备验收后，**再单独申请**发行签名、Secret 安全注入与发布；不能使用本仓库暴露的材料直接签包。

真机门禁：Android WebView/iOS WKWebView/Safari、DPR、刘海与底部安全区、手机旋转、手牌拖选、完整19路棋盘、硬件返回、前后台/来电/耳机中断、安装升级与低内存恢复。浏览器尺寸模拟和 cap copy 均不能替代这些结果。
