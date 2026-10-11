# 安卓沉浸式与电脑联机验证：2026-10-11

交付 APK：`dist/mobile-device/Nobi-android-immersive-online-final-20261011.apk`，23,909,439 字节。

SHA-256：`f87f80cc1c0f57b30865b342561c33644a9473562586686eb3cf47695b4e20e5`。

同一文件已通过 ADB push 放入 ZTE 手机 `/sdcard/Download/`，用户手动更新并启动，未卸载或清除数据。此前两份中间 APK 不用于本次最终验收。

## 修复及证据

- Android MainActivity 使用系统沉浸式 API 隐藏状态栏和导航栏；前台恢复和旋转后重新应用，边缘滑动仍可临时唤起系统栏。相机切口保留安全区域，窗口背景改为深色。最终 APK 真机截图没有原灰色状态栏和白色导航区域，横屏 WebView 从 769×327 扩为 769×360，27 张手牌正常。依据 [Android 沉浸式文档](https://developer.android.com/develop/ui/views/layout/immersive)。
- 原联机 UI 只接受隔离服务，普通手机包的配置为 null。现在显式 USB 测试构建接入 `http://127.0.0.1:55440`，通过 ADB reverse 访问电脑。默认普通构建不自动启用该测试连接；cleartext 只允许 localhost/127.0.0.1。
- 手机是 Android 13，WebView Chrome/101.0.4951.61，缺少 `AbortSignal.timeout`。新增请求超时兼容实现，解决请求发出前被误判为连接失败；原生最终包已确认兼容函数存在且成功连接。
- 电脑服务使用线上 Auth 的 GET `/auth/v1/user` 验证每次请求的身份，不调用线上数据库写接口。房间、裁决、幂等收据和本人快照保存在电脑 SQLite 中，通过原规则引擎裁决、SSE 同步；不计入线上积分。重用身份昵称/头像，快照只发本人私有牌。
- 等待房间显示四个座位，隐藏空牌桌。横屏对局中的 iframe 铺满视口，房间操作收进抽屉。复制被系统拒绝时退回选择房间号并复制，无法复制时给出长按提示。

## 实际验收

| 范围 | 结果 |
| --- | --- |
| 单元回归 | 145 项 PASS，含显式 USB 配置与旧 WebView 超时兼容 |
| 既有离线 HTTP 裁决 | 2 项 PASS，掼蛋/围棋的 10 组场景；这是模拟身份，不是线上账号验证 |
| 新 USB 服务集成 | 2 项 PASS，四席位、合法/非法动作、私有手牌、SSE、幂等、冷恢复及下一副重复提交 |
| 浏览器真实隔离 Auth | 四个独立账号，7 组 PASS：登录、建房/入座、108 张不同物理牌与各自 27 张、触屏控件出牌同步、全视口抽屉/复制、断网刷新、SQLite 冷恢复 |
| 最终 APK 真实线上账号 | 手机登录后成功连接并创建等待房间；seat=0，4 个等待列表项，空牌桌隐藏；复制成功；服务重启后同一 roomId 与原座位恢复 |
| 最终 APK 原生显示 | native=true，横屏 769×360，27 张手牌，截图通过；结束后恢复系统自由旋转并返回大厅 |
| 构建与资源 | Android 离线 Debug PASS；56 张牌图、3 首音乐、8 个音效及围棋保护区域一致；TypeScript 检查 PASS |

浏览器测试只在独立上下文给本机页面授予本地网络权限，不关闭浏览器的全局安全设置，按 [Playwright 权限 API](https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions) 操作。其 UI 请求由测试路由导向单独测试进程，账号来自既有一次性本机 Auth 夹具，生产账号没有用于自动四人测试。未做四部真手机或四个生产账号同时对战、公网部署、发布签名、长时间网络稳定性验收。

证据（忽略目录，不提交用户会话或账号密码）：`.nobi-isolated/mobile-device-refresh/browser-result.json`、`native-final-proof.json`、`solo.png`、`verify.png`、`four-auth-landscape.png`。最后移除了临时 CDP 的 tcp:9223；联机需要的 USB tcp:55440 仍保留。

## 在此电脑继续测试

```powershell
npm run authority:device
& 'C:/Users/yexiao/AppData/Local/Android/Sdk/platform-tools/adb.exe' -s 325054701379 reverse tcp:55440 tcp:55440
```

保持服务终端、电脑和 USB 连接。断开 USB 后手机不能访问此电脑的 loopback；重新连接后重跑 reverse。网页 127.0.0.1:5178 也已更新为同一联机测试入口，现有线上登录配置保留。用不同账号加入同一个完整房间号；同一个账号重进会恢复原座位，不会占第二个席位。掼蛋须满四个不同账号后房主才能开始，围棋须两人。本轮不提供公网联机地址。

重建：`npm run mobile:prepare:test -- --platform=android --usb-test`，设置真实 Android SDK 后 `npm run android:debug -- --phase=mobile-device --offline`，然后 `npm run verify:apk-assets -- --phase=mobile-device`。四账号浏览器复核：`node scripts/device-online-browser-check.mjs`，需要既有隔离 Auth 栈和 `.nobi-isolated/phase3b/manual-accounts.json`。
