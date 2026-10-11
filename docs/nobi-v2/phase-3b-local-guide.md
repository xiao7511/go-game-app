# Phase 3B 本地联机启动与复现

只使用已有 `nobi-phase3a-local` Compose 项目；生产环境不参与测试。API 55421、DB 55422、裁判 55430、隔离浏览器 5189 均为 loopback。原 5178 开发服务和其他项目容器不受影响。

```powershell
npm run local:start
npm run local:migrate
npm run local:verify
npm run local:verify:private
npm run local:accounts
# 终端一
npm run authority:local
# 终端二
npm run dev:isolated
```

打开 `http://127.0.0.1:5189/online.html`，或隔离大厅的联机按钮。本机查看 ignored 的 `.nobi-isolated/phase3b/manual-accounts.json` 获取四个专用测试账号；不要上传这个文件、复制凭据进文档或录制登录过程。分别使用四个独立浏览器配置/隐私上下文登录。掼蛋由一个账号创建房间，其余三个输入完整房间号加入；房主看到四人后开始。围棋使用任意两个账号。账号、房间及牌面均来自真实本地 Auth/裁判，不是大厅演示数据。

正常 Web/App build 的 online-config=null，不会嵌入本地凭据或激活旧广播裁判。联网未配置页面明确提示。隔离模式只允许 dev，不提供可发布的隔离 build。App 中包含同一传输和适配代码；本机 loopback 不能当作手机设备可访问的服务地址，真机联机仍 NOT RUN。

## 自动验收

```powershell
npm test
npm run check:authority
npm run test:integration:offline
npm run test:integration
npm run test:online:browser
npm run verify:assets
npm run build
npm run build:app
npm run verify:mobile-assets
npm run android:debug
npm run verify:apk-assets
$env:NOBI_BROWSER_CHANNEL='msedge'
$env:NOBI_REUSE_DEV_SERVER='1' # 仅当前 5178 Nobi 服务器哈希核验通过时
$env:NOBI_SCREENSHOT_DIR='docs/nobi-v2/screenshots/phase-3b-regression'
$env:NOBI_MATCH_SCREENSHOT_DIR=$env:NOBI_SCREENSHOT_DIR
$env:NOBI_GUANDAN_SCREENSHOT_DIR=$env:NOBI_SCREENSHOT_DIR
npm run test:browser
```

新浏览器测试自行启动/停止 5189 和 55430，要求这两个端口空闲；手工演示时先 Ctrl+C 两个终端。随机创建五个独立 Auth 身份，使用四人/双人真实 Edge 上下文及真实鼠标/触屏事件。禁止外部 HTTP 请求，不录制含 Auth 的 trace，最终删除本轮账号、收据、房间、快照及非竞技记录。异常测试有意制造唯一约束冲突：预期 SQL ERROR 后断言 503、事务回滚及同一命令恢复成功，不能把这条注入错误当成测试失败。

Phase 3A 的 19 组脚本仍单独保留，其结果不能替代四组浏览器验收。离线框架/单元结果不等同真实 Supabase PASS。真实手机、IPA、互联网部署不在本轮 PASS 范围。

## 停止、清理与重建

Ctrl+C 停止自己启动的 UI/裁判；`npm run local:stop` 仅停止本项目并保留卷。清理手工账号必须先停止裁判，只清理记录文件中的四个身份和自有房间；如它们参与其他所有者房间，脚本拒绝删除，需先单独处置对应测试房间。

```powershell
$env:NOBI_ISOLATED_ACK='LOCAL_DISPOSABLE_ONLY'
npm run local:accounts -- --cleanup
# 整个独立测试卷需要重建时
npm run local:reset
npm run local:start
npm run local:migrate
```

重建卷会删除测试用户；如之前没有先清理手工账号文件，确认卷已经重建且用户失效后，只删除 `.nobi-isolated/phase3b/manual-accounts.json`，再运行 local:accounts。不删其他文件，不改原签名材料/Git 历史。原 Phase 3A 脚本保留的测试数据可通过此专用卷重建清理。

安全发布仍遵循 [现有风险清单](security-findings.md)：暴露签名材料与根依赖漏洞未处置前，不推送带敏感历史的分支、不发布正式 App。
