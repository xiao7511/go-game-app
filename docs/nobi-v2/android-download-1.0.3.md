# 安卓升级包与网页安装入口（2026-10-15）

- 安卓包：`app-downloads/Nobi-android-1.0.3.apk`，22,982,295 字节。
- 包名：`cn.obsmd.gogame`；versionName `1.0.3`，versionCode `4`。
- SHA-256：`ff839de7206c568a49ad425fb32453c42db734c547afbcd716791b4dd91eec11`。
- 签名证书 SHA-256：`4761ffd8d69a30f5c3e549565be74063facaf699120fcfc96d9bf6f1bf770355`，与先前交付的 1.0.2 相同，支持覆盖升级并保留应用数据。
- 沿用已交付版本的 Android Debug 测试签名，供网页下载和真机测试；不是 Google Play 商店发布包。没有创建新证书，也没有将签名材料加入 Git。
- 原生包内连接香港正式 HTTPS 服务 `https://api.nobistudio.com/nobi-online`，登录使用部署网站的公开匿名配置，不依赖 USB 转发，不包含用户会话或账号密码。
- 网页安卓入口更新为相对路径 `app-downloads/Nobi-android-1.0.3.apk`，兼容根域名和 GitHub Pages 子路径。显示版本和无障碍标签均读取同一份发布元数据。
- 网页 iOS 入口使用用户提供的 `https://testflight.apple.com/join/JSrJ2eYE`。加入条件、人数和可用构建以 Apple 页面为准。

## 打包与验证

从已合并最新功能的 `main`（基础提交 `1bc22d6`）准备安卓资源，使用既有 SDK 34、JDK 17 和离线 Gradle 依赖生成 APK。`apksigner verify` 验证签名，`aapt2 dump badging` 检查真实安装包版本；APK 资源验证覆盖原始牌面、围棋受保护绘制区域、音乐以及当前 UI 模块。没有在本轮自动安装到手机；用户可下载后手动覆盖安装。

网页专用的安装入口脚本、样式、下载元数据以及 APK 文件不进入原生包。这样更新网页上的 APK 校验值时，不会改变已生成原生包的预期资源，也不会把安装包嵌套进 App。移动端构建检查会拒绝这些网页专用资源。

网页构建会验证发布文件的字节数和 SHA-256；浏览器测试从实际预览地址下载 APK 并核对校验值，同时检查登录、注册、大厅和联机页面上的两个安装入口。

## 手动安装

在手机浏览器打开网页，点击安卓图标，下载 1.0.3 后选择更新安装。保持原 App，不需要卸载旧版。iPhone 用户点击 iOS 图标进入上述 TestFlight 邀请页。
