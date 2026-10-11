# Supabase 数据结构与鉴权审查

## 1. 证据范围

审查 `supabase_schema.sql`、config、登录注册、大厅和两套多人代码。用户指定的目标是上海腾讯云现有自建 Supabase；本轮不访问生产数据库，不执行 schema 文件，不创建账号、不发送房间/战绩数据。

仓库未提供自建实例版本、Compose/Kong 配置、实际 schema-only 快照、GRANT、RLS、publication 或 RPC 定义导出。以下 SQL 是**仓库声明**，并非确认的线上结构。缺少配置不代表生产未部署或数据不存在。

## 2. 仓库声明与调用契约

| 对象 | 仓库 SQL | 代码调用 | 差异 |
| --- | --- | --- | --- |
| game.waiting_room | user_id/nickname/created_at | 未见主流程使用 | 不是掼蛋现有广播匹配表 |
| game.game_sessions | black_id/white_id/board_state/next_turn/captures/moves/status | 主围棋使用 game_rooms | 未匹配 |
| game.moves | session_id/user_id/x/y/player/turn_number | 主围棋直接写快照 | 没有统一落子流水 |
| game.game_rooms | 未定义 | 根/ www 多人读写 code、双方 ID、快照、回合、提子数、status | 依赖线上未知结构 |
| matches | 未定义 | gameService 两套副本使用 matches/current_turn | 未接入页面且契约漂移 |
| public.get_player_profile(player_id) | SECURITY DEFINER，读取 auth metadata | 根使用默认 game schema 且参数 p_id；www 用 player_id | 根 schema/参数均不匹配声明 |
| game.handle_surrender | 未定义 | www RPC；根实现为广播协商/空 handleSurrender | 文案与实现不一致 |
| profiles / users | 未定义 | 根 CS 昵称查询默认 public | 只可确认引用，无法确认存在 |
| 排行榜、积分、个人名次 | 未定义 | 未实现 | 需新增独立契约 |
| 掼蛋持久化/结果 | 未定义 | 房主广播所有手牌 | 无可信结果来源 |

根围棋客户端设置默认 game schema；大厅客户端默认 public，两者不是同一实例/数据库 schema。gameService 导入不存在的 `supabase` export；根客户端文件为空，www 只导出 getSupabase/resetSupabase，裸 npm import 与 import.meta.env 也依赖未提供的打包器。页面当前未引入这两个服务模块，不能把潜在问题认定为已触发页面错误。

## 3. SQL 静态审查

已有安全措施：三个 game 表启用 RLS；waiting_room 限本人读取/插入；session 按参与者读取/更新；moves 按参与者读取/插入；profile 函数空 search_path 且显式访问 auth.users。

未覆盖的问题：

- 未创建 game schema，未声明 API exposed schemas、schema usage/table/sequence grants 或 Realtime publication，不能从零重建完整环境。
- waiting_room 没有 UPDATE/DELETE 策略，重新匹配/退房所需权限未定义。
- game_sessions 的 INSERT 只验证 authenticated，没有要求插入者为参与者，也未验证双方不同。
- 参与者可更新整行 board、双方 ID、回合、status 等，RLS 不等于游戏规则、列级授权或轮次校验。
- moves 没有 (session_id, turn_number) 唯一约束，也未按当前执色/回合/棋盘合法性校验。
- 状态为自由文本、棋盘 JSON 无形状校验；无可信 winner、规则版本和积分流水。
- INSERT session 和 moves 策略在重复执行前没有 DROP IF EXISTS；文件并非完整幂等迁移。
- profile SECURITY DEFINER 的调用权限/角色未显式限制；上线前应核查实际 EXECUTE grants 和最小化可读展示资料。不能返回邮箱等私人信息。
- rank 从 raw_user_meta_data 读取，注册表单允许玩家自行选择；它是展示段位，不是竞技积分或个人名次。

Supabase 文档明确用户 metadata 可由用户修改，不可用于授权或可信排名；新表还需同时检查 GRANT 与 RLS，service_role 仅留服务器。[官方 RLS 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)

这些判断仅针对仓库 SQL；没有据此判定线上实际策略存在同一缺陷。

## 4. 配置与鉴权

### 配置链

根 loader 先 fetch /get-config，再读 APP_CONFIG_LOCAL/LOCAL_CONFIG，最后发布 APP_CONFIG/configReady。CI 写的是 window.CONFIG，离线 mock 已证明远程配置失败时无法被 loader 合并。login 引入 config.local.js，game/register 不引入，不能将前一页面内存配置延续到下一页面。www loader 同步读取 APP_CONFIG_LOCAL，无远程/事件链。

Cloudflare Function 以 Referer.includes 域名字符串检查来源，且只允许特定 Web Origin；该检查不是鉴权，也不能支持 Capacitor 的原生来源。GitHub Pages 是静态站，不会运行该 Function。生产实际 Worker 路由不在仓库，需另取脱敏配置核验。

后续统一配置就绪 Promise/契约、环境区分与 URL 清洗；客户端只放公开 URL/anon key，不放 service_role 或私钥。anon key 属于客户端公开凭据，数据保护靠授权；不把“放入 JS”本身当成泄密结论。

### 登录生命周期

邮箱密码 signInWithPassword/signUp 已实现；SDK token 和 sessionStorage 中的展示资料属于两套数据。根 game 没有启动 getSession/getUser 与 onAuthStateChange 的完整会话恢复，setLoggedIn 的消费者/UID 桥接缺失；直接访问 game 或邀请会生成临时 UID。www 有 getSession 入口，但配置/客户端并不统一。

统一使用认证用户 id；昵称/头像可缓存但不作为授权；失效/退出清理相关频道、计时器和业务缓存；使用命名空间偏好键，避免现有 localStorage.clear 删除未来音量设置。注册成功需区分有无 session/邮箱确认，不能假定所有自建实例都关闭邮件确认。本轮未验证生产 SMTP、验证码、速率限制、refresh 配置。

## 5. Realtime 与可信排名

现有围棋同时采用数据库快照与广播；掼蛋只使用房主广播。两者都没有显式 private channel，未见绑定 Auth UID 的服务器消息授权。表 RLS 与广播频道授权是不同边界；有表 RLS 不代表手牌广播已隔离。

新竞技模式先确认自建 Realtime 支持相关能力，再在测试环境配置私有频道和参与者策略。不能直接照搬最新托管版配置到未知版本。官方授权机制涉及 realtime.messages 策略与 private channel 配置。[官方 Realtime 授权说明](https://supabase.com/docs/guides/realtime/authorization)

已有所有手牌广播、不可信 UID 和缺失动作处理器意味着掼蛋现状不满足竞技要求。仅新增“结果上报接口”并不能解决作弊或幂等问题。旧休闲游戏可以先维持；未通过可信验证的对局不得计入真实排行榜。

## 6. 后续只读核查清单

下一阶段从管理员已有导出或**隔离测试环境**取得以下证据，先脱敏再入库：

1. 自建 Postgres/Auth/PostgREST/Realtime/Functions 版本与已启用能力。
2. game/public 的表、字段、索引、外键、CHECK、触发器、函数签名和 search_path。
3. 各 schema/table/sequence/function 的 grants、RLS enabled/forced 和 policies。
4. Realtime publication、频道私有性/订阅权限、暴露 schema。
5. Auth SITE_URL/redirect allowlist、邮件确认、token 刷新、Web 与 native Origin/CORS。
6. game_rooms / profile / surrender 的真实契约，以及已存在战绩表。
7. 备份/恢复记录、测试环境隔离方式与脱敏测试账号。

不把用户数据、数据库连接密码、JWT/service_role、私钥或导出中的敏感值写入审计文档。当前未取得这些证据，相关验收标记为未验证。

## 7. 数据演进边界

建议新竞技数据采用独立 nobi_v2 schema/命名空间，通过最小 RPC 接口访问，保持现有 game 表与休闲对局兼容。真实实例核查后再确定暴露位置与函数签名。计划里的表/RPC 名称是设计草案，不表示本轮已创建。

迁移先在隔离环境执行，含权限负向测试、事务/幂等/并发/回滚验证；生产应用必须在后续另行授权后执行。不得直接运行当前 supabase_schema.sql 到生产，也不为 CS 示例引入 MongoDB。
