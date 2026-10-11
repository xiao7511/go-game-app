# Phase 3C 隔离竞技系统复现

仅用于已有 `nobi-phase3a-local`。脚本检查 loopback API、标记 RPC、Compose 归属和独立凭据，不得改成生产地址运行迁移/测试。专用卷保留，原 5178 和其他项目容器不受影响。

| 服务 | 地址 |
| --- | --- |
| Supabase API/Auth/Realtime | 127.0.0.1:55421 |
| PostgreSQL | 127.0.0.1:55422，supabase_db_nobi-phase3a-local |
| Node 裁判 | 127.0.0.1:55430 |
| 隔离 Vite | 127.0.0.1:5189，仅 dev |

凭据在 ignored `.nobi-isolated/phase3a/runtime.json`，手工账号在 `.nobi-isolated/phase3b/manual-accounts.json`；不得复制进文档、截图、日志或 Git，不用生产 service_role。

## 启动

```powershell
npm run local:start
npm run local:migrate
npm run local:verify
npm run local:verify:private
npm run local:verify:competitive
npm run local:accounts
# 终端一
npm run authority:local
# 终端二
npm run dev:isolated
```

分别在独立浏览器使用测试账号，打开 `http://127.0.0.1:5189/online.html`。创建时勾选“隔离测试竞技积分”，默认不勾选。赛季必须有效且启用；无有效赛季则拒绝创建。单机/AI/普通房间不计分。

掼蛋四人加入完整房间 UUID，房主开始；座位 0/2 对 1/3，服务端洗牌/发牌/裁决，只发送本人手牌。采用 Nobi 单副牌规则，从 2 开始；完成四人名次后，头游队友为二游/三游/末游分别升 3/2/1 级，记录 nextLevel。新房间仍从 2 开始，没有进贡、多副牌晋级和过 A 系列。

围棋 19 路白贴 7.5；双虚着暂停进入数目协商。死子必须完整同色连接组，中立声明必须完整空区域；坐标 A–T 跳过 I，1–19。服务端计算活子加单色围空，提子不重复加分。提议者已同意，对方确认相同 proposalId 才结束；争议可重新提议或恢复下棋，不自动猜测死活。协商暂停回合超时，尚无外部裁判/争议期限。认输本人二次确认，超时仅由服务端触发，计分需至少两次真实落子；提前/异常退出不计分。

结果页查询数据库实际 settled/rejected/disabled。终局 transport 的 pending 保持收据重试一致，不能代替数据库状态。隔离大厅显示“隔离测试积分 · 非生产”，支持游戏/永久/赛季/历史/分页/我的排名/战绩。进入或刷新查询，缓存最多 3 秒，结算清缓存。周/月是最近活跃玩家的当前评级，不是独立周月积分；好友尚未建设，接口真实为空。

## 管理

服务端检查 `nobi_private.admin_users`，不信任 editable Auth metadata。以下占位符只能换成已记录的本机手工测试 UUID，不能粘贴密码：

```powershell
$env:NOBI_ISOLATED_ACK='LOCAL_DISPOSABLE_ONLY'
npm run local:admin -- <local-manual-auth-uuid>
# 演示后撤回
npm run local:admin -- <local-manual-auth-uuid> --revoke
```

HTTP 需要本地 Auth Bearer Token，避免放进命令历史/文档。

| 接口 | 用途 |
| --- | --- |
| GET /leaderboards?game=go&scope=season&page=0&limit=20 | global/season/friends；可选 seasonId 查询归档 |
| GET /me/ratings?game=guandan | 本人永久/赛季评级与统计 |
| GET /me/history?game=go&page=0&limit=20 | 本人战绩及变化 |
| GET /seasons | 当前/历史赛季 |
| GET /results/:matchId | 参赛者实际结果；非成员 404 |
| GET /admin/seasons | 管理员赛季列表 |
| POST /admin/seasons | operation=create/activate/pause/archive；id；create 加 name/startsAt/endsAt |
| GET /admin/settlements | 最近 100 条审计 |
| GET /admin/history?userId=<uuid>&game=go | 指定玩家变化 |
| GET /admin/results/:matchId | 指定对局结果 |

归档不可重新启用/改赛季积分，切换保存两游戏快照，永久统计保留。旧赛季截止后结束的对局不再计分，留 rejected 审计。到期在可信读取时归档，结算也检查截止时间；没有部署 cron。

## 顺序测试与构建

数据库/浏览器套件不可并行切换赛季；浏览器自行启动/关闭 5189/55430，先停手工服务。

```powershell
npm test
npm run check:authority
npm run test:integration:offline
npm run test:integration
$env:NOBI_ONLINE_SCREENSHOT_DIR='docs/nobi-v2/screenshots/phase-3c-regression'
npm run test:online:browser
npm run test:competitive:browser
npm run test:competitive
npm run verify:assets
npm run build
npm run build:app
npm run verify:build
npm run verify:mobile-assets
npm run android:debug
npm run verify:apk-assets
```

原 23 项 Edge 回归设置 NOBI_BROWSER_CHANNEL=msedge；复用 5178 时 NOBI_REUSE_DEV_SERVER=1。NOBI_SCREENSHOT_DIR/NOBI_MATCH_SCREENSHOT_DIR/NOBI_GUANDAN_SCREENSHOT_DIR 均指向 phase-3c-regression，再执行 npm run test:browser，避免覆盖历史截图。

竞技套件创建一次性真实 Auth 用户和房间，finally 清理自有评级/记录/收据/快照/账号，恢复原赛季。事务测试故意注入 test-only rating failure，验证全员回滚及同操作恢复。并发测试使用两个真实 PostgreSQL 进程，只把已由裁判结束的自有夹具重置为 pending；不伪装浏览器并发。超时检查加速服务端时钟，仍用真实 Auth/数据库，不等于真机长时间验收。

## 停止与回滚

Ctrl+C 停止自己启动的 UI/裁判；npm run local:stop 停本项目并保留卷。仅无竞技结果/快照/管理员配置时允许回滚 006–010：

```powershell
$env:NOBI_ISOLATED_ACK='LOCAL_DISPOSABLE_ONLY'
npm run local:rollback:competitive
npm run local:migrate
```

有竞技数据时脚本返回 BLOCKED，整体回滚自身事务，不删历史。专用卷重建按 [3B 指南](phase-3b-local-guide.md) 的 local:reset 流程，限确认可丢弃的本地数据，不能清理其他项目。

正常 Web/App online-config=null，未启用生产积分。手机不能访问 PC loopback；IPA/真机/公开 HTTPS NOT RUN 或 NOT VERIFIED。[安全清单](security-findings.md) 的签名暴露和依赖漏洞仍阻断正式发布。
