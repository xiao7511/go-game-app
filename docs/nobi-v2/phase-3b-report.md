# Nobi 游戏 V2.0 — Phase 3B 正式验收报告

日期：2026-10-10（Asia/Shanghai）。分支：`feature/nobi-games-v2`。
起始 HEAD：`705be3989185d97afbea62549ba60c6d27eea743`，与用户指定 Phase 3A 基线一致。开始时已跟踪工作区干净，仅有既存未跟踪设计参考。实际阅读 Phase 3A 报告以及 Phase 0–2 的架构、规则、资源保护、构建与安全文档，复用原引擎、Compose、Auth、测试和 App 工程。

## 1. 验收结论

**本机隔离 Supabase 与真实浏览器联机验收 PASS；正式发布、生产联机及竞技结算未启用。**

- 四个独立 Edge 上下文使用四个真实本地 Auth 身份完成掼蛋同房、并发占座、服务端发牌、原始 PNG 选牌/出牌/不出、离线/刷新/服务重启恢复和经裁判确认的退出终局。第五个身份不能越过满员/进行中限制。
- 两个真实 Auth 身份在触屏浏览器中完成围棋预览/取消/确认、实际落子、提子、对方确认整轮悔棋、刷新和断线恢复、双虚着结束。另有确认认输、非法操作和结束后继续操作的拒绝验证。
- 既有 76 项单元测试全部保留，新增 7 项，共 **83/83 PASS**；原 **23/23 Edge PASS**；原 **19 组真实 Supabase 集成检查 PASS**；新增 **4/4 真实 Edge 联机测试 PASS**。离线框架单独报告，不计作真实 Supabase 验证。
- 原始 **56 张 PNG 哈希 / 7 个围棋源码渲染基线 PASS**。Web、mobile、Android/iOS 资源复制、实际 Android Debug APK 及包内资源校验 PASS。IPA、真机和互联网部署 NOT RUN。
- 既存签名私钥/签名容器暴露与根依赖漏洞仍 **FAIL**，发布 **NO-GO**。没有推送、main 合并、生产写入、正式发布、历史重写或签名变更。

## 2. 隔离环境及运行

复用 Phase 3A 已实际运行的 Compose 项目 `nobi-phase3a-local`，专用 DB 容器 `supabase_db_nobi-phase3a-local`、卷 `nobi-phase3a-local-db`。数据库健康，Auth/PostgREST/Realtime/Envoy 正常；原 5178 Nobi 开发服务及其他项目 8080/3306 容器未被停止或修改。

| 组件 | 地址 / 版本 |
| --- | --- |
| 本地 Supabase API | `127.0.0.1:55421`，Envoy 1.39.1 |
| PostgreSQL | `127.0.0.1:55422`，17.6.1.136 |
| Auth / REST / Realtime | GoTrue 2.196.0 / PostgREST 14.17 / Realtime 2.134.10；内部端口 |
| 权威服务 | `127.0.0.1:55430`，Node 24.19.0 + TypeScript 6.0.3 |
| 隔离浏览器页面 | `http://127.0.0.1:5189/online.html` |

Docker Server 29.7.2 可用；不重新尝试 Phase 3A 已阻断的 CLI 镜像下载，使用已经验证的 Compose 环境。Redis 不需要，未增加服务端依赖。

```powershell
npm run local:start
npm run local:migrate
npm run local:verify
npm run local:verify:private
npm run local:accounts
# 两个独立终端
npm run authority:local
npm run dev:isolated
```

本轮已实际生成四个手工测试账号，凭据只在 ignored 的 `.nobi-isolated/phase3b/manual-accounts.json`，不输出到文档/日志。以不同浏览器配置或独立隐私上下文登录，房主创建、其他账号输入完整房间 UUID 加入。自动测试另建五个随机 Auth 用户，结束时自动删除本轮收据、房间成员、非竞技记录、房间/私有快照和用户，保留手工账号。

停止、限定清理、卷重建、端口及全套复现命令见 [本地指南](phase-3b-local-guide.md)。正常 Web/App 生成的 online-config=null，本地 Auth/裁判地址不会成为正式联网配置；缺配置显示明确提示。隔离模式只允许 dev，不提供可发布的隔离 build。

## 3. 联机架构与协议

真实 GoTrue 验证 Bearer Token 后取得 UID；客户端 actionPayload 的 userId、seat、winner 或积分不能授权。昵称来自该身份的 Auth 元数据，仅展示。房间创建/加入使用现有 RPC；调用方不能选择座位。满员、进行中、重复加入分别由事务/RPC 与唯一约束处理。一个房间对应一局，下一局另建房间。

快照：`matchId, roomId, gameType, version, currentTurn, players, publicState, privateState, status, lastAction, updatedAt, deadline`。Go publicState 为棋盘/提子/历史/劫点/虚着次数；掼蛋 publicState 只有公开牌数、桌面出牌、完赛顺序及当前级牌。privateState 只含本人座位与本人手牌；保留 Phase 3A 本人字段兼容，不含对方手牌或完整牌堆。

命令：`matchId, actionId, expectedVersion, actionType, actionPayload`。服务端校验身份、成员、版本、回合、规则；保留原 requestId/type 测试兼容。每房间串行队列；同 `(roomId, Auth UID, actionId)` 的相同载荷返回原响应，换载荷复用 ID 拒绝。JSON 字段排序后做幂等指纹，防止 PostgreSQL JSONB 重排对象字段造成重启后的错误冲突。旧版/未来版本返回 409 与 latestVersion。

私有 `nobi_private.room_snapshots` 保存当前完整局面、原始发牌、接受操作日志、成员与截止时间。每次成功操作通过一个 SQL 事务完成房间锁、持久版本比较、快照、唯一收据、可信非竞技终局记录及公开 rooms 元数据更新。COMMIT 后才发送 SSE；持久化失败返回 503、阻断内存局面，下次从 DB 恢复，不传播未提交状态。超时也走此路径。

冷恢复按房间串行，从原发牌与日志重放规则，并比对物化快照；重建幂等响应、悔棋历史、结果及原截止时间。核对数据库 owner/kind/座位关系。当前验收为 **单一本地权威进程**；跨进程所有权、压力测试及持久日志压缩 NOT VERIFIED。

完整 API 与信任边界见 [服务文档](../../server/README.md)。Docker SQL 桥仅为隔离开发工具，不能直接部署为互联网数据库访问方案。

## 4. 掼蛋四人验收

| 项目 | 实际结果 |
| --- | --- |
| 不同 Auth 身份、创建/加入、并发唯一座位 | PASS，四个真实浏览器，第五人等待/进行中均拒绝 |
| 服务端洗牌发牌 | PASS，复用原引擎，服务端 crypto 随机源，108 张唯一卡牌，每人 27 张 |
| 本人手牌与公开视图 | PASS，各上下文只能读取本人 27 张；原始 PNG DOM；公开状态无 hands |
| 出牌/不出/轮转/一致性 | PASS，实际鼠标选择与按钮操作，四端公开局面一致 |
| 他人手牌、错回合、重复/乱序与旧版本 | PASS，原规则校验与 409 拒绝；原 19 组还验证重复牌和伪造结果 |
| 离线、刷新、房主掉线、服务重启 | PASS，原座位/手牌/版本恢复，不重新洗牌；重启后相同 actionId 响应一致 |
| 可信终局 | PASS，浏览器验证退出终局；真实 Supabase HTTP 集成跑至原规则自然终局，本次 147 次操作 |

浏览器四人测试验证对局操作与退出终局，**没有将四个浏览器自动打完全部手牌**；完整自然终局由独立真实 Supabase 集成脚本验证。现有单机和移动横屏牌面/拖选测试继续 PASS。竞技系列、进贡及正式评级仍需后续规则定版。

## 5. 围棋双人验收

真实黑白方身份/成员、当前回合、占点/自杀等非法落子拒绝、落子同步、提子、棋盘刷新与断线恢复 PASS。落子调用原引擎，UI 接收裁判快照后使用原木纹/黑白棋子渲染，未修改受保护渲染基线。触屏首次点击只预览，取消不提交，确认才发服务端命令。

整轮悔棋要求对方接受，申请者不能代替对方确认；恢复棋盘、提子、回合、历史及劫点上下文。认输需本人二次确认，对方不能代确认。连续两次虚着终局，已结束棋局不能继续落子。

**双虚着仅确认结束，winner=null、scoring=not-adjudicated；正式数目/死子/贴目结算 NOT VERIFIED。** 认输及原规则终局由裁判确认，不据浏览器广播结算积分。

## 6. 断线、计时与异常

SSE 是经鉴权的本人快照通道；Supabase Realtime WebSocket 仅通知公开 rooms 版本，测试断言实际 postgres_changes 事件。Realtime Token 显式绑定 Auth，版本通知合并 150ms，避免与 SSE 同时到达造成重复快照请求。私有 Schema 不加入发布。

客户端断开即禁用操作；指数退避 250ms 起、上限 8s，最多 8 次，达到上限显示手动重连。在线/前台恢复、刷新与服务重启重新取可信快照；旧版本不覆盖新版本。待确认命令保存原 actionId，网络/5xx 后重试，明确 4xx 拒绝则取消并同步。浏览器缓存只保留 Auth、UID 范围的房间号与未确认命令，不以缓存棋盘或手牌裁判。

断线恢复保留服务端 deadline，不重新延长回合；恢复后使用原截止时间，服务端检查超时。围棋面板“本地用时”仍是展示计时，不宣称是持久化正式比赛总钟；正式时钟/断线处罚需 Phase 3C 定版。

| 异常 | 策略与验证 |
| --- | --- |
| 同时争座、重复加入、房间满员 | RPC 行锁/唯一约束、原座位幂等、409；真实测试 PASS |
| 房主离线、玩家刷新 | 保留身份与座位，恢复快照；真实浏览器 PASS |
| 消息乱序/未来或旧版本 | 409/latestVersion，无局面推进；PASS |
| 消息重复/服务重启后重试 | 原响应、唯一收据；PASS |
| 服务器接受但确认响应丢失、300ms 延迟 | 浏览器保留命令重试；只有一次落子/一条收据；PASS |
| 两个同版本并发操作 | 一个 200、一个 409；PASS |
| 数据库约束失败 | 故意注入唯一约束冲突；503，公开/私有版本均回滚，再恢复同一命令；PASS |
| 连续服务不可用 | 达 8 次停止，手动恢复棋盘和原截止时间；PASS |
| 匿名/非成员/伪造 UID/私有读取/直接写结果 | Auth、成员、RLS/GRANT 拒绝；PASS |
| 进行中退出 | 明确“退出并结束对局”，裁判确认非竞技终局；PASS |
| 结束后继续操作 | 409，不改变终局；PASS |

## 7. 权限、安全及可信结果

本地 public/game 契约验证、RLS、RPC 授权、成员读取、普通客户端状态/收据/结果/积分写入拒绝 PASS。新增独立 [私有权限 SQL](../../infrastructure/local-supabase/sql/verify-private.sql) 验证 anon/authenticated 无私有 Schema USAGE/SELECT、私有表 RLS、无私有 Realtime 发布、权威角色指定更新权限。CORS 只接受列出的本机来源及 Capacitor `capacitor://localhost`、`http://localhost`、`https://localhost`；允许/拒绝来源在离线 HTTP 测试实际检查，不能等同真机验收。

可信接口 `trustedResult` 包含 `matchId, gameType, participants, result, finishedAt, resultVersion, settlementStatus=disabled`。DB 记录 ranked=false，真实测试评分仍 1500、场次仍 0；客户端不能直接写入胜负/积分。不启用正式排行榜结算。

保留 [既有风险清单](security-findings.md)，仅追加本阶段事实：

- **FAIL / CRITICAL**：已有被跟踪 RSA 私钥暴露。未输出内容、修改文件、撤销证书或重写历史。
- **FAIL / HIGH**：已有被跟踪 PKCS12/PFX 签名容器，密码/私有条目/有效期 NOT VERIFIED；未索取或尝试密码。
- **FAIL**：根依赖审计 3 high / 1 critical；tooling 审计 0 漏洞 PASS。没有 audit fix --force 或未经兼容验证的升级。
- 新提交材料守卫 PASS；运行时 Secret、手工密码、Auth Token 保持 ignored。公开客户端无 service_role；测试不使用生产凭据或个人数据。
- **发布/含敏感历史分支推送 BLOCKED**。所有者先核实暴露范围、证书及已发布应用关联，批准换钥/证书及 Android 应用签名迁移，再授权处理历史和 CI Secret。本阶段不执行这些不可逆操作。
- 生产数据库实际 RLS/Schema/Realtime、互联网授权/即时撤销、跨进程和压测 NOT VERIFIED。

## 8. 测试和构建记录

| 命令 / 验收 | 分类 | 最终结果 |
| --- | --- | --- |
| npm test | 单元/规则 | PASS，16 文件、83/83，原 76 全保留 |
| npm run check:authority | TypeScript | PASS |
| npm run test:integration:offline | 注入模拟身份的 HTTP 框架 | PASS，1 test、10 检查组；不等同真实 Auth/Supabase |
| npm run local:verify / local:verify:private | 真实隔离 SQL | PASS，原契约和新增私有权限 |
| npm run test:integration | 真实 Auth/REST/RLS/RPC/Realtime/SQL/裁判 | PASS，原 19/19 检查组 |
| npm run test:online:browser | 真实 Edge + 隔离 Supabase | PASS，新增 4/4，最终完整运行 1.8 分钟 |
| npm run test:browser（msedge） | 既有浏览器回归 | PASS，23/23，2.1 分钟 |
| npm run verify:assets | 原始资源 | PASS，56 PNG、7 围棋源码基线 |
| npm run build | Web 实际产物与白名单 | PASS |
| npm run build:app / verify:mobile-assets | mobile、Capacitor Android/iOS 资源 | PASS；两平台各 56 PNG、5 原音效、无可用 CS1.6 |
| npm run android:debug | Android 实际编译 | PASS，BUILD SUCCESSFUL，82 tasks，1m39s |
| npm run verify:apk-assets | 实际 APK | PASS，56 PNG 哈希、7 源码/3 App 围棋渲染、5 音效及资源白名单 |
| npm run check:security | 已有签名材料 | FAIL，保留风险并阻断发布 |
| npm audit / tooling audit | 依赖 | 根 FAIL（3 high/1 critical），tooling PASS（0） |
| npm run test:isolated（旧 Phase 2 广播探测） | 旧 opt-in 脚本 | BLOCKED，未提供旧 marker/账号环境参数，守卫退出且未发送请求；保留脚本，不改成允许不可信直接写局面 |
| IPA/Xcode、Android/iOS 真机、App 联机 | 真实设备 | NOT RUN |
| 正式围棋数目、跨进程/压测、生产契约 | 后续门禁 | NOT VERIFIED |

最终重跑曾因测试仍匹配英文 rejected 而失败，实际界面返回正确中文提示；已更新相同检查的文本断言并完整重跑 4/4 PASS，没有删用例。故意注入的唯一约束 SQL ERROR 属于回滚验收，测试明确验证失败不落库及后续恢复成功。

Vite 仍提示原经典脚本/静态 CSS 不参与 bundle；复制与产物哈希校验实际 PASS。Gradle flatDir/SDK XML 版本提示保留，没有将警告隐藏或声称已解决工具链升级。

Android 使用项目内 JDK 17.0.20.1、SDK Platform/Build Tools 34、AGP 8.1.4、Gradle 8.0.2、Capacitor 5.7.8；全局 JDK 21 不改动。APK 为普通 Debug，没有使用既存 release 签名材料：

- 路径：`android/app/build/outputs/apk/debug/app-debug.apk`
- 大小：6,073,663 bytes。
- SHA256：`64a08569aa86a6b564dc463fd1b8b6386ad917b907f19d646c6bf9c135644499`。
- IPA NOT RUN；手机设备不能使用 PC loopback，需要下一阶段独立 HTTPS 地址与受控 App 联机配置。

## 9. 资源与截图

没有修改、重绘或替换 `images/cards/` 中任何 PNG；不使用 Canvas/Emoji 替代牌面。木纹棋盘和原黑白棋子渲染保持七项源码基线。原 AudioManager、单机、大厅、排行榜与移动导航回归 PASS，Web/App 共用原业务引擎和新增联机适配。

实际 [四人掼蛋截图](screenshots/phase-3b/guandan-online.png)、[手机尺寸围棋截图](screenshots/phase-3b/go-online-mobile.png) 由真实 Edge 对局生成并视觉检查。后者为 390×844/DPR3 触屏模拟，不能当作真机。Phase 2 截图未覆盖，旧 23 项回归截图保存在 ignored 的 phase-3b-regression 目录。

既存未跟踪 `docs/nobi-v2/design/nobi-mobile-v21-reference.png` 保留原状，SHA256 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b`。未发现已确认 PC 参考图，不新增视觉像素一致性结论。

## 10. 修改文件

| 范围 | 文件 |
| --- | --- |
| 权威服务 | server/authority.ts、http.ts、legacy-rules.ts、protocol.ts、persistence.ts、README.md |
| 私有数据库 | infrastructure/local-supabase/supabase/migrations/20261010000500_private_snapshots.sql；sql/verify-private.sql |
| 浏览器与游戏适配 | online.html、ui/online.js、ui/online.css；game.html、game.js、guandan-game.js、multiplayer-ext.js、ui/lobby.js、ui/match.js |
| 构建与本地工具 | package.json、scripts/frontend.mjs、verify-build.mjs、local-accounts.mjs、private-contract.mjs、security-audit.mjs；.gitignore |
| 测试 | tests/unit/authority-protocol.test.mjs、tests/integration/offline.test.mjs、tests/online/real-browser.spec.mjs、phase3b.playwright.config.mjs |
| 交付 | 本报告、phase-3b-test-results.json、phase-3b-local-guide.md、security-findings.md 追加段；screenshots/phase-3b/README.md 与两张 PNG |

没有新增服务器依赖、修改 lock 或签名/证书、生产配置、原扑克文件/资源基线、Phase 3A 报告及未跟踪设计。

## 11. 本地 Git 提交

| 阶段 | 实际 SHA |
| --- | --- |
| 联机协议与原子持久状态 | 8ea67e00dace9feb8b5069f29638c21dca6c480e |
| 真实浏览器掼蛋与私有手牌 | 705a2a424428146cb4a937e280fade5f5bb8e141 |
| 围棋同步、触屏与恢复适配 | 2dfb03b8b7b99f631bea5598f04adf9ae538cdfb |
| 安全/集成测试、指南与真实截图 | 3649e2b160d3c36c39f9903b191109413fa5a421 |

本报告自身的提交 SHA 以 `git log -1 --format=%H -- docs/nobi-v2/phase-3b-report.md` 查询，并在最终交付消息给出，避免将提交自己的 hash 嵌入同一个提交。全部仅提交本地 feature 分支；main 仍为 `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。工作区最后只保留原未跟踪设计，不执行 push。

## 12. Phase 3C 启动条件

1. 在独立环境复现 83 单元、23 回归、19 Supabase 与 4 浏览器验收，复核私有权限及原资源保护；正式服务使用受控最小权限 DB 连接替换 Docker 桥。
2. 竞技规则先定版：围棋数目/死子/贴目、掼蛋系列/进贡、时钟和断线处罚；本阶段双虚着未判胜，不能直接进入评级。
3. 可信终局接口驱动服务端唯一结算事务；定义赛季、评分算法、幂等结算与积分历史。客户端继续禁止写积分。
4. 验证跨进程所有权、故障/并发/负载、Auth 撤销和过期、日志压缩/保留与网络限流；独立 HTTPS 联调，正式生产契约只在授权范围核验。
5. Android/iOS 真机生命周期、后台中断/旋转/恢复与独立服务地址联机验收；iOS 由受控 macOS/云构建补齐，未获签名授权不发布。
6. 签名所有者明确批准安全处置、兼容升级依赖并解除风险门禁之后，才讨论公开推送/正式 App 发布。当前保持生产、main、签名和历史保护。
