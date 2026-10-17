# 安卓下载入口更新（2026-10-17）

网站首页、大厅、登录、注册和联机页的安卓图标统一通过 `ui/app-release.js` 指向 `app-downloads/Nobi-android-1.0.8.apk`。发布的是已生成并核验的 `Nobi-android-1.0.8-20261017.apk` 的逐字节副本，不重新构建或改变签名。

- 版本：`1.0.8` / versionCode `9`；包名 `cn.obsmd.gogame`。
- 文件大小：43,011,051 字节。
- SHA-256：`2d1600cf8412cfc5aa4882cfe640ec6f31b516cb0488fcafa38ce014f0c9aa20`。
- 签名证书 SHA-256：`4761ffd8d69a30f5c3e549565be74063facaf699120fcfc96d9bf6f1bf770355`，沿用既有测试签名，可覆盖升级。
- 生产下载地址：`https://game.nobistudio.com/app-downloads/Nobi-android-1.0.8.apk`。
- 下载存储：`https://game-pkg.nobistudio.com/Nobi-android-1.0.8.apk`，现有公开 R2 桶 `cs16-storage`。

正式域名当前使用 Cloudflare Pages 项目 `nobigame`，并非 GitHub Pages 的发布结果。Cloudflare Pages 的单文件上限为 25 MiB，本次 APK 超过上限。将该项目构建命令设置为 `node scripts/prepare-cloudflare-downloads.mjs`，保留现有输出目录和环境变量。脚本先核验本地 APK 与 R2 完整文件的大小、SHA-256，成功后仅在一次性构建检出中移除这个 APK，并生成固定下载路径到 R2 的 302 重定向；校验失败停止部署。仓库文件、GitHub Pages 和 App 构建不受该步骤影响。以后升级应先上传对应 APK，再更新发布元数据。

包含最新象棋人机与联机、美化棋盘、持续落点闪烁、单次落子/吃子音效以及共用中国古琴曲库；使用生产 HTTPS 登录和联机服务。Web 构建核对 APK 大小和哈希，原生包继续排除网页下载元数据和 APK。

iOS 入口保持 `https://testflight.apple.com/join/JSrJ2eYE`。该链接属于外部测试组；新版构建加入同一组并按要求完成 Beta 审核后，用户沿用原链接获取更新，无需每次发布改网页链接。
