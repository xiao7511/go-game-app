# Nobi 游戏：iOS 测试工程包（2026-10-14）

本包在最新代码提交并推送 GitHub 后生成，包含对应源码、iOS 工程和已同步的原生网页资源。它是可供云端构建的工程 ZIP，不是已签名 IPA，也没有上传或分发到 TestFlight。包内 `package-info.json` 记录 Git 提交与分支，`source-manifest.json` 记录每个文件的 SHA-256。

包含近期的联机大厅、等待房间、房主开局前移除玩家、对战好友、邀请接受/拒绝、聊天表情与未读提醒、账号登录控制、CS1.6 网页封面及安卓/iOS 网页下载入口。原生 App 不显示网页下载入口，也不包含安卓 APK。

- App：Nobi 游戏；Apple ID：`6821625687`。
- Bundle ID：`cn.obsmd.gogame`；显示版本保持 `1.0`。
- Codemagic 工作流 ID：`ios-testflight-release`，显示名称：`Nobi signed test IPA (manual)`。保留该 ID，避免重置构建编号序列。
- 复用 `nobi-apple` 连接、已有 Apple Distribution 证书和 Provisioning Profile；包中不含私钥、证书或描述文件。
- 构建号由 Codemagic 计数、Apple 已上传构建号和工程下限共同决定。不要将工程默认 `1` 当成下一次上传号。认证、权限及网络失败会停止编号流程。
- 没有自动构建触发或 `publishing` 配置，构建结束只留下 IPA 和版本报告，人工决定上传与测试分发。

## 人工构建

1. 在 `package-info.json` 核对 `gitBranch` 和 `gitCommit`，使用 GitHub 仓库 `xiao7511/go-game-app` 中该分支的对应提交。这个 ZIP 是备份和本地检查用的 iOS 构建子集，不需要整包覆盖仓库，也不要选择旧的 main 提交构建。
2. Codemagic 中手动点击 **Start new build**，选择 `package-info.json` 记录的分支与 `ios-testflight-release`。首次确认可先运行 `ios-simulator`。
3. 检查复用的签名配置以及 `NOBI_ONLINE_URL=https://api.nobistudio.com/nobi-online`。不要启用 USB 测试地址。
4. 构建会重新安装锁定依赖、运行单元测试、编译手机资源、同步 Capacitor、应用描述文件、写入并验证 `CFBundleVersion` 与 `CFBundleShortVersionString`，然后导出签名 IPA。
5. 构建完成后从 Artifacts 下载 `build/ios/ipa/*.ipa` 和 `build/ios/release-version.json`。两个文件中的应用标识和版本号应一致。

Codemagic 从已连接的 Git 仓库取源码，不直接使用此 ZIP 作为应用安装包。[Codemagic 手动构建与 YAML 文档](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/)。

## 人工上传与内部测试

使用团队自己的上传工具将已签名 IPA 上传到游戏应用记录，等待 Apple 处理后，在 App Store Connect → Nobi 游戏 → TestFlight → 已有内部测试组中分配构建。不要提交正式 App Store 审核，也不要将游戏 IPA 上传到“NOBI 动漫”的应用记录。

App Store Connect 的网页测试组页面用于管理已上传构建；上传二进制使用 Apple 支持的 Xcode、Transporter 或 App Store Connect API 上传工具。此工程没有自动上传步骤；没有 Mac 时，由人工使用已具备上传工具的云端环境或 API 流程完成，不要将 ZIP 改后缀为 IPA。[Apple 上传构建说明](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)。

## 联机服务对应版本

新版 App 的好友邀请与房主移除功能依赖同批后端源码：`server/game-invitations.mjs`、`server/device-test.mjs`、`server/authority.ts`、`server/account-summary.mjs`、`server/room-directory.mjs`。本包包含后端源码供核对；iOS 打包不会部署服务器。生产联机服务升级完成后再验收这些功能，旧服务器不具备新接口。

当前包连接香港生产 HTTPS 地址。本轮在本地隔离服务验证了新增联机功能，不把本地验证作为生产服务器已更新的证明。

## Windows 本地准备检查

在工程根目录使用 Node 24：

```powershell
npm ci --ignore-scripts
npm ci --prefix tooling --ignore-scripts
npm test
npm run check:authority
$env:NOBI_ONLINE_URL='https://api.nobistudio.com/nobi-online'
node scripts/prepare-mobile-test.mjs --platform=ios
npm run ios:check
```

Windows 可以验证工程、图标、资源和配置；实际 Xcode 编译、签名 IPA、上传与 iPhone 真机测试需分别确认。
