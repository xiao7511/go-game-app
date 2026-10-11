# Android 真机测试批次：2026-10-11

源码基线包含 `fec87bd` 的古典音乐与真实爆炸录音。以下是当前实际执行结果，不将浏览器模拟视为原生真机通过。

| 阶段 | 结果 |
| --- | --- |
| 手机识别与调试授权 | ZTE 7551N，Android 13 / API 33，720×1612、320 dpi，ADB 状态 device |
| 本机工具链 | Java 17、SDK / Build Tools 34、Gradle 8.0.2、Capacitor 5.7.8 可用 |
| 在线账号测试资源 | 使用现有站点公开 anon 配置，构建并复制 Android/iOS；没有打包用户登录会话或服务端私钥 |
| Debug APK | 本机离线 Gradle 构建成功；未使用仓库中的发行签名容器 |
| APK 校验 | 56 张牌图、3 首古典曲目、8 个声音文件及围棋保护区域通过源码一致性检查 |
| 安装 | ADB 安装最初被手机拒绝；提供 APK 后用户手动安装成功，应用已运行。未绕过手机验证或清除数据 |
| 原生运行 / 登录状态 | 原生 https://localhost/game.html，Capacitor native=true，线上登录用户状态已确认（仅记录布尔值，没有读取密码或 token） |
| 真机冒烟 | 11 项检查通过：首次 7 项 + 继续执行的 4 项，结果和截图位于 `.nobi-isolated/mobile-device/` |

测试 APK：`dist/mobile-device/Nobi-android-debug-20261011.apk`，23,614,693 字节。

SHA-256：`9c8c1dfc901e8083d055e01545e1c359f32c74b02a4ce13b73a08971ce01da01`。

手机 `/sdcard/Download/Nobi-mobile-test.apk` 已放入同一份文件。也可从电脑传输交付 APK，在文件管理器中打开，按系统提示完成来源许可与安装。手机系统验证由用户在手机完成，不绕过它，不卸载其他版本或清除应用数据。

## 重建与检查

在仓库根执行；SDK 路径按本机配置调整，环境变量仅在当前终端生效。

```powershell
$env:ANDROID_HOME='C:/Users/yexiao/AppData/Local/Android/Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
npm run android:check
npm run mobile:prepare:test
npm run android:debug -- --phase=mobile-device --offline
npm run verify:apk-assets -- --phase=mobile-device
npm run ios:check
```

`--offline` 需要已有完整 Gradle 和 Maven 缓存；新电脑先在正常网络补齐依赖。沙盒下的真实路径 / SDK 读取限制需要正常主机执行权限。测试结果位于 `.nobi-isolated/mobile-device/`。普通 `npm run build:mobile` 不自动获取线上配置；测试准备命令是显式接入。127.0.0.1:5178 服务与其线上登录配置保持不变。

原生 WebView 检查使用 `scripts/android-webview-smoke.mjs`。先从 `adb devices` 选择已授权手机，用 `adb -s <设备ID> shell pidof cn.obsmd.gogame` 获取应用 PID，再执行 `adb -s <设备ID> forward tcp:9223 localabstract:webview_devtools_remote_<PID>`，然后 `node scripts/android-webview-smoke.mjs <设备ID>`。测试使用系统实际触摸、WindowManager 旋转及原生 WebView CDP，结束恢复音频偏好和系统方向；之后移除本测试的 `tcp:9223` 转发。Debug WebView 不支持 Playwright Browser context 管理，因此使用页面 CDP，而非桌面浏览器模拟。

真实设备牌面重叠，触摸坐标需包含系统状态栏并命中可见牌边。自动化尝试中的坐标、方向与短动画采样错误已区分，不作为产品回归。炸弹用例用正确的物理牌 ID 经现有 DOM 点击处理器提交合法四张同点牌，观察动画显示事件与原生 Audio 播放；没有创建线上房间或发送竞技命令。当前没有做真实四人联机验收。测试结束清理临时截图树文件时，首次继续执行无临时文件导致 `rm` 返回非零；已改为只针对该已知文件的幂等清理，11 项功能结果通过。

## 安装后验收记录

| 项目 | 操作与期望 | 当前结果 |
| --- | --- | --- |
| 启动与登录 | 原生启动、已登录线上账号状态；进一步关闭重开验证会话恢复 | 启动和登录状态 PASS；重开恢复待测 |
| 大厅与头像 | 手机无 CS 入口；登录头像正确；首页、排行、我的和设置可返回 | NOT RUN |
| 掼蛋布局 | 真机 360×769 竖屏提示，769×327 横屏 27 张牌，倒计时位于出牌按钮上方并居中 | PASS，已截图 |
| 手牌操作 | 系统实际触摸点选、清空、提示和合法出牌 | PASS；连续拖选、理牌专项待测 |
| 回合提示 | 倒计时在出牌上方；最后十秒每秒声音及去重需单独观察 | 位置 PASS；十秒声音真机专项待测 |
| 炸弹 | 合法四张同点牌夹具经现有 DOM 处理器出牌；动画触发且真实录音播放一次，手牌 27→23 | PASS；未作为真实联机认证 |
| 古典音乐 | 三首切换并处于原生播放状态；实际解码 MP3 和 1.8 秒 WAV；音乐静音与恢复 | PASS；扬声器听感、重开偏好待测 |
| 系统生命周期 | Android Home 暂停音乐，返回前台恢复，返回大厅停止 | PASS；锁屏、耳机、来电中断待测 |
| 硬件返回与恢复 | 系统返回键行为、强制关闭重开、低内存恢复不白屏、不误提交 | NOT RUN |
| 围棋 | 完整 19 路棋盘，触屏预览/确认/取消、单机悔棋、计分 | NOT RUN |
| 网络与稳定性 | Wi-Fi/移动网络切换、断网重连；四人联机另需四位测试者；至少 20 分钟无崩溃 | NOT RUN |

记录设备型号、Android 与 WebView 版本、APK 哈希、步骤、期望、实测、截图/错误。账号密码、验证码、token 不写入记录。真实扬声器音量和听感由测试者确认。

其余构建准备验证：142 项单元测试通过；iOS 静态检查及 Mac shell 脚本语法检查通过；Mac/Xcode 实际运行、Archive 与 TestFlight 上传均 NOT_RUN。
