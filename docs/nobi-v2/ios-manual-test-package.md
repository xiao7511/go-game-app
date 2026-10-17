# Nobi 游戏：iOS 测试打包与手动发布（2026-10-17）

本包在最新代码提交并推送 GitHub 后生成，包含对应源码、iOS 工程和已同步的原生网页资源。它是可供云端构建的工程 ZIP，不是已签名 IPA，也没有上传或分发到 TestFlight。包内 `package-info.json` 记录 Git 提交与分支，`source-manifest.json` 记录每个文件的 SHA-256。

本次更新包含中国象棋人机/联机、棋盘棋子美化、单次落子/吃子音效、中国古琴曲库与三种游戏共用音乐设置，以及最新落点持续闪烁到下一步确认的提示。原有联机大厅、对战好友、邀请、聊天表情与未读提示、移动端滚动/返回等功能保留。原生 App 不显示网页下载入口，也不包含安卓 APK。

对应安卓更新为 `1.0.8` / `versionCode 9`，包名与原测试签名保持一致，连接生产 HTTPS 服务。iOS 工程 ZIP 只用于工程备份和准备检查；真正可安装的签名 IPA 由你在 Codemagic 手动启动构建后生成。本轮不代你点击云构建、上传或分发。

- App：Nobi 游戏；Apple ID：`6821625687`。
- Bundle ID：`cn.obsmd.gogame`；显示版本保持 `1.0`。
- Codemagic 工作流 ID：`ios-testflight-release`，显示名称：`Nobi test IPA and Apple upload (manual)`。保留该 ID，避免重置构建编号序列。
- 复用 `nobi-apple` 连接、已有 Apple Distribution 证书和 Provisioning Profile；包中不含私钥、证书或描述文件。
- 构建号由 Codemagic 计数、Apple 已上传构建号和工程下限共同决定。不要将工程默认 `1` 当成下一次上传号。认证、权限及网络失败会停止编号流程。
- 没有自动构建触发。人工启动发布工作流后会构建、签名并上传 Apple；不自动分配测试组，不提交外部 Beta 审核或 App Store 审核。只需验证编译时可手动选择 `ios-simulator`。

## 人工构建

1. 在 GitHub 仓库 `xiao7511/go-game-app` 核对要发布的分支和提交。合并修复后可选择最新 `main`；如使用工程 ZIP，则在 `package-info.json` 核对来源，它是备份和本地检查用的 iOS 构建子集，不需要整包覆盖仓库。
2. Codemagic 中手动点击 **Start new build**，选择 **Build branch → main**，刷新分支/工作流列表后选择 **ios-testflight-release (Nobi test IPA and Apple upload (manual))**。不要选择仅编译模拟器的 `ios-simulator`。本工作流由人工启动，构建成功后会自动上传 Apple；不需要上传工程 ZIP，也不需要手动修改版本号。
3. 检查复用的签名配置以及 `NOBI_ONLINE_URL=https://api.nobistudio.com/nobi-online`。不要启用 USB 测试地址。
4. 构建会重新安装锁定依赖、运行单元测试、编译手机资源、同步 Capacitor、应用描述文件、写入并验证 `CFBundleVersion` 与 `CFBundleShortVersionString`，然后导出签名 IPA。
5. 构建完成后从 Artifacts 保存 `build/ios/ipa/*.ipa` 和 `build/ios/release-version.json`（后者可能在其他产物 ZIP 中）。两个文件中的应用标识和版本号应一致；检查 Publishing 日志明确显示上传成功，不能仅凭存在 IPA 或出现 Publishing 标题判断已上传。

Codemagic 从已连接的 Git 仓库取源码，不直接使用此 ZIP 作为应用安装包。[Codemagic 手动构建与 YAML 文档](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/)。

## 人工上传与内部测试

发布工作流通过已有 `nobi-apple` 连接上传到游戏应用记录。`submit_to_testflight: false` 只关闭外部 Beta 审核提交，不会关闭 IPA 上传；`submit_to_app_store: false` 关闭正式审核提交。不添加 `beta_groups`，以便由人工分配内部测试。

等待 Apple 处理后，在 App Store Connect → Nobi 游戏（Apple ID `6821625687`，Bundle ID `cn.obsmd.gogame`）→ TestFlight → 已有内部测试组 → 添加构建，选择版本 `1.0` 下本次的新构建号，填写测试说明并添加。若提示缺少出口合规信息，请按应用实际情况完成问答；不猜测回答。测试人员通过 iPhone 的 TestFlight 接受邀请并安装/更新。不要提交正式 App Store 审核，也不要选择“NOBI 动漫”。[Apple 内部测试说明](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)。

已有内部组为 **NOBI Internal Test**。如需公开链接用户也收到新版本，再将新构建添加到 **NOBI External Beta**，按页面提示完成 TestFlight Beta 审核（如需要），获准后再供外部测试；内部可测试不代表已分配到外部组。原公开邀请链接 `https://testflight.apple.com/join/JSrJ2eYE` 无需更换。TestFlight Beta 审核与 App Store 正式审核是不同操作。[Apple 外部测试说明](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)。

可填写的测试说明：`新增中国象棋人机与联机、棋盘棋子美化；最新落点持续闪烁至下一步确认，优化单次落子与吃子音效；新增三首中国古琴实录并统一音乐设置。请重点验证横竖屏、联机走棋、音效、背景音乐及闪烁切换。`

App Store Connect 网页用于管理已上传构建，不能直接上传工程 ZIP 或 IPA。没有 Mac 时使用上述人工启动的 Codemagic 云端流程，无需重新创建证书或向聊天发送密钥。[Codemagic 上传配置](https://docs.codemagic.io/yaml-publishing/app-store-connect/)、[Apple 上传构建说明](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)。

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

## 本次本地验证

- 安卓升级测试包：`Nobi-android-1.0.8-20261017.apk`，43,011,051 字节，SHA-256 `2d1600cf8412cfc5aa4882cfe640ec6f31b516cb0488fcafa38ce014f0c9aa20`。实际 APK 版本为 `1.0.8` / code `9`；签名与此前 `1.0.7` 相同。APK 资源与源码逐字节核对通过，使用生产 HTTPS 地址。
- iOS 原生资源与工程静态检查通过：Bundle ID、1024px 不透明图标、隐私声明、横竖屏配置及最新资源一致性均正确。现有签名配置保持不变。
- iOS 发布版本与 Shell 编号流程专项 22 项测试通过，包含首次上传、后续递增、权限/网络失败、版本写入与错误阻断。
- 签名 IPA、云构建、Apple 上传及测试组分发等待人工执行；不把工程 ZIP 或本地静态检查作为上传成功的证明。
