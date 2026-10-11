# 权威联机服务（Phase 3B / 3C）

Node 24 + TypeScript，绑定 `127.0.0.1:55430`；只接受独立 `127.0.0.1:55421` Supabase 和本地标记 RPC。服务重用原掼蛋/围棋规则 VM，没有引入 Redis、新游戏引擎或新服务器依赖。Docker SQL 桥属于本机开发工具，不能直接作为互联网部署方案。

## 入口与身份

`POST /rooms {kind}` 创建；`POST /rooms/:roomId/join {}` 加入；`GET /rooms/:roomId` 获取本人快照；`GET /rooms/:roomId/events` 订阅本人 SSE；`POST /rooms/:roomId/commands` 提交操作。除 health/OPTIONS 外，全部验证本地 GoTrue Bearer Token。UID 与昵称取自验证后的 Auth 用户；昵称仅作展示，不能授权或结算。所有 SQL 字符串经过 literal 转义。

持有完整房间 UUID 的已登录用户可以加入有空位的等待房间。RPC 行锁和唯一约束决定座位，调用方不能指定座位；重复加入保留原座位。进行中和满员房间拒绝新成员。房主断线不转移身份、不重洗牌，原座位可恢复。

## 协议

快照包含 `matchId, roomId, gameType, version, currentTurn, players, publicState, privateState, status, lastAction, updatedAt, deadline`。一个房间对应一局；下一局新建房间。publicState 只有公开棋盘/提子/历史或公开牌数/桌面牌；privateState 只包含请求者座位与自己的手牌。保留 Phase 3A 的本人 hand/board 等兼容字段，不增加对方手牌。

```json
{
  "matchId": "<room UUID>",
  "actionId": "<client UUID>",
  "expectedVersion": 4,
  "actionType": "play",
  "actionPayload": { "cardIds": ["<own card ID>"] }
}
```

动作：start、play、pass、move、undo-request/accept/reject、resign-request/confirm、cancel、leave。不接受客户端 winner/积分，也拒绝客户端 server-timeout。Phase 3A requestId/type 格式仍用于既有测试兼容。幂等范围为 `(roomId, Auth UID, actionId)`；JSON 对象字段排序后计算指纹，数组顺序保留。相同请求重试返回原响应，换载荷复用 ID 返回 409；旧版/未来版本返回 409 和 latestVersion。

## 原子持久化和恢复

`nobi_private.room_snapshots` 保存 formatVersion、当前公开局面、当前所有私有手牌、原始发牌、经服务裁判接受的操作日志、成员、版本和截止时间。该 Schema 未对 PostgREST 暴露、未加入 Realtime，anon/authenticated 无 USAGE/SELECT/DML；只有 nobi_authority 的指定表权限。

每次接受的操作在一个 SQL 事务内：锁定房间、比较持久版本、保存完整快照、插入唯一收据、保存可信终局记录、更新公开房间元数据。隔离竞技终局在同一事务调用 game.settle_match，更新所有玩家永久/赛季 Elo、战绩、历史和审计。只有 COMMIT 后发布 SSE。事务失败阻断内存房间，下一次恢复从数据库重建，不接受失败后的本地棋盘。服务端超时也使用同一原子路径。

冷恢复按房间串行，重放原发牌和日志并比对物化局面；恢复幂等响应、悔棋历史、结果、回合与截止时间。等待房间同步数据库 RPC 已分配座位，核对 owner/kind/座位前缀。客户端刷新只保存 Auth、UID 命名空间的 roomId 和未确认命令；棋盘/手牌始终重新取自服务端。

## 浏览器与通信

online.html 使用现有 Auth 单例和同源 game.html iframe。GD.applyAuthoritySnapshot 只接收本人手牌，其他座位只有长度信息；出牌/不出不在浏览器乐观执行。MP.applyAuthoritySnapshot 调用原木纹/棋子渲染，触屏预览、确认和取消仍使用原路径。

鉴权 SSE 传送私有快照，60 秒换连重新鉴权。Supabase postgres_changes 只传公开 rooms 版本，RLS 限成员；不使用客户端广播传牌或胜负。版本通知延后 150ms 合并，同期 SSE 已到则不重复取快照。Realtime 订阅显式设置当前 Auth Token，失败重订阅。SSE 与 Realtime 各自最多 8 次尝试，退避从 250ms 开始、最多 8s；之后手动恢复。离线/未确认操作禁用交互；网络/5xx 失败保留同一个 actionId，4xx 明确拒绝后同步。前台恢复获取最新快照。

CORS 只允许列出的本机开发端口与 Capacitor localhost Origin；不使用 *。服务限制 16KiB 命令、100 内存房间、128 SSE、每房间 10000 命令。当前仅验收一个本地权威进程，跨进程争抢、压测、公网限流、即时会话撤销和持久日志压缩 NOT VERIFIED。

## 终局边界

默认非竞技保持 Phase 3B 行为：掼蛋按旧引擎结束；围棋两次虚着 winner=null、scoring=not-adjudicated，不计分；认输本人二次确认，整轮悔棋对方确认。只有 POST /rooms {kind,competitive:true} 且有效本地赛季才进入竞技。服务端拒绝匿名竞技身份，浏览器默认不勾选竞技模式。

竞技掼蛋完整记录四人名次、0/2 对 1/3、按头游队友名次升 3/2/1 级；仅单副牌，不实现进贡/多副牌。原牌型引擎仅在服务端 VM 延后终局至三人出完，原游戏源文件和单机不改。围棋采用 Chinese-area-agreement-v1、19 路白贴 7.5：双虚着进入协商，score-propose/confirm/dispute/resume-play 经裁判；完整死子组/中立区域须双方同意。争议恢复下棋，不自动猜测死活。保留原简单劫，不宣称完整赛事规则合规。

trustedResult 增加 seasonId/rulesVersion/eligibility。transport settlementStatus=pending 保持终局收据重试一致，参赛者 GET /results/:matchId 查询同事务提交的 settled/rejected；非竞技 disabled。SQL 核对私有终局快照、版本、规则和完整成员，不接受浏览器 winner/积分；归一化 participants 外键与座位唯一约束保护身份。客户端没有评级写入/settle_match 执行权。

Elo 初始 1500、K32；游戏、永久、赛季独立维护。掼蛋用队伍平均评级、同队同变化。PostgreSQL 全局事务 advisory lock 防跨对局丢失更新，同场只结算一次。当前适用于隔离规模，未来须评估锁粒度及跨服务进程房间所有权。短局/固定对手频次只留审计信号，不自动封禁。

排行榜、战绩、赛季和管理员接口见 [Phase 3C 指南](../docs/nobi-v2/phase-3c-local-guide.md)。后台授权来自私有 DB allowlist，不依赖 editable metadata。归档赛季只读，永久历史保留；好友尚未建设，接口真实为空。

运行与真实验收见 [Phase 3B 指南](../docs/nobi-v2/phase-3b-local-guide.md)。
