# Nobi 游戏 V2.0 — Phase 3A 正式验收报告

日期：2026-10-10（Asia/Shanghai）。分支：`feature/nobi-games-v2`。
起始 HEAD：`267658d006a6342bed2dad1df475e7f772d2dc52`，与用户提供的 Phase 2 基线一致。开始时无已跟踪修改，只有既存未跟踪的移动设计参考图。本轮仅本地提交，没有推送、合并 main、部署或生产数据库写入。

## 1. 验收结论

**本地隔离环境、数据库契约、最小权威服务与回归验收 PASS；正式发布仍 NO-GO。**

- 真实 Docker Compose Supabase 已启动，并从空测试卷完成重建、迁移和真实联网验收。
- 真实 Supabase 综合脚本通过 **19 个检查组**，包含四个独立 Auth 用户、实际 PostgREST/RLS/RPC、Realtime WebSocket、权威 HTTP/SSE 掼蛋与围棋对局以及 SQL 终局记录。它不是 Mock 测试。
- 原有 66 项单元测试全部保留，新增 10 项，共 **76/76 PASS**；原有 **23/23 Edge PASS**。
- 源码 **56 张扑克 PNG / 7 段围棋保护基线 PASS**。实际 APK 内 56 张 PNG 哈希、App 使用的三段围棋渲染、音效和发布白名单 PASS。
- Web、mobile、Capacitor Android/iOS 资源构建复制 PASS；**实际 Android Debug APK 构建 PASS**。IPA 和真机测试 NOT RUN。
- 已有签名暴露检查仍 FAIL；根依赖仍 3 high / 1 critical。没有处置授权，不重写历史、不撤销证书、不上传材料。旧浏览器联机路径尚未切换到权威服务，生产联机 E2E NOT VERIFIED，正式竞技积分未启用。

## 2. 测试环境与命令

固定 Compose 项目 `nobi-phase3a-local`；数据库容器 `supabase_db_nobi-phase3a-local`；专用卷 `nobi-phase3a-local-db`。所有公开端口只绑定 `127.0.0.1`。

| 组件 | 固定版本 / 端口 |
|---|---|
| PostgreSQL | `supabase/postgres:17.6.1.136` / 55422 |
| Auth | `supabase/gotrue:v2.196.0` / 容器内部 9999 |
| PostgREST | `postgrest/postgrest:v14.17` / 容器内部 3000 |
| Realtime | `supabase/realtime:v2.134.10` / 容器内部 4000 |
| Envoy | `envoyproxy/envoy:v1.39.1` / 本机 API 55421 |
| Node + TypeScript 权威服务 | Node 24.19.0 / 本机 55430 |
| Supabase CLI | 项目局部固定 `2.120.0`；CLI 备用配置使用 55420–55429 独立端口 |

Docker Server 29.7.2 可用。CLI 两次启动均在 240 秒镜像下载限时结束，**CLI 启动 BLOCKED**，没有无限重试。Compose 回退使用已经缓存的官方镜像并设置 `pull_policy: never`，真实运行 PASS。Studio、Storage、Edge Functions、邮件与 Redis 未启用，当前测试不需要它们。既有其他项目的 8080/3306 容器持续运行，未被停止、删除或修改。

```powershell
npm install --prefix infrastructure/local-supabase
npm run local:start
npm run local:migrate
npm run local:verify
npm run test:integration
npm run authority:local
# 仅停止当前测试项目，保留卷
npm run local:stop
# 显式重建当前一次性测试卷
$env:NOBI_ISOLATED_ACK='LOCAL_DISPOSABLE_ONLY'
npm run local:reset
npm run local:start
npm run local:migrate
npm run test:integration
```

本地 DB/JWT 凭据随机生成到 ignored 的 `.nobi-isolated/phase3a/runtime.json`，不打印、不提交。每次真实测试创建四个随机测试邮箱/密码；密码、Auth 会话和 Token 只保存在测试内存。没有复制生产账户、个人数据或 service_role 密钥。脚本拒绝远程 URL、已链接 CLI 项目及容器/卷归属不符的操作。SQL 迁移有校验记录和 LF/CRLF 规范化，已应用内容改变会被拒绝。

空卷验收实际发现并修复了 Realtime 租户初始化、PostgREST schema cache 及首次复制/用户订阅注册的时序问题。测试等待服务健康和专用标记 RPC，显式设置各用户 Realtime Auth，然后核验复制槽活跃和对应用户的实际订阅记录，再断言真实事件投递与重连。没有以就绪探测或合成事件代替联网 PASS。

详见 [环境指南](../../infrastructure/local-supabase/README.md)。

## 3. 数据库契约

原始 SQL 使用 `game.waiting_room/game_sessions/moves`，而围棋实际客户端使用 `game.game_rooms`；后者未定义在原始 SQL。Profile 由 `public.get_player_profile(player_id uuid)` 从 Auth 元数据读取显示资料。以上是源码使用关系；生产数据库实际目录、RLS 与授权没有远程核验，保持 **NOT VERIFIED**。

本地迁移保留历史对象名，补齐 Go room 列与原子加入 RPC；新增统一 `game.rooms/room_members`、状态版本/当前回合、服务端操作收据及经验证的非竞技对局记录。RLS 与角色授权拒绝客户端写入对局状态、落子、结果、评级及积分历史。并发加入由行锁与唯一座位约束保护。

核验修复：Supabase 镜像默认直接授予 anon 函数 EXECUTE，需要同时撤销 PUBLIC 和 anon；PostgreSQL 17 专用角色需要明确 SET membership。独立 SQL 脚本检查 11 个表的 RLS、关键写权限、RPC、四个实时发布表、排名视图及权威角色权限。

赛季、掼蛋/围棋分项评级、个人记录、并列排名查询与积分变化历史契约均已建模并验证。测试赛季默认禁用竞技，所有终局记录 `ranked=false`，测试后评分仍 1500、场次仍 0；没有启用任何正式积分结算。

详见 [数据库契约实测](phase-3a-database-contract.md)。

## 4. 掼蛋与围棋联机结果

| 实际联网检查 | 结果 |
|---|---|
| 四个独立 Auth 用户、创建/加入、身份与座位、重复加入 | PASS |
| 掼蛋服务端开局、108 张发牌、各客户端只收自己的 27 张手牌 | PASS |
| 四端 SSE 状态/回合同步，出牌、合法性、不出 | PASS |
| 越权出牌、盗用别人牌、重复牌 ID、首轮不出、伪造胜负拒绝 | PASS |
| 操作幂等、冲突 requestId、陈旧 version 拒绝 | PASS |
| 掼蛋断线/重连快照、玩家退出、完整规则终局 | PASS |
| 围棋双方黑白分配、落子/回合同步、提子、非法/自杀落点拒绝 | PASS |
| 围棋断线恢复、对方同意整轮悔棋、棋盘/提子/回合/记录恢复 | PASS |
| 认输请求与本人确认、服务端终局、结束后操作拒绝 | PASS |
| 实际 Realtime 数据库事件、参与者权限、重新订阅 | PASS |
| SQL 非竞技终局记录、唯一操作收据、积分不变 | PASS |

最新冷启动综合运行中，掼蛋通过 156 次合法操作自然终局，不接受客户端广播的 winner 作为结果。围棋终局采用确认认输；正式围棋数目、双 pass、贴目等竞技结算规则未在本轮新增或声称完成。现有棋盘渲染和触屏交互源码未修改。

另有 **1 项离线 HTTP 框架测试 / 10 个检查组 PASS**，身份由测试注入，明确不计入真实 Supabase 验收。新增单元测试覆盖并发序列、幂等冲突、私密手牌、非法落点、服务端超时与持久化失败阻断。

## 5. 服务端权威架构及边界

最小 Node + TypeScript 服务可独立启动，实际 health=200、未鉴权创建房间=401。服务器持有房间状态，通过独立 VM 复用原掼蛋/围棋规则代码。每房间顺序队列、expectedVersion、用户范围 requestId、Auth 校验、SSE 私有快照、断线恢复和 120 秒服务端回合超时已实现。退出、确认认输或规则终局产生可信候选记录，积分始终禁用；Redis 当前不必要。

**尚未实施、不能用于生产的部分：** 活跃局面/完整发牌与操作日志的持久恢复，跨进程房间所有权，正式比赛规则/时钟政策、公开网络限流与压测、原子竞技结算。终局记录和后续操作收据仍为两个 SQL 事务；进程重启后活跃房间不可恢复，失败时阻断而不猜胜负。数据库写入桥只适用于经标签核验的本地 Docker 操作员，生产必须换成最小权限数据库连接。

旧浏览器适配器没有接入新服务，尤其掼蛋旧接口仍要求全部手牌，必须在 Phase 3B 改成私有手牌协议后进行多浏览器 E2E。不能把本轮服务/SDK 集成 PASS 当成原浏览器联网或生产已验收。

详见 [服务架构与接口](../../server/README.md)。

## 6. 构建、资源、安全与测试分类

| 检查 | 最终状态 |
|---|---|
| `npm test` | PASS：76/76，66 项原用例未删除 |
| `npm run test:browser`（Edge） | PASS：23/23，原用例未删除 |
| `npm run test:integration` | PASS：真实 Supabase 19 个检查组，冷启动重建后通过 |
| `npm run test:integration:offline` | PASS：1 项 Node 测试 / 10 组；不等同真实 Supabase |
| `npm run local:verify` / 类型与新脚本语法检查 | PASS |
| `npm run verify:assets` | PASS：56 原 PNG / 7 围棋源码基线 |
| Web/mobile 构建、Capacitor Android/iOS 复制与校验 | PASS |
| `npm run android:debug` | PASS：实际 Debug APK，最新 BUILD SUCCESSFUL 24s |
| `npm run verify:apk-assets` | PASS：56 PNG、3 App 渲染基线、5 音效、白名单与无 PC adapter |
| 官方 CLI 镜像启动下载 | BLOCKED：两次 240 秒超时；已用真实 Compose 回退完成验收 |
| `npm run check:security` | FAIL：既存私钥/签名容器暴露未处置 |
| root `npm audit` | FAIL：3 high / 1 critical |
| tooling / 独立 Supabase CLI audit | PASS：各 0 漏洞 |
| Release APK/AAB、IPA、真机运行与设备音频中断 | NOT RUN；正式发布受安全风险阻断 |
| 生产契约、旧浏览器联网 E2E、进程重启恢复 | NOT VERIFIED / 未实现，不计为 PASS |

并行 Android 编译时曾出现单元 VM 100ms 超时，编译结束后完整 76 项通过，未放宽限时或删除用例。触屏测试原先比较启动时捕获的旧手牌坐标，现保留尺寸/遮挡断言，轮询动画后的完整手牌实时位置；最终两次完整 Edge 23 项通过。开发服务器身份校验现在只接受已知 Vite 注入和本地 SDK 替换，并继续逐个验证游戏脚本哈希。

实际截图在 ignored 的 `docs/nobi-v2/screenshots/phase-3a-regression/`，来自 Playwright 实际页面；既有 Phase 2 截图未覆盖。移动 V2.1 参考图仍未跟踪且保持原哈希 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b`。本阶段没有新增设计图一致性结论。

APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`，6,042,374 字节；SHA-256：`e99adb529370f6674103dc5e41d4f5fdbd263e69b46965788b905a2ad39eaa34`。只在本地生成，未提交 APK 或 debug 签名材料。

Android：已安装 SDK Platform 34 / Build Tools 34；JDK 17.0.20.1+1 只在 ignored 工具目录；Gradle 8.0.2 与 AGP 8.1.4 实际编译通过。全局 JDK 21 和 Android Studio JBR 25 未被更换。关闭 CSS 颜色压缩后，打包木纹声明恢复原保护基线，并加入 Web/App/APK 产物守卫。详见 [工具链实测](phase-3a-toolchain.md)。

安全风险清单全部保留，并追加 [轮换与发布阻断建议](security-findings.md)。没有输出私钥、猜测容器密码、重写历史、撤销证书或向公开仓库推送。Debug APK 成功不能解除签名暴露、依赖漏洞或设备验收风险。

## 7. Git 提交

| 功能批次 | 实际 Commit SHA |
|---|---|
| 隔离环境 | `c40e6ecbe075918c3e067545d8f08ec2548ec3b9` |
| 数据库契约与权限 | `1dbb0e450a6258d67fb079c7ae0c9f9631211df2` |
| 真实联机与权威服务 | `f740df2ce29b0b3a02aa3266116a6d41e59e5a7b` |
| 工具链、APK、资源与安全 | `bbf50ff9647ba446a7558d433d20b04605e2fb43` |

本报告与脱敏测试结果作为最后的报告提交；其 SHA 可用 `git log -1 --format=%H -- docs/nobi-v2/phase-3a-report.md` 读取，最终交付消息列出。报告记录上述已验收代码提交，避免把未生成的报告提交 SHA 写成虚假值。

main 保持 `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。没有 push、force push 或 merge。最后工作区应只有原先未跟踪的设计参考图，所有本阶段代码/文档均已提交。

## 8. 修改文件与 Phase 3B 启动条件

本报告末尾列出相对 Phase 2 的完整修改清单。扑克、围棋渲染源码、原始资源清单和历史 `www` 审计副本无差异。

Phase 3B 可继续本地开发，先将旧游戏适配器接入私有手牌/权威命令协议，并实现持久状态、完整动作日志、版本比较和原子终局事务；随后用四个/两个真实浏览器及 Android/iOS 设备验证重连、身份、触屏、生命周期和音频。正式评级启用前必须确认两款游戏的完整竞技终局与积分规则，完成负向越权及并发结算测试。正式发布前仍须由身份所有者授权处置签名暴露、受控升级根依赖并完成设备/发行验收。不得使用本地 PASS 代替生产或发布授权。

```text
.gitignore
android/build.gradle
docs/nobi-v2/phase-3a-database-contract.md
docs/nobi-v2/phase-3a-report.md
docs/nobi-v2/phase-3a-test-results.json
docs/nobi-v2/phase-3a-toolchain.md
docs/nobi-v2/security-findings.md
infrastructure/local-supabase/README.md
infrastructure/local-supabase/compose.yaml
infrastructure/local-supabase/envoy.yaml
infrastructure/local-supabase/package-lock.json
infrastructure/local-supabase/package.json
infrastructure/local-supabase/sql/realtime.sql
infrastructure/local-supabase/sql/roles.sql
infrastructure/local-supabase/sql/verify-contract.sql
infrastructure/local-supabase/supabase/.gitignore
infrastructure/local-supabase/supabase/config.toml
infrastructure/local-supabase/supabase/migrations/20261010000100_local_contract.sql
infrastructure/local-supabase/supabase/migrations/20261010000200_rpc_grants.sql
infrastructure/local-supabase/supabase/migrations/20261010000300_command_receipts.sql
infrastructure/local-supabase/supabase/migrations/20261010000400_authority_role.sql
package.json
scripts/android-debug-check.mjs
scripts/android-toolchain.mjs
scripts/frontend.mjs
scripts/local-compose.mjs
scripts/local-db.mjs
scripts/local-ready.mjs
scripts/local-supabase.mjs
scripts/prepare-jdk17.mjs
scripts/verify-apk-assets.mjs
scripts/verify-apk-assets.ps1
scripts/verify-build.mjs
scripts/verify-dev-server.mjs
server/README.md
server/authority.ts
server/http.ts
server/legacy-rules.ts
server/package.json
server/tsconfig.json
tests/browser/guandan-visual.spec.mjs
tests/browser/match.spec.mjs
tests/integration/offline.test.mjs
tests/integration/scenarios.mjs
tests/integration/supabase.test.mjs
tests/unit/authority.test.mjs
tests/unit/dev-server.test.mjs
```
