# 安卓登录修复升级包（2026-10-16）

- 发布文件：`app-downloads/Nobi-android-1.0.4.apk`，22,984,033 字节。
- 下载地址：`https://game.nobistudio.com/app-downloads/Nobi-android-1.0.4.apk`。
- 包名 `cn.obsmd.gogame`，versionName `1.0.4`，versionCode `5`。
- APK SHA-256：`703424795d350b747849037c3df4245185d6a65bc787b99baf7b7c1f3567a7b9`。
- 签名证书 SHA-256：`4761ffd8d69a30f5c3e549565be74063facaf699120fcfc96d9bf6f1bf770355`。沿用先前测试包签名，可覆盖升级 1.0.3，不需要卸载或清除账号数据。

基于已发布的 `main` 提交 `02dfa9252c548f564190c3f57f5f933baedb04b6` 构建，包含同一账号项目的自有 HTTPS 登录入口、12 秒连接超时、会话检查重试和登录网络检测。原生包连接香港正式联机服务，不依赖 USB 转发；不含用户登录态、密码或签名私钥。

网页登录、注册、大厅和联机页的安卓图标统一读取 `ui/app-release.js`，更新到此版本，并在构建时校验安装包字节数和 SHA-256。iOS 入口继续使用既有 TestFlight 公开邀请链接。网页专用下载元数据和 APK 不进入原生包。

验证：使用既有 SDK/Build Tools 34、JDK 17 与离线 Gradle 缓存生成；`apksigner verify` 验证 v1/v2 签名；`aapt2 dump badging` 核验真实包名及版本；APK 资源检查验证原始牌面、围棋绘制、音乐、UI 及登录脚本。下载入口通过实际 Web 预览响应检查链接和完整文件哈希。

这是沿用原测试签名的网页分发升级包，不作为 Google Play 商店发布包。本轮不自动安装或操作手机；用户在网页点击安卓图标下载后手动覆盖安装，再在蜂窝网络下验证登录。
