# TestFlight 首次构建号修复

应用：Nobi 游戏，Apple ID `6821625687`，Bundle ID `cn.obsmd.gogame`；版本保持 `1.0`。

旧脚本把成功查询但没有历史构建的空结果当成非法构建号。Codemagic 官方 CLI 在这种情况下输出 `Did not find latest build for app ...`，返回空值；API 认证、权限和网络失败不能据此回退。

## 编号策略

发布工作流改为 `ios-testflight-release`，保留显示名称“Nobi signed IPA and TestFlight”。这是一个新的 Codemagic 工作流计数序列，下一次首次构建的内置 `BUILD_NUMBER` 为 `1`；旧失败构建及模拟器工作流不会占用这条序列。首次上传后保持此 ID 稳定，不再重命名或重置。

构建号取 `max(BUILD_NUMBER, Apple 版本 1.0 的最高构建号 + 1, 工程当前构建号)`。当前工程 Debug/Release 均为 `1`，`VERSIONING_SYSTEM` 为 `apple-generic`，营销版本均为 `1.0`。失败的 CI 构建也消耗计数，因此后续号码可能跳号，仍保持递增；Apple 更高历史号或工程更高编号会提高下限。

只有 Apple CLI 成功退出、stdout 为空且 stderr 含明确的无历史构建提示时，才将历史视为 `0`。非零退出、未知空响应、非法输出均停止构建。查询固定 `--platform IOS --pre-release-version 1.0`，不排除已过期构建。没有 `|| true` 或将所有错误统一设为 `0` 的处理。

`nobi-apple` 连接、Apple Distribution 证书、`cn.obsmd.gogame` 的 App Store profile、`ios_signing` 和 publishing 配置保持不变；不新增凭据或修改游戏代码。保持原归档参数：workspace `ios/App/App.xcworkspace`，scheme `App`。

## 写入和验证

1. 保留 `xcode-project use-profiles`。
2. `agvtool new-version -all` 写入选定构建号；`agvtool new-marketing-version 1.0` 保持版本。
3. 核对 Debug/Release 的 `CURRENT_PROJECT_VERSION`、`MARKETING_VERSION`、游戏标识，以及 Info.plist 实际写入的 `CFBundleVersion` 和 `CFBundleShortVersionString`，记录期望值。
4. IPA 导出后读取实际 `Payload/*.app/Info.plist`，核对游戏标识、构建号和 `1.0`。Windows 回归测试验证脚本及元数据逻辑，真实 IPA 的二进制 plist 检查在云端 macOS 执行。

22 项发布回归覆盖首次/后续构建、Apple 尚未显示新历史时使用不同 CI 号、手动上传更高号、工程下限、认证/权限/网络错误、未知空响应、非法编号、agvtool 写入失败及元数据不匹配。按锁文件在隔离目录安装干净依赖后，完整 172 项单元测试通过。另用 YAML 解析器校验语法、重复键、签名不变及归档参数；Shell 和 Node 语法检查通过。本次未触发新的云构建，尚未声称 IPA 已上传。

## 下一次运行

Codemagic → Start new build → 分支 `codex/fix-ios-first-testflight-build` → `ios-testflight-release (Nobi signed IPA and TestFlight)`。不要点击旧失败任务的 Rebuild，它可能继续使用旧提交/旧工作流。合并修复后可改选 `main`，工作流 ID 保持不变。

官方参考：[工作流与项目计数器](https://docs.codemagic.io/knowledge-codemagic/build-versioning/)、[CLI 查询返回规则](https://github.com/codemagic-ci-cd/cli-tools/blob/master/src/codemagic/tools/app_store_connect/actions/latest_build_number_actions.py)。
