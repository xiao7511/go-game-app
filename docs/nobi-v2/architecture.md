# PC / Android / iOS 统一架构与功能方案

这是 Phase 0 的架构决策与实施设计，尚未建立目录、安装新依赖、迁移数据库或实现功能。

## 1. 架构决策

采用**同一 Web 源码 + 模块化公共服务 + Capacitor 原生壳**。保持现有原生 HTML/JS 游戏；新壳使用原生 Web 组件/TypeScript 模块，不引入 React/Vue 全量改写。后续用 Vite 多入口构建公共模块，遗留传统 script/视觉资源按白名单原样复制；锁定工具版本并显式设置 WebView/Safari 兼容目标，不能照搬默认现代浏览器范围。[Vite 构建与多入口说明](https://vite.dev/guide/build.html#multi-page-app)

```text
同一源码、同一提交
        │
        ├─ 公共壳：深蓝大厅 / 排行榜 / 个人名次 / 设置 / Auth
        │       ├─ GameRegistry + PlatformCapabilities
        │       ├─ SupabaseService + RankingService
        │       └─ AudioService + Preferences
        │
        ├─ 游戏适配器：围棋、掼蛋、Windows CS 外部拉起
        │       └─ 原规则与原视觉，按生命周期接入
        │
        └─ 白名单构建
                ├─ dist/web → PC Web / 移动浏览器
                └─ dist/mobile → Capacitor → Android / iOS
```

`www/` 不再作为人工维护的第二套源码。过渡时保留其旧实现作审计参考，先完成回归比较，再让 Capacitor webDir 指向实际生成的 mobile 产物。原有根 PNG 是唯一牌面来源，产物中的副本不产生第二套设计权威。

Capacitor sync/copy 只消费已经生成的 Web 资源，不代替 Web 构建；原生依赖变化使用 sync，纯资源更新可 copy。Web 与原生的构建/资源校验必须在 copy 前完成。[Capacitor v5 工作流程](https://capacitorjs.com/docs/v5/basics/workflow)

## 2. 游戏隔离与生命周期

过渡期确定使用**独立游戏 HTML 页面作为受控同源子页面**，由新壳承载，避免三款游戏全局 state/CSS/定时器互相覆盖。原围棋/掼蛋页面仅加载所需核心和独立适配层；新壳不加载旧 game.js 的高频大厅清洗器。此方案先在 PC Web/Android/iOS 做原型验证，尤其是 Canvas 尺寸、移动触摸、全屏和键盘返回。

- 适配层契约：mount(mode, room)、ready、pause/resume、leave、destroy、resultCandidate。
- 进入游戏前校验配置与真实 Auth 用户；邀请恢复必须等认证/引擎就绪。
- 返回大厅时先退频道、清事件/计时器/音频，再销毁子页面；不能仅 display:none。
- 子页面保留既有渲染；iframe 边界用于隔离，不代表可以改牌面或棋盘。
- 壳与子页面通信验证 window 来源、可信页面路径、origin 和消息 schema；原生自定义协议的 origin 行为需实测，不接受任意消息。不在消息中传 service_role 或明文密码。
- 公共模块统一 Auth/config；遗留游戏短期仍可能创建既有客户端，适配层需追踪与释放，逐步通过服务桥接收敛。不宣称本轮已完成单例化。
- resultCandidate 是不可信候选结果；只有服务器验证完成才可更新排名。
- 若子页面在某设备存在不可解决兼容问题，改为独立顶层路由是后备方案，需重新验证音频连续性；不同时维护两套游戏引擎。

## 3. 平台能力与 CS 边界

| 能力 | Windows PC | 其他 PC 浏览器 | Android/iOS App | 移动浏览器 |
| --- | --- | --- | --- | --- |
| 大厅、围棋、掼蛋、排名、设置 | 提供 | 提供 | 提供 | 提供 |
| 原扑克/围棋视觉 | 原样 | 原样 | 原样 | 原样 |
| CS1.6 卡片 | 保留 | 保留并说明现有 Windows 启动条件 | 不提供 | 不提供 |
| CS 下载/初始化/协议启动 | 支持现有 Windows 方案，需专项验收 | 无现成可用启动器 | 不打包、不调用 | 不提供 |
| 音乐 | 页面激活后播放 | 同左 | 页面激活后播放，进后台暂停 | 同左 |

原生平台通过 Capacitor.getPlatform/isNativePlatform；屏宽只用于布局，不判断 CS 功能。Web 再结合设备/操作系统能力，未知移动环境默认禁用 CS。native 构建阶段排除 CS adapter/脚本/BAT/VBS/下载链接，运行期注册表与直接路由再拒绝。单纯隐藏卡片不够。[Capacitor 平台 API](https://capacitorjs.com/docs/v5/core-apis/web)

CS1.6 保持外部 Windows 客户端，不嵌入 WebView、不新建 MongoDB。现有 API/Worker 的地址、参数和 trusted result 需独立核验；没有可靠服务器战报之前 CS 也不计竞技分。

## 4. 深蓝电竞大厅

新壳的导航为大厅、排行榜、个人信息和设置；游戏由注册表生成，字段建议 id、标题、介绍、封面、平台、模式、状态、适配器。新增游戏只追加注册项和 adapter，避免在大厅函数中不断增加条件分支。

PC 使用适应大屏的卡片和导航；Android/iOS 使用**已经确认的 Nobi V2.1 正式稿**。当前稿件文件映射缺失，实施前需登记文件路径、版本、尺寸、哈希、页面/状态对应关系。图标概念图不能替代正式稿，不在 Phase 0 自行另作视觉方案。

深蓝主题应用于大厅/公共导航；游戏内部原木纹、黑白棋子和扑克牌面保持原风格。登录、空列表、离线、加载、无排名和异常都需要明确状态；不把“联机功能未完成”包装为可用竞技按钮。

## 5. 排行榜与个人排名

### 最小功能与产品规则

按游戏分榜，支持周期与 Top N 分页；个人卡片显示同一榜单下积分、名次、有效对局数。初期不混排围棋、掼蛋、CS 的不同分数。

建议规则：仅服务器验证的真人联机结果计入；单机/AI/未验证历史对局不计竞技分；重复、放弃、断线、异常和作弊结果有明确状态。掼蛋按真实队友身份记录团队胜负，不能用固定本地南北视角计算全员积分。

名次采用分数降序的 rank 语义，同分同名次并跳号；分页显示以 user_id 等稳定次序排序，个人名次计算不包含该排序键。默认周期建议“全部”，赛季扩展用 period_id；得分公式、最低对局数、认输/断线政策在竞技阶段正式定版。未有有效对局显示“暂无排名”，不伪造名次。

### 同一 Supabase 中的增量数据草案

| 草案对象 | 用途与主要约束 |
| --- | --- |
| nobi_v2.game_catalog | game_id、模式、启用状态、规则版本 |
| nobi_v2.match_results | match_id、game_id、period_id、mode、status、result_version、verified_at |
| nobi_v2.match_participants | (match_id,user_id) 唯一，seat/team/outcome；身份绑定 auth.users |
| nobi_v2.score_events | (match_id,user_id,result_version) 幂等键；积分增量与原因；可信写入 |
| nobi_v2.player_stats | (game_id,period_id,user_id) 唯一；聚合积分、胜负、有效对局、更新时间 |
| 受限查询 RPC | leaderboard(game,period,cursor,limit)、my_ranking(game,period) |

名称/签名在实际 schema 快照后确定。无需把 user metadata rank 改作积分，也不回填不可信历史数据。索引至少覆盖 game/period/score 的榜单读取及结果幂等键；用分页和上限控制请求量。

### 可信结果路径

游戏候选结果 → 已认证接口 → 服务端验证参与者/对局状态/规则/消息顺序 → 事务插入 result 与 score_event → 更新 stats → 同一数据快照查询榜单和个人名次。

客户端禁止直接写 stats/score_events，禁止自行提交 final score；可信写入逻辑在现有自建后端或受限 Supabase RPC 中，实际可用运行方式根据自建版本确定。RPC 也必须做身份/对局校验，SECURITY DEFINER 与授权需最小化。[Supabase 数据库函数说明](https://supabase.com/docs/guides/database/functions)

现有客户端广播结果不具备上述可信链。排行榜 UI 可先通过测试数据/只读 mock 开发，必须标明测试；真实计分要等待受保护房间、隐藏手牌和权威结算实现。通过外层 adapter 增加竞技通路，保留旧休闲逻辑，避免把新需求变成整套规则重写。

## 6. 背景音乐与音量

统一 AudioService 由壳持有，避免每次进入游戏重复创建循环音乐。现有五个围棋 MP3 和掼蛋合成音效继续保留，通过最小音效适配桥纳入设置。背景音乐需要有明确授权的本地音频，当前无音乐曲目或授权清单，不在本轮下载/制作。

建议 master、bgm、sfx 三个增益、独立静音和音乐开关；滑块 0–100 映射 gain，所有增益相乘；音量 0 必须静音。用 Web Audio GainNode 接音乐与音效，避免仅依赖部分移动平台受限的 media.volume；变化平滑渐变避免爆音。[GainNode 文档](https://developer.mozilla.org/en-US/docs/Web/API/GainNode)

首次用户操作再创建/resume 音频上下文并启动，处理 play 拒绝、suspend 和加载失败，显示可操作的播放状态；不将自动播放失败当游戏加载失败。[浏览器自动播放规则](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

默认建议音乐关闭、主音量 70%、音乐 35%、音效 70%；这是产品默认草案，不代表用户已确认。保存到带版本的本地 nobi.audio.v1 偏好，重进和重启恢复；跨设备同步暂不作为最低需求。退出账号仅清认证/业务缓存，不清用户音量偏好。

进后台/锁屏/页面隐藏暂停，回前台只在用户原本开启时恢复；CS 外部启动导致失焦也暂停。不申请持续后台播放能力。iOS 来电/音频中断、Android 返回和页面反复挂载必须在真机测。

## 7. 配置、缓存与发布

- 同一运行配置契约区分 dev/staging/prod，保持上海自建实例；开发默认禁止指向生产写入。
- pin Supabase SDK 并纳入锁文件/构建，避免原生必须靠 CDN；不升级所有依赖来替代问题定位。
- Web 根域/子路径与 native 相对 URL 均有产物验证；旧 image/sound 相对路径保持可解析。
- SW 只管理本应用静态文件，配置/鉴权/API/Realtime 不进入 cache-first；原生优先本地打包资源。
- 发布只上传 dist/web，禁止上传整个仓库、签名文件、node_modules、docs 检查证据或 source maps 中的敏感值。
- Android/iOS signing 位于 CI 受限秘密存储；本轮不迁移/删除/轮换。
- feature 分支只做构建和测试；实际部署/生产迁移在后续明确批准的发布阶段。
