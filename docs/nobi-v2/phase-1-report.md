# Nobi 游戏 V2.0 — Phase 1 交付报告

日期：2026-10-10，Asia/Shanghai。目录 `D:\project\go-game-app`；分支 `feature/nobi-games-v2`；起点 `f43f5d062ea5d563d7a65637a875aa1245fc2355`。

## 结论与边界

交付真实可运行的 PC 三栏大厅和手机大厅、游戏目录、个人中心、排名空状态、好友/战绩/通知占位页面及统一音频管理。不是效果图背景或新的规则引擎。55 项单元 / 12 项 Windows Edge 浏览器测试通过，包含原 38 / 6 项；Web、mobile、Capacitor copy 与复制后资源校验通过。56 PNG 和 7 围棋渲染区域保持原基线。

生产积分/好友/战绩、上海 Supabase 实际契约、CS 安装及真实联机没有冒充验收通过。没有授权 BGM，因此音乐开关保存偏好但不播放虚构曲目。原生编译、真机、Safari、耳机/电话中断 NOT RUN。既存签名暴露仍 FAIL，生产发布 NO-GO。

### 起始核实

- 起始 HEAD / 分支与用户指定一致；唯一未提交内容是用户的 `docs/nobi-v2/design/`，全程保留，不 staging。
- 读取 Phase 0 审计、资源保护，以及 Phase 0.5 实施、构建、安全、资源报告和 Phase 1 门禁；以实际源码和测试为依据。
- 移动 V2.1 参考存在并查看；SHA-256 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b` 不变。
- **PC 参考 `design/nobi-pc-lobby-reference.png` 缺失。** PC 按三栏文字要求实现，不声称像素级还原。手机遵循参考的深蓝/金色、大卡片、个人信息和五项底部导航；不使用参考图作为背景，不照搬其中的手机 CS 卡片、人物照片、在线人数和积分。
- 按 Sites 的 local-only 开发/预览指引，使用现有 checkout / Vite / Playwright；没有注册托管站点或发布。

## 实现与具体修改文件

| 组 | 文件 / 实际作用 |
| --- | --- |
| 品牌与 Token | `ui/brand.svg`（深色可用代码原生标识）、`ui/tokens.css`、`ui/auth.css` |
| 页面入口 | `index.html`、`login.html`、`register.html`、`game.html`；标题/Logo/PWA 链接统一，保留原表单 ID、处理器与 Auth 数据键 |
| PWA / 原生显示名 | `manifest.json`、`capacitor.config.ts`、`android/app/src/main/res/values/strings.xml`、`ios/App/App/Info.plist`；只改显示名称，不改 Bundle ID/协议 |
| 注册表 | `ui/registry.js`；掼蛋/围棋/CS，稳定 gameId，排序、搜索、平台、启用与模式过滤，复制并冻结配置 |
| 大厅组件 | `ui/lobby.js`、`ui/lobby.css`；共享状态、路由、Header/Sidebar/Card/Profile/Ranking/Audio 等渲染函数，PC 三栏、手机五页，安全区/动态视口/320px 小屏、键盘焦点、减弱动画偏好 |
| 启动协调 | `game.js`；事件式切换取代旧的高频轮询/强制遮罩；原游戏 API 适配、Auth 门禁、退出与查询邀请兼容、移动 CS 深链拒绝 |
| 排名接口 | `ui/rankings.js`；异步 provider，查询/响应校验、加载/错误/空状态、重试、演示标签、过期响应隔离，无积分写入 |
| 音频接口 | `ui/audio-manager.js`、`ui/audio-manifest.js`；三个独立音量域、持久化、首次交互、450ms 渐变、四场景、后台/迟到播放取消及恢复 |
| 游戏最小接入 | `guandan-game.js`：仅音效委托、避免第二个 synth、回合提示及结果/新局场景；`multiplayer-ext.js`：仅音效/结果提示与 shell 邀请协调，没有更改受保护绘制函数或规则 |
| 构建 | `scripts/frontend.mjs`、`scripts/verify-build.mjs`；白名单复制 ui、逐字节校验新组件，仍使用根源码和 dist/web、dist/mobile |
| 单元 | 新 `tests/unit/registry.test.mjs`、`lobby-routing.test.mjs`、`audio-rankings.test.mjs`、`audio-interruption.test.mjs`；扩展 `build-contract.test.mjs`，其他原单元保留 |
| 浏览器 | 新 `tests/browser/lobby.spec.mjs`（6 项）；原 `foundation.spec.mjs` 6 项未删除或改写 |
| 证据 | `docs/nobi-v2/screenshots/phase-1/` 下 6 张实际运行截图及 README |
| 文档 | 本报告、`phase-2-readiness.md`、`audio-resource-inventory.md`、截图 README；更新主 README、build-and-test-guide、resource-integrity-report、test-results |

未引入 Vue/TypeScript 全量迁移或新依赖；未改 `www/`、原卡图、基线 manifest、配置/客户端源、PC adapter、生产 SQL、签名材料、根依赖和 lock、main / 发布 workflow。

## 产品行为与兼容

PC：左侧大厅/三个游戏/排名/好友/战绩/设置，顶部搜索/音乐开关/通知/头像，中间 Banner、游戏卡片、单机与联机启动、扩展占位，右侧真实 Auth 信息或明确访客、段位占位、个人排名、排名预览和好友入口。CS 调用既有 adapter；下载地址与协议保持原值，不执行安装脚本或改服务器。

手机：首页/游戏/排行/好友/我的；个人页可进入音乐/设置/战绩/通知。目录、导航、搜索、query/hash 深链和启动协调均经过平台过滤；App 无 `pc/` 适配器。PC 窄屏不因宽度改变业务能力。底栏固定、安全区留白、页面可纵向滚动；320/360/390px 检查无水平滚动。手机首页不继承游戏页的无结果搜索。

掼蛋卡片复用原 PNG；白底衬托透明图片，未修改图片字节/颜色/比例。围棋卡片是 CSS 入口视觉，不是替代棋盘；进入游戏仍为原木纹 Canvas、原黑白棋子和落子逻辑。旧游戏 DOM 保留为引擎宿主，不创建第二套发布页面。

`game.html` 及旧 room 查询入口保留。旧 `launchMatchGame`、`backToCentralLobby`、`renderAppCentralLobby` 等兼容接口继续可用；NET 先确认 Auth，失败不隐藏大厅。邀请现在由 shell 统一调度，避免围棋初始化重复处理另一游戏的房间。真实多用户邀请/数据库仍 NOT VERIFIED。

新增游戏注册后目录和布局自动扩展；未知游戏使用通用封面，不误用 CS。**实际运行新引擎仍需提供启动适配器**；未接入时明确提示“游戏引擎尚未就绪”，不会误启动围棋。

排名默认空状态（不是隐蔽的模拟积分）。provider 可由未来批准的 Supabase 接口替换；测试中的演示数据明确标记，产品默认没有模拟玩家。不信任可自改 metadata.rank 作分数，不新增数据库表/迁移/RPC。

音频：`lobby/guandan/go/result`；music/effects/prompt 三个域；`nobi.audio.v1` 与现有 Auth 键隔离，登出不清设置。首次真实指针/键盘交互解锁，播放失败可恢复；visibility/pagehide 停止声音，pageshow 恢复；迟到音乐和音效 Promise 不能在中断后复活。跨场景音乐渐变使用合成 Audio 单元夹具验证，**没有真实 BGM 的听感或设备验收证据**。既有 MP3 在 Edge 中实际请求并成功接受 play，非耳听/真机验收。见[资源清单](audio-resource-inventory.md)。

## 实际验收

环境：Windows、Node 24.19.0、npm 11.17.0、Edge 153.0.4234.48。测试服务 5173/4173/4174/4175 实际启动并访问，结束关闭；远端 CI 未触发。

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm test` | PASS / 0，11 文件、55 用例，原 38 + 新 17 |
| `NOBI_BROWSER_CHANNEL=msedge`，`npm run test:browser` | PASS / 0，2 文件、12 用例，原 6 + 新 6 |
| `npm run build` | PASS / 0，真实 dist/web |
| `npm run build:app` | PASS / 0，真实 mobile 构建 + Android/iOS/Web copy；非 APK/IPA |
| `npm run verify:assets` | PASS / 0，56 PNG SHA-256、7 围棋区域 |
| `npm run verify:build` | PASS / 0，两套产物：图片、音效、引擎、UI、页面路径与敏感材料守卫 |
| `npm run verify:mobile-assets` | PASS / 0，Android/iOS public 对应产物，PC adapter 不进入 App |
| PC CS / Android+iPhone UA / mobile artifact | PASS，真实 CS 安装/协议执行 NOT RUN |
| 音频设置刷新、自动播放错误、跨场景/中断、回合域 | PASS，实际 BGM/电话/耳机/原生音频 NOT RUN |
| 注册表配置扩展、手机搜索/目录/深链、320px、键盘 | PASS |
| git diff --check / staged --check / staged-material guard | PASS，每组提交前检查；签名文件未 staging |
| `npm run check:security` | FAIL / 1，既存私钥/签名容器暴露，不是新引入也未被掩盖 |
| Android APK/真机、iOS Xcode/IPA、Safari、安装后 PWA | NOT RUN，Windows/工具链与设备限制 |
| 上海 Supabase Auth/RPC/RLS/真实联机/真实积分 | NOT VERIFIED，没有生产连接或 SQL 变更 |
| 生产部署、Pages 线上缓存、远端 CI | NOT RUN，没有触发 |

原 6 浏览器用例继续验证 56 原图 HTTP/自然尺寸、SDK、Pages 子路径登录/注册、匿名 NET 门禁、PC/App 隔离、27 张手牌、真正落子像素变化及手机横竖屏棋盘边界。围棋 844×390 下仍完整显示，约 `x=331,y=196,size=182`，受保护风格未改。

本轮失败如实保留：新增浏览器文件曾有参数对象括号语法错误，测试发现阶段 FAIL，修正语法后完整运行；收尾加入的手机搜索返回首页断言先 FAIL（期望 2 张卡，收到 0），仅修 route 的手机首页 query 状态后重跑。没有删除失败断言、替换资源哈希或伪造设备结果。

## 截图与提交

[实际页面截图画廊](screenshots/phase-1/README.md)包含 PC 1440×1000 全页面及手机 390×844 视口截图。来源是 Playwright 访问 dist 产物，不是设计稿、AI 生成图或拼接截图；已经逐张查看。首次截图发现透明牌面在暗底难读、首页过高，修正底衬/布局并重新生成证据。

| 提交组 | SHA / 提交前已验证 |
| --- | --- |
| Nobi 品牌与平台注册表 | `fd132ddc448c5c1427ee2273049cba72df813df1`，40 单元 / 6 Edge，build/copy/assets/staged guard |
| 共享 PC / 手机大厅 | `1748eba1d827319d41d270a7b7947c7359a2c923`，43 单元 / 10 Edge，同样门禁 |
| 音频与排名 provider | `bb8d6e8f04145256dce0fefc743f7588c38e2895`，55 单元 / 12 Edge，同样门禁与复制后资源 |
| 收尾回归、PWA 与文档 | 最终 SHA 在交付回复提供，避免文档自引用 hash |

最终 main 仍为 `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。无 push/merge/部署/SQL/撤销/历史重写。应仅保留开始时已有未跟踪参考图，不覆盖用户内容。

## 仍存风险与 Phase 2

本地大厅可验收，但视觉尚未获得用户正式确认，PC 缺参考；无授权 BGM，好友/通知/排名/历史无真实服务。原规则整盘、多局、所有变体和生产多人、防作弊/私密手牌/断线仍未全面验收。生产 Auth 与 profile/房间 Schema/RPC/RLS 仍需授权只读证据，不从 Mock 通过推断兼容。

签名暴露与 Phase 0.5 记录的旧 CLI 依赖漏洞未处置，本轮未重跑在线依赖 audit；不能以阶段 UI 完成批准发布。App 硬件返回键、WebView/Safari、DPR/横屏、电话/耳机音频、原生构建签名与 PWA 安装未验收。生产旧 SW/cache/入口升级与回退策略尚未验证。

建议 Phase 2 先做用户视觉验收与隔离测试环境的 Auth/联机契约和可信结算设计，同时建立 Android/Mac 真机路径、授权 BGM 清单和人工签名处置审批。详见[Phase 2 启动条件](phase-2-readiness.md)；不自动启动下一阶段或修改生产。
