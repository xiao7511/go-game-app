# iOS / TestFlight 准备：2026-10-11

当前用户没有 Mac 与 Apple Developer Program 账号。本轮仅完成工程、资源、静态检查和操作材料；没有 IPA、Xcode Archive、签名或 TestFlight 上传。

## 已准备的工程

- App 名称 Nobi 游戏，Bundle ID `cn.obsmd.gogame`，最低 iOS 13；iPhone 横竖屏、iPad 四方向已声明。应用图标为 1024×1024、不透明 RGB PNG。
- Capacitor 5.7.8，`webDir=dist/mobile`，原生包加载本地资源。复制后的牌面、界面、三首古典音乐与真实爆炸音效已逐字节检查；测试配置仅包含已部署站点的公开 anon 配置。
- `ios/App/App/PrivacyInfo.xcprivacy` 声明 UserDefaults 原因 CA92.1，并已加入 Copy Bundle Resources；依赖的 Capacitor/CapacitorCordova 自带隐私清单。它是 API 使用说明，不代表完整的数据收集问卷已经确认。
- `npm run ios:check` 在 Windows 可执行静态检查，明确输出 Archive / TestFlight 为 NOT_RUN。Mac 上再用 Xcode 验证 plist、签名、SDK 隐私聚合与实际编译兼容性。
- `scripts/ios-prepare-mac.sh` 提供无签名 Simulator 构建及本地 Archive 两种模式，不自动上传或邀请测试者。

根据 [Apple 当前 SDK 要求](https://developer.apple.com/news/upcoming-requirements/)，2026-04-28 起上传需 Xcode 26+ / iOS 26 SDK；2026-09-09 起最低部署版本需 iOS 13+。部署版本与构建 SDK 是两个设置。Capacitor 5 与该 Xcode 组合尚未在 Mac 实测，如有兼容错误需修复后继续，不把静态检查当作兼容认证。

## Mac 上的执行步骤

1. 准备能运行 Xcode 26+ 的 Mac，安装 Xcode、Command Line Tools、Node 24 和 CocoaPods；完成 Xcode 首次启动组件与许可。购买/加入 Apple Developer Program，并取得相应 App Store Connect 权限。
2. 解压提供的干净源码准备包。包内没有 `.git` 历史、私钥、签名容器、用户会话或电脑依赖缓存；不要传输旧仓库根目录的 `.key` / `.jks` 等材料。
3. 在源码根执行 `bash scripts/ios-prepare-mac.sh --simulator`。它安装锁定依赖、获取公开测试配置、复制资源、sync / Pods、静态检查，然后执行无签名 Simulator build。实际 Simulator 启动与 iPhone 运行仍需完成。
4. 用 `ios/App/App.xcworkspace` 打开工程，选择 App target。登录开发者账号，设置所属 Team，确认该团队已注册并拥有 `cn.obsmd.gogame`，启用 Automatic Signing；使用新建且保管在系统 Keychain 的有效发行签名，不复用历史私钥。
5. 在 App Store Connect 建立匹配 Bundle ID 的 App 记录。确认实际上一版 build number；每次提交使用新的构建号，版本目前为 1.0。设置当前终端的 Team 与构建号后执行：

```bash
export IOS_DEVELOPMENT_TEAM='你的10位TeamID'
export IOS_BUILD_NUMBER='新的正整数构建号'
bash scripts/ios-prepare-mac.sh --archive
```

上述占位值需替换，脚本拒绝占位值。若缺签名 profile，先在 Xcode 完成配置再重试；脚本不自动授权门户修改。

6. Xcode Organizer 打开生成的 `.xcarchive`，先 Validate App，确认图标、签名、隐私 API 声明、架构和 SDK 检查。只在验证成功后按 [Apple 上传步骤](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) 选择 App Store Connect 分发上传；上传需 Account Holder、Admin、App Manager 或 Developer 权限。
7. 构建处理完成后补齐测试信息，先建内部测试组验收，再准备外部测试。[Apple TestFlight 说明](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)：内部最多 100 位有 App 访问权的 App Store Connect 用户，外部最多 10,000 位；首个外测构建需 Beta App Review，通过后再邀请。构建可测试 90 天。

## 待填写的元数据

| 字段 | 准备内容 / 待确认 |
| --- | --- |
| Beta 描述 | Nobi 游戏提供掼蛋和围棋。本测试版重点验证手机横屏牌桌、登录头像、回合提醒、炸弹动画音效和古典音乐选择 |
| What to Test | 登录及重开恢复；横竖屏与安全区；27 张牌拖选/出牌；最后十秒声音；炸弹；三首音乐与后台静音；围棋触屏操作 |
| 反馈邮箱、联系人、联系电话 | 由所有者填写真实有效信息，不自动编造 |
| 审核账号 | 如审核涉及登录，提供专门有效测试账号；密码在 App Store Connect 安全填写，不写源码或聊天记录 |
| 隐私政策 URL 与 App Privacy | 待所有者确认：账号邮箱、用户 ID、昵称/头像、实际战绩等如何收集、关联、保留、删除及是否共享。当前静态声明不代替此问卷 |
| 出口合规 | 核对当前 HTTPS/依赖加密用途后按 Apple 问卷回答；本轮未自动设置非豁免加密声明 |
| 年龄分级与游戏信息 | 按实际无真钱赌博、无付费投注等产品功能回答；不得直接沿用未经核实的旧分级 |
| 测试设备 | 至少一台刘海/灵动岛 iPhone、一台小屏 iPhone；iPad 也需验证（target family 1,2） |

iPhone 验收使用 [真机测试矩阵](mobile-device-testing.md) 中的对应项目，并额外验证 WKWebView 音频首次交互、静音键/耳机/来电、后台恢复、旋转与安全区、TestFlight 安装升级。模拟器不替代扬声器听感和原生真机结果。
