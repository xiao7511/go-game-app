# Nobi 游戏 V2.0 — Phase 3C 验收报告

日期：2026-10-10（Asia/Shanghai）。分支：feature/nobi-games-v2；开始 HEAD：c5de0991c386c0916d5f70d4fc3108f837e39a54。开始时已跟踪工作区干净，原未跟踪 design 参考文件保留。已读取 Phase 3B 报告/指南、Phase 0–3A 架构与资源审计、现有 game/public Schema、联机服务和 Phase 1 排行榜。

**交付结论：本地隔离环境的可信单局结算、评级、排行榜、战绩、赛季和管理接口已实现并实际验收；生产正式竞技仍 NO-GO。** 掼蛋多副牌/进贡、完整赛事规则及公网/真机验收尚未完成。未连接生产写入、推送、部署、合并 main、改变签名或重写历史。

## 1. 实现与架构

复用 Phase 3B 单进程 Node 24 + TypeScript 裁判、Supabase Auth、顺序操作队列、私有快照、收据与重放恢复。没有引入 Redis、另一游戏引擎或新依赖。运行命令见 [本地指南](phase-3c-local-guide.md)。

现有 Compose 项目 nobi-phase3a-local：Supabase API/Auth/Realtime 55421、PostgreSQL 55422，裁判 55430、隔离浏览器 5189，全部 loopback。数据库镜像 PostgreSQL 17.6.1.136，Auth 2.196.0，PostgREST 14.17，Realtime 2.134.10，Envoy 1.39.1；复用原卷，没有占用其他项目端口。URL、标记 RPC、容器归属及 ignored 独立凭据保护生产边界。

竞技创建显式 competitive=true，默认普通房间不计分，需有效启用测试赛季及注册 Auth 身份。身份由服务查询 GoTrue，客户端 userId/胜负/积分不能授权。只向玩家提供本人手牌；全量发牌和恢复日志只在 nobi_private。保留原 actionId、expectedVersion、房间版本、权限/回合/合法性校验、断线重连及浏览器刷新恢复。

终局事务同时提交：快照、唯一操作收据、可信结果、完整参与者、公开版本、所有玩家永久与赛季评级、变化历史、结算审计。只有 COMMIT 后通知 SSE；故障回滚整局事务，恢复后同一操作可重试。transport trustedResult 的 pending 维持终局收据一致；GET /results/:matchId 返回实际 settled/rejected/disabled，不能以 pending 当成已加分。

## 2. 掼蛋可信结果

配置 nobi-single-hand-v1；四个真实账号，0/2 对 1/3，从级牌 2 开始。保留现有牌型、压牌、不出和发牌规则。只在裁判 VM 延后终局到三人出完，再把唯一剩余者补为末游，记录完整四人名次，单机和原游戏文件不改。

头游所在队获胜。头游队友二游/三游/末游分别升 3/2/1 级，级序 2–A 并封顶 A，可信结果记录 level、upgrade、nextLevel、placements。当前是单副牌评级，新房间仍从 2 开始；进贡、多轮级牌继承及过 A 系列未实现，不宣称完成完整掼蛋赛事。

完整自然终局才计分；离开、认输、超时等异常终局留结果和 rejected 审计，不以客户端退出信息推定竞技胜利。掉线继续保留座位和快照，沿用原重连与服务端回合超时；自动托管尚未引入。

## 3. 围棋数目规则

配置 Chinese-area-agreement-v1：19 路、白贴 7.5，采用数子面积公式。双方虚着后进入 scoring，停止回合计时，不能继续落子或非法终局。服务端根据真实棋盘计算活子 + 单色围空；接触两色/无色空区默认中立，提子不重复加分。双方可声明完整中立区域处理共同确认的双活等局面。

死子声明必须覆盖完整同色连接组，只从数目副本移除，不改变棋盘基线。服务端生成确定性 proposalId，提议者同意后只能由对方确认该版本；伪造/旧 ID、自行确认、非法坐标/部分组均拒绝。争议撤销提案，可重新提议或恢复下棋，绝不自动猜测死活。尚无外部仲裁或争议超时处罚。

确认数目、本人二次认输和服务端回合超时可结算；至少两次实际非虚着落子，提前结束/异常退出不计分。已结束禁止继续落子，客户端不能提交 timeout。保留原提子、触屏预览/确认/取消、整轮悔棋及简单劫，不声称完成中国正式赛事全规则、全局同形/让子/总时限制度。

## 4. 评级与段位

不同游戏、永久与赛季独立；初始 1500，固定 K=32。围棋一对一；掼蛋每队取两人平均评级，同队收到相同变化。E=1/(1+10^((对方队均分−本队均分)/400))；Δ=round(32×(结果−E))，对方相反，最低 0 的共同限幅维持零和。等分胜者每人 +16、败者 −16。正式配置没有和局，纯 Elo helper 保留和局测试。

保存对局前/后/变化、场次、胜负、最近时间；胜率=胜场/总场。Nobi 段位阈值：<1200 青铜，<1500 白银，<1800 黄金，<2100 铂金，<2400 钻石，其余大师。无场次显示未定级；这些是产品等级，不是官方围棋资格。

## 5. 数据库增量迁移

仅应用隔离迁移 20261010000600–01000；保留 001–005 和既有对象。复用 game.seasons、ratings、match_records、rating_events、rankings，不重复建 player_ratings/match_results/rating_history。

| 迁移 | 内容 |
| --- | --- |
| 006 competitive_settlement | 永久锚/本地测试赛季、评级统计/变化、可信结果版本、审计/榜快照、私有管理员、原子结算/赛季管理 |
| 007 settlement_guards | 完整可信起源/资格检查、永久优先、暂停赛季归档、昵称资料 RPC 的 authority 授权 |
| 008 qualified_settlement | 修正 PL/pgSQL 变量与成员 seat 的歧义，限定表别名 |
| 009 season_expiration | 可信读取触发到期归档；结算自身检查日期 |
| 010 result_participants | 结果→房间外键、归一化参赛者→Auth/结果外键、座位唯一、RLS、插入时核对真实完整成员 |

新增 game.settlement_audit、leaderboard_snapshots、match_participants 及 nobi_private.admin_users。既有 rating_events 保留一局一人唯一约束，一行记录永久/赛季两套变化。评级统计平衡、结果/赛季/身份外键、分页/历史索引、唯一当前赛季均核验。

结算 SECURITY DEFINER 固定空 search_path，撤销 PUBLIC/anon/authenticated EXECUTE，仅 nobi_authority 可调用。核对私有 ended 快照、结果版本/JSON、公开 ended 版本、真实完整座位、可信规则/赛季/资格；记录锁及事务 advisory lock 串行化结算与管理，杜绝部分玩家更新/并发丢分。同场 settled/rejected 重试稳定返回，不重新计分。

独立 verify-competitive.sql 检查 RLS/角色/RPC/外键/私有发布/唯一约束，实际 PASS。rollback-competitive.sql 在有竞技数据/管理员等配置时拒绝执行，无数据时仅撤回本阶段 006–010。已实际回滚到 005，再重新应用到 010 和重新验收。不是生产迁移/历史清理工具。

## 6. 赛季、榜单与管理

赛季有日期、draft/active/paused/archived、启用状态，最多一个 active。管理员 create/activate/pause/archive 经私有 allowlist，用户自改 metadata 不授予权限。切换归档旧赛季、保存两游戏快照，新赛季从 1500 开始，永久评级/战绩不重置。归档不能重启或修改赛季评级。到期在可信读取归档，无常驻 cron；截止后结束的对局拒绝计分并审计。

提供全服掼蛋/围棋、当前/历史赛季、好友空接口、我的排名/积分/段位、统计、近期变化及本人战绩。分页每页默认 20、最多 50，3 秒有限缓存，结算/管理清缓存。同分 RANK 名次为 1/1/3/3，内部 UUID 保持分页顺序；原兼容 SQL rankings view 不改。周/月筛选最近活跃记录的当前分数，不伪装独立期间积分。

Phase 1 UI 只在隔离 dev 配置接入这些 API，明确标识测试积分，默认正式构建仍空配置。进入/刷新查询排名，未加入自动排行榜推送。好友关系尚未正式实现，显示真实空状态；后台交付服务端管理 API，未新增管理员网页。

## 7. 权限与反作弊

实测拒绝伪造胜负、非参赛者操作/读取结果、自改评级/赛季、普通玩家调用结算、重放改载荷、旧版本、重复终局。私有审计、管理员表、手牌不在 REST/Realtime 发布；个人变化历史限本人，管理接口另核权限。普通客户端不能绕过裁判提交积分。

短局、同组对手一小时重复对局预留审计 signals，不自动封禁；异常退出留 rejected。测试证明幂等及事务安全，不证明公网反作弊完整：弃局规避损失、批量账号、代打/串通仍需政策和证据链。

现有未加密 iOS 私钥与 PKCS12 容器暴露仍 FAIL，根依赖 3 high / 1 critical 仍 FAIL，tooling audit 0。未改签名、未输出秘密、未触碰历史。发布阻断与换钥顺序见 [保留的安全清单](security-findings.md)。

## 8. 测试结果

| 类别 | 结果 | 数量 / 证据 |
| --- | --- | --- |
| Vitest 单元 | PASS | 92/92，原 83 保留 + 新 9；17 文件 |
| 离线 HTTP 模拟 | Mock PASS | 1 测试 / 10 子检查，不算真实 Supabase |
| 原 Edge 页面回归 | PASS | 23/23，登录/大厅/触屏/旋转/导航/音频/CS1.6 等保留 |
| 原真实 Supabase | PASS | 19/19，真实 Auth/RLS/RPC/Realtime、完整非竞技联机 |
| 原真实浏览器联机 | PASS | 4/4，四人/双人、断网/刷新/恢复/故障/鉴权 |
| 新真实竞技 Supabase | PASS | 11/11，下面逐项列出 |
| 新真实竞技 Edge | PASS | 2/2，完整四人掼蛋、双人移动围棋终局后本人榜单/战绩更新 |
| TS 类型/SQL 契约/迁移回滚重应用 | PASS | 本地真实执行 |
| 私钥风险扫描 / 根 npm audit | FAIL | 既有风险未处置；不是测试通过例外 |
| tooling npm audit | PASS | 0 已报告漏洞 |
| 生产契约、公网/多裁判负载 | NOT VERIFIED | 未连接/未部署 |
| Android/iOS 真机、IPA/正式签名发布 | NOT RUN | 本阶段未执行 |

新增 11 组真实数据库检查：真实管理员/metadata 欺骗/RPC 禁止；完整掼蛋四人名次和团队 Elo；围棋提子/死活争议/恢复/数目/贴目/非法结束；服务重启及终局相同重试；客户端改分/赛季和私有历史拒绝；注入失败全员回滚及同命令恢复；两个 PostgreSQL 进程并发结算/重复重试无丢分；分页/同分/本人榜和真实好友空；异常退出不计分/管理员审计；服务端超时；赛季暂停/切换/到期/只读/永久保留。

并发测试仅重置自有已由裁判结束的隔离夹具，真实执行两进程 SQL 事务；超时测试加速服务时钟，不冒充真实长时间设备体验。预期故障注入 SQL ERROR 后断言恢复 PASS，不是未处理失败。一次性账号/房间/积分等在 finally 清理，原配置恢复；不使用生产用户和敏感数据。

实际截图见 [截图说明](screenshots/phase-3c/README.md)：5 张来源于本轮浏览器运行，手机为 390×844/DPR3 模拟，非 AI、非真机。已核看移动及 PC 榜单。未覆盖旧阶段截图，PC 确认参考缺失，不宣称像素级设计验收。

## 9. Web/App 与资源

Web build、mobile build、Capacitor copy Android/iOS、白名单产物校验 PASS。Android Debug Gradle 实际 BUILD SUCCESSFUL（26 秒），82 tasks；默认 debug 签名。使用隔离 JDK 17.0.20.1、SDK Platform/Build Tools 34、Gradle 8.0.2、AGP 8.1.4、Capacitor 5.7.8；全局 JDK 21 未改，既有 flatDir/SDK XML 警告保留。

APK：android/app/build/outputs/apk/debug/app-debug.apk，6,072,065 字节，SHA-256 **8a3e9d894e2dcd2b8709898519baf2c7d4088c378c8d08d3f4a65fc26024cb14**。APK 资源/白名单实际 PASS；不是 release/IPA 或真机验收。Web/App 使用同一业务适配代码，默认 online-config=null，PC loopback 不能当手机真实服务地址。

56/56 原扑克 PNG 哈希 PASS，7/7 围棋源渲染基线 PASS；Web/App/APK 原牌面完整，APK 3 个对应渲染片段 PASS、5 音频资源 PASS。未修改 images/cards、原 game.js/game.html、掼蛋引擎源/AudioManager。移动包无可用 CS1.6 入口，PC 入口保留。原未跟踪参考图 SHA-256 d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b 保持。

## 10. 修改文件

- 服务：server/competitive-rules.ts、ratings.ts、authority.ts、legacy-rules.ts、persistence.ts、http.ts、README.md。
- 数据库：local-supabase/supabase/migrations 的 006–010；sql/verify-competitive.sql、rollback-competitive.sql。
- 工具：scripts/competitive-contract.mjs、local-admin.mjs、rollback-competitive.mjs；package.json（无 lock/依赖变更）。
- UI：online.html；ui/rankings.js、lobby.js/css、online.js/css。
- 测试：tests/unit/competitive.test.mjs、integration/competitive.test.mjs、competitive-browser/rated.spec.mjs、phase3c.playwright.config.mjs；既有 real-browser.spec.mjs 仅增加截图输出目录选择，.gitignore 忽略回归图。
- 文档：本报告、本地指南、sanitized 测试结果、截图 README/5 PNG、安全清单增量。既有规则/资源/阶段报告和全部旧测试保留。

## 11. 本地 Git 提交

分五批：可信结算、评级数据库及 API、排行榜/战绩、赛季管理工具、测试与报告。

| 批次 | 实际 Commit SHA |
| --- | --- |
| 可信掼蛋/围棋结算及单元测试 | cbfa2dc483891b07b31ce13a42a42f4f1e6f25ce |
| 原子评级、数据库、赛季及权限 API | 39482588090ab05f388611bf026599c552d97486 |
| 排行榜、数目协商及个人战绩 UI | 58850250739d4bb2ff442b62d4a163db0cfbd584 |
| 赛季管理工具、回滚契约及安全指南 | ceff1bddeca05c4e6338c8a899dd8b0b9dd098ce |

测试/报告提交自身 SHA 用 `git log -1 --format=%H -- docs/nobi-v2/phase-3c-report.md` 查询，并在最终交付消息列出，避免自引用哈希。

提交前运行真实测试/构建、资源/敏感 staged guard 和 git diff --check。仅本地 feature 分支，main 保持 a0bb939dbe3544abb5b99ab7fc500a76b2998e06，不推送。最终仅保留既有未跟踪设计目录。

## 12. 未解决项与 Phase 4 条件

1. 复现本阶段 92 单元、23 页面、19+11 数据库、4+2 真实浏览器及资源验证；先保留隔离系统，不能未经评审迁入生产。
2. 定版掼蛋进贡/多副牌/级牌继承、完整围棋劫/时限/死活争议、断线/弃局/托管与反刷分政策；当前单副牌与协商数目边界不能隐藏。
3. 最小权限 DB 驱动替代 Docker 操作员桥；跨进程房间所有权、事务锁扩展性、公开限流、Auth 撤销、日志保留/容量、独立 HTTPS 压测。当前只有一个本地裁判，真实数据库并发结算不等于多服务游戏状态验收。
4. 好友关系、管理 UI、定时归档、长期快照/审计检索及真实设备后台/旋转/网络/音频联机后续验证。Windows 未运行 Xcode，IPA/真机仍 NOT RUN。
5. 签名所有者审批换钥及历史公开调查，受控解决 3 high / 1 critical 依赖后，才可讨论推送/正式发布；本阶段正式生产保持 NO-GO。
