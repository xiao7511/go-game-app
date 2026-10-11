# Phase 2 隔离联机搭建与验证

2026-10-10。真实服务验收 **BLOCKED**：没有配置专用 Supabase URL、四个测试账号及隔离环境凭据。Docker server 29.7.2 可访问；Supabase CLI 不在 PATH，未发现 Nobi 专用运行容器。本轮不安装服务、不连接生产、不运行 SQL、不创建用户。`npm run test:isolated` 实际退出 2，配置守卫在任何网络请求前拒绝执行。

## 环境边界

使用新建的本机一次性实例，不从上海生产库复制用户、Token、私钥或业务数据。Supabase 本地栈依赖 CLI 与容器运行时；遵循[官方本地开发说明](https://supabase.com/docs/guides/local-development)，安装版本由环境管理员记录和批准。CLI 本地版与生产自建版不同；通过不证明上海实例兼容。

禁止 `supabase link`、`db push`、生产 `db reset`、对生产执行本项目历史 SQL。也禁止把生产隧道绑定到允许的本地端口。脚本只允许 `http://127.0.0.1:54321`（或 localhost/IPv6 loopback、54421），另要求专用环境标记 RPC 与人工隔离确认；这些是误操作防线，不是鉴别被恶意代理实例的密码学证明。

## 可复现搭建（本轮 NOT RUN）

1. 安装并记录经审核的 Supabase CLI；检查 `supabase --version`、`docker version`。仅本地新实例可继续。
2. 在项目根使用独立目录：

   ```powershell
   New-Item -ItemType Directory -Path .nobi-isolated
   Set-Location .nobi-isolated
   supabase init
   ```

   `.nobi-isolated/` 已忽略。不要在已有实例目录执行 init/reset 或覆盖其他配置。
3. 编辑新生成的 `supabase/config.toml`：project_id 使用独立值 `nobi-phase2-local`；`[api]` port 54321，schemas 包含 `public`、`graphql_public`、`game`；`[db]` port 54322，Studio 用独立端口。第二实例改用 54421/54422 并调整其他服务端口，先确认无冲突。Auth site_url / redirect allowlist 只含本地 5178 / 4173 / 4174；测试账号允许本地邮箱确认，不能改生产确认策略。
4. `supabase start` 启动新栈。确认服务只供本机访问、端口没有转发到生产。不要把 start/status 的密钥输出保存到提交、截图或报告。
5. 在**本地实例 Studio SQL 编辑器**手动执行 [isolated-supabase-fixture.sql](../../scripts/isolated-supabase-fixture.sql)。它不是幂等迁移，重复运行会失败，刻意不自动 drop 任何对象。如需重建，先明确确认目标是一开始新建的一次性实例。本轮没有执行该 SQL。
6. 该夹具补全旧客户端期望的 `game.game_rooms`、public profile RPC、Realtime publication 与标记 RPC。重载 API schema cache（SQL 已含通知），检查 exposed game schema 生效。其 join/read 策略刻意宽松，只测试旧契约，**不能用于生产、可信积分或权限验收**。
7. 在本地 Auth 创建四个不同的测试用户，确认可登录；手工保存账号到未跟踪的环境管理中。不要从生产导入账号。脚本不需要 admin/service-role key，不调用管理员接口。
8. 回到项目根，在当前进程内注入以下环境变量，不写入仓库：

   | 变量 | 契约 |
   | --- | --- |
   | NOBI_ISOLATED_ACK | `LOCAL_DISPOSABLE_ONLY`，仅确认一次性本地实例后设置 |
   | NOBI_TEST_SUPABASE_URL | `http://127.0.0.1:54321` |
   | NOBI_TEST_SUPABASE_ANON_KEY | 本地实例 anon JWT / publishable key，禁止 server secret |
   | NOBI_TEST_USERS_JSON | 四项 JSON 数组，每项 `email`、`password`，仅一次性用户 |

   ```powershell
   npm run test:isolated
   ```

   不把真实账号密码放在 shell 参数/历史或报告中；由管理员用安全输入注入进程环境。完成后删除这些进程环境变量。实例停止只针对本次新建 project_id，不使用可能波及其他容器的清理命令。

## 脚本实际覆盖与限制

`scripts/isolated-env.mjs` 在任何客户端创建前拒绝外部域名、非测试端口、URL 内凭据、server key、缺少四账号或确认。两项单元回归验证这些拒绝条件。本轮 SDK 脚本语法通过、缺配置 BLOCKED；实际下列网络步骤均 **NOT RUN**：

| 步骤 | 完整配置后运行的检查 |
| --- | --- |
| 标记 / Auth | 专用标记 RPC、四个不同真实登录会话 |
| 围棋 API 契约 | 创建房间、白方加入、profile RPC、19×19 快照 / 回合读取、ended 状态写入 |
| 掼蛋 Realtime | 四个 SDK 频道、四个原规则实例的合法出牌同步；不改规则 |
| 传输重连 | 退订再订阅、探针消息送达；**不是游戏状态自动恢复** |
| 清理 | 关闭本脚本频道及 Auth 会话；测试房间保留以检查，不自动删除数据 |

脚本不打印凭据、服务端原始错误或 SQL payload，拒绝 HTTP 跳转及跨实例请求。失败退出 1，缺配置退出 2。PASS 仅是 SDK / 契约 / 传输 smoke，不是完整前端多人 E2E，更不是安全或生产验收。

## 完整前端多人验收矩阵（全部 BLOCKED）

本地 `.env.local` 只能填新实例公开配置（不要覆盖用户既有配置，先安全备份）。分别运行 `npm run build`、`npm run build:app`；打开四个独立浏览器上下文，真实登录测试账号。离线回归默认没有测试凭据，不能算本表通过。

| 检查 | 掼蛋 | 围棋 | 判定证据 |
| --- | --- | --- | --- |
| 创建 / 邀请 / 加入 | 房主和另外三人入座 | 黑 / 白方入座 | SDK Auth UID 对齐、席位和房号一致；旁观者不可抢座 |
| 状态 / 回合 | 全员卡数、当前回合、PLAY/PASS | 棋盘、提子数、最近落点 | 合法动作一处提交、各端只执行一次，乱序/重复被拒绝 |
| 断线 | DevTools 离线，显示明确状态 | 同上 | 禁止静默继续产生分叉；不以频道 SUBSCRIBED 代表棋局已恢复 |
| 恢复 | 重连后私有手牌与序号恢复 | 最新快照和回合恢复 | 不重复发牌、不应用过期快照，恢复前操作锁定 |
| 退房 / 结束 | 退出释放连接、其余席位更新 | 退出清频道、结束状态一致 | 无遗留计时器/回调、更无积分重复写入 |
| 权限 / 并发 | 伪造 UID / 偷看别人的手牌 | 并发占座 / 旁观者写入 | 服务端拒绝，不仅靠前端字段判断 |

已知发布阻断：掼蛋全量手牌广播、客户端 UID 可伪造、丢包状态恢复缺失，围棋占座非原子、状态写入错误吞掉、真实 RPC/RLS 契约未知。现有频道退订/重订不能修复这些问题。下一阶段先设计可信服务端裁决、私有状态、序号恢复与权限负向测试，不能给现有广播加“重连成功”文案就验收。
