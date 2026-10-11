# Nobi 游戏 V2.0 — Phase 2 交付与隔离验收报告

## 本轮正式指令的最终验收（2026-10-10）

**本地 Web/App 网页功能与资源验收 PASS；真实联机 NOT VERIFIED；APK/IPA 与真机 NOT VERIFIED。** 本轮实际开始于 `6bde9f564aa6e37f83fdbc969bbbcc03d02e3925`，而非 Phase 1 HEAD：已有 Phase 2 界面、隔离工具和报告已提交。本轮保留此前实现，补齐围棋安全交互、更新指定名称截图、重新运行完整验收并创建本地提交。下方此前报告作为历史记录保留；最新测试数量、环境和原生状态以本节为准。

### 设计、起点与保护范围

- 分支 `feature/nobi-games-v2`；开始时跟踪文件干净，仅用户的 `docs/nobi-v2/design/` 未跟踪，保持不提交。
- Phase 1 基线 `4ef36e47e807f88fe3606de88f9341340d493836` 是当前历史祖先，未重置历史。已读取 Phase 1/0.5 报告、Phase 2 readiness、架构、验收、资源保护、风险、音频、构建和隔离说明；实际查看 Phase 1 的全部六张截图。
- V2.1 手机参考 `design/nobi-mobile-v21-reference.png` 存在，已查看，SHA-256 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b` 不变。PC 参考仍缺失。深海蓝、金色品牌与主按钮、统一大卡片、五项导航按现有参考方向复核；不声称像素一致或用户最终视觉验收通过。
- 原 56 张 PNG、资源清单、历史 www、签名文件、根 lock 相对 Phase 1 无差异；7 个围棋渲染片段哈希保持原基线。没有新音乐素材、生产 Supabase 操作、积分结算、发布、推送或 main 合并。

### 实际完成的功能

| 范围 | 当前可运行行为 |
| --- | --- |
| 手机大厅六页 | 首页/游戏/排行/好友/我的/音乐沿用深蓝金色统一组件；紧凑信息、统一比例卡片、44px 操作、底栏和安全区；320/360/390px 及触控横屏回归；移动 CS 入口、深链和适配器禁止 |
| 掼蛋 PC/横屏 | 绿色牌桌、四座标识/昵称/剩牌、级牌/当前回合、双方完游数（明确非积分）、中央出牌、原 PNG 完整手牌；点选/拖选/取消/提示/理牌/出牌/不出、设置/聊天入口；568×320 等尺寸及真实出牌回归 |
| 围棋 PC/手机 | 原木纹与黑白子、正方形棋盘、高 DPI/旋转、自适应外围、棋手/参考用时在棋盘上方，回合/提子与最新落点、设置/本局棋谱、房间/连接信息 |
| 本轮围棋补齐 | 触屏/触控笔先预览交叉点，再明确确认落子；取消、旋转、退局、后台、对手落子取消旧预览。鼠标保留直接点击。预览为独立 DOM 圆环，不改棋子或棋盘绘制函数 |
| 单机悔棋/认输 | 撤回自己及 AI 最近一轮，恢复棋盘、提子、劫点、棋谱与回合；取消待执行 AI。联机悔棋禁用。单机认输确认后结束，停止 AI 和后续操作，切入 result 场景 |
| 音频 | 原 AudioManager 三域开关/音量、持久化、四场景、淡入淡出与中断取消测试保留；对局设置/静音可用。BGM 均无授权曲目，明确空状态，无授权听感或原生中断验收 |
| 隔离联机准备 | 原 SDK smoke、一次性 SQL 夹具、loopback/公开 key/四账号/确认守卫与完整矩阵保留；真实创建/加入/身份/开始/同步/回合/断线/重连/退出/结束均 NOT VERIFIED，mock PASS 不代替真实环境 |
| App 准备 | 单一业务源码构建 dist/web 和 dist/mobile；Android/iOS cap copy 与逐字节守卫通过；原 PNG/围棋代码/AudioManager 完整进入 App，无可用 CS 入口 |

排行榜、好友、聊天、生产成绩仍为明确未接入状态；不捏造积分、段位、在线人数。围棋计时只供参考、棋谱只记录当前页面会话，均不承担裁决或持久化历史。

### 本轮修改文件

`game.html`（信息位置、预览与对局按钮），`multiplayer-ext.js`（触屏预览、单机快照悔棋、认输/终局输入保护），`ui/match.js`（预览与操作桥接），`ui/match.css`（预览圆环/触控按钮/横屏确认区），`scripts/verify-dev-server.mjs`（复用时追加 HTML 与 match 源码哈希检查），`tests/unit/match-ui.test.mjs`（4 项新增），`tests/browser/match.spec.mjs`（1 项新增与指定截图名称）。另更新本报告、测试/构建/资源/工具链记录和截图索引，保存实际 PNG。此前 Phase 2 修改文件见下方历史实施表。

### 本轮真实命令结果

环境：Windows、Node 24.19.0、Edge **154.0.4258.62**。测试自动启动并清理 5178/4173/4174/4175 本地服务；本轮 5178 没有已有服务，因此没有启用 reuse。

| 命令 | 实际结果 |
| --- | --- |
| `npm test` | PASS / 0，13 文件、**66/66**；保留 Phase 1 原 55，起点已有 62，本轮新增 4 |
| `NOBI_BROWSER_CHANNEL=msedge; npm run test:browser` | PASS / 0，4 文件、**23/23**，59.4s；保留原 12 和起点已有 22，本轮新增 1 |
| `npm run build` | PASS / 0，真实 dist/web；经典脚本/public CSS 的 Vite 提示仍存在，复制/哈希/HTTP 已验证 |
| `npm run build:app` | PASS / 0，真实 mobile 构建与 Android/iOS/Web copy，**不等于原生 APK/IPA 编译** |
| `npm run verify:assets` | PASS / 0，56 原 PNG 与 7 围棋渲染基线 |
| `npm run verify:build` / `verify:mobile-assets` | PASS / 0，两构建与两原生 public，56 PNG/5 原音效/共享引擎/UI；App 无 PC adapter |
| `git diff --check`、staged diff 与 `security-audit.mjs --staged` | PASS / 0，明确文件 staging，设计图和签名材料未加入 |
| `npm run test:isolated` | BLOCKED / **2**；缺隔离 URL/key/四测试用户/确认，守卫在请求前拒绝；真实联机 **NOT VERIFIED** |
| `npm run check:security` | FAIL / **1**；既存 RSA 私钥及 PKCS12 容器暴露保留，发布 NO-GO |
| Android Gradle `testDebugUnitTest` + `assembleDebug` | **未完成 / 退出 1**；wrapper 开始下载 8.0.2-all，验证窗口内未完成，主动中止。本次不是“10s读取超时”；历史超时见下方旧记录。JUnit/APK **NOT RUN** |
| SDK/Java/设备复查 | 仅 SDK 36/37.0 和 build-tools 35/36，仍缺 compileSdk 34；JAVA_HOME 已变为 JDK21.0.12.1，需重新核对 Gradle 兼容环境；`adb devices` 空，无真机 |
| iOS Xcode/IPA/Simulator、Safari/WebView/真机音频 | NOT RUN；Windows 资源复制不代表这些验收 |
| Codemagic/云构建/生产 DB/正式发布/远端 CI | NOT RUN；无生产连接、签名材料上传或分支推送 |

单元覆盖了预览不改局面、取消/重复确认、悔棋恢复提子与劫点、取消迟到 AI、整轮撤回、联机禁止悔棋、结束后拒绝操作。新 Edge 用例真实使用 touchscreen，在 DPR2 检查交叉点圆环中心、竖横屏旋转取消、横屏确认按钮、撤回一轮及单机认输。原规则、登录、CS 平台过滤、导航、音频、手牌回归继续执行。围棋实测390×844为366px，844×390为276px正方形，旋转无棋子丢失。

本轮失败保留：首次尝试复用不存在的5178服务被拒绝，改为测试自己启动服务；新增页面状态属性曾与预览标记重名，误将 body 隐藏，完整回归复现旧入口失败。修正状态属性名称并限定棋盘内标记查询后，全量23项通过；没有删除、跳过或放宽原断言。之前专项2项通过不被冒充完整通过。

### 实际截图与 Git 提交

所有指定截图现位于 [phase-2 画廊](screenshots/phase-2/README.md)：`pc-lobby.png`、`mobile-home.png`、`mobile-games.png`、`mobile-rank.png`、`guandan-pc.png`、`guandan-mobile-landscape.png`、`go-pc.png`、`go-mobile.png`。附好友、个人、音乐及围棋预览截图；来自 Playwright 实际访问产物，已查看，原 Phase 1 图未覆盖。旧名称游戏截图保留作历史证据。

| Phase 1 后提交 | SHA |
| --- | --- |
| 端口准备（已存在） | `18a8b33288abb93193601c9d5461266aaf58c002` |
| 手机视觉（已存在） | `8e931136a8959da281d3ef7e45cfb429e1f11611` |
| 掼蛋/围棋 UI（已存在） | `28b4c7c1eec3eac945de07fdff4b888eee64f71b` |
| 音频/隔离准备/工具链记录（已存在） | `1bcd51b156ef35c77472559a0c3a284d4cd7f2ef` |
| 掼蛋 V2.1 复核（已存在） | `6bde9f564aa6e37f83fdbc969bbbcc03d02e3925` |
| 本轮围棋交互/测试/截图 | `f0d75206498b1496c61d86ce6769c8f5477e8686` |
| 本轮最终证据/交付文档 | 最终 SHA 由交付回复提供，避免文档自引用 |

以上均为本地 feature 分支提交，未 push；main 保持 `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。本轮代码提交前完整66/23、构建/复制/哈希和 staged 守卫通过；文档提交复用已验证代码，另核对截图和资源。

### 下一阶段启动条件

1. 用户确认真实截图及 PC 布局，Android/iOS 真机验证安全区、触控、横竖屏、返回与音频中断。
2. 提供隔离 Supabase 和四个一次性账号，执行 [联机矩阵](isolated-multiplayer-guide.md)；生产联机、可信积分、手牌私密性、权限与恢复未验证，不启用竞技结算。
3. 在受控环境完整缓存/核验 Gradle8.0.2分发，补SDK34与匹配JDK、生成插件工程，重试Debug测试与APK；Mac再做无发行签名的iOS构建。详见 [工具链报告](mobile-toolchain-phase-2.md)。
4. 保留 [既有风险清单](risks.md) 与 [安全发现](security-findings.md)。历史签名暴露需身份所有者单独批准处置；旧依赖审计风险未解除，本轮未重跑在线audit。不得把含泄漏历史的仓库推送或上传云构建。
5. 补合法 BGM 授权后才能加入正式音乐曲目；当前无曲目状态是正式实现，不伪报音乐或设备听感通过。

## 此前已提交的 Phase 2 实施记录（历史）

日期：2026-10-10（Asia/Shanghai）。工作区 `D:\project\go-game-app`，分支 `feature/nobi-games-v2`。用户 Phase 1 最终基线 `4ef36e47e807f88fe3606de88f9341340d493836`；实际起点为其后已提交的 5178 端口修复 `18a8b33288abb93193601c9d5461266aaf58c002`，未回退、覆盖或改写历史。

## 交付结论

完成可运行的手机大厅比例优化、PC/手机掼蛋对局 UI、围棋外层布局和棋谱/设置、本地参考用时、游戏音频场景验证及真实运行截图。规则判定与围棋木纹/黑白子绘制保留；56 PNG 与 7 渲染片段哈希基线不改。原有 55 单元及 12 Edge 用例保留，另有上轮端口测试和本阶段新增回归。

**本地 UI / 构建与资源验收可交付；真实联机、原生设备及正式发布不通过阶段门禁。** 未配置隔离 Supabase/四账号，真实联机 BLOCKED；提供只允许一次性本地栈的可执行 SDK/传输 smoke、SQL 夹具与完整前端验收矩阵。未执行生产 SQL、云构建、签名、推送、main 合并或部署。

## 审计与视觉复核

开始时跟踪文件干净，只有用户原有 `docs/nobi-v2/design/` 未跟踪，保留不提交。读取 Phase 1 报告、Phase 2 门禁、截图画廊、Phase 0/0.5 资源保护与测试记录、安全及 Supabase 审计。复用既有 registry、AudioManager、Auth、白名单 Vite/Capacitor 构建、Vitest/Playwright，不新增框架或音乐素材。

移动参考真实可读取，SHA-256 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b`。PC 参考缺失；好友页在该合成参考中没有独立画面。视觉评估依据是深海蓝/金色、紧凑信息卡、两款真实游戏入口、五项固定底栏和个人/排名/音频结构；**不是逐像素还原或用户正式验收通过**。没有拿参考图作背景、复制虚构积分/玩家数/真人头像，也没有带入手机 CS 卡片。

| 手机页面 | 复核 / 修正 |
| --- | --- |
| 首页 | 品牌栏/个人信息收紧，游戏卡高158→136，排名预览在390×844中完整可见，快速开始44px；保留原PNG与CSS棋盘入口视觉 |
| 游戏选择 | 卡高184→164，搜索/启动/更多区域层级明确，无横向溢出 |
| 排名 | 维持参考分类与周期结构，真实服务未接入空状态，不伪造前三名 |
| 好友 | 五项导航一致，提供游戏入口和明确未接入状态，不伪造在线好友 |
| 个人中心 | 实际账号或访客、成绩缺省、战绩/排名/好友/通知/音乐/设置入口；不捏造段位 |
| 全局 | 点击缩放反馈、键盘焦点、切换路由回到顶端、触控横屏延续手机布局、安全区左右/底部与动态视口；320/360/390px与横屏检查 |

按 Sites 技能 local-only 指引进行现有 checkout 的构建和截图视觉复核；未注册托管站点或发布。技能影响的是本地验证流程，不扩展线上操作权限。

## 实际改动文件

| 文件 | 范围 |
| --- | --- |
| `ui/lobby.css`、`ui/lobby.js` | 手机比例、触控横屏布局、反馈及路由滚动；品牌与注册表保留 |
| `game.html` | 保留旧引擎宿主 ID，新增 Go 摘要/设置/棋谱区、加载 match 模块、修正虚假 surrender RPC 文案；wood CSS 不改 |
| `ui/match.css` | 掼蛋绿色牌桌/四座/手牌/操作区与原牌背PNG、围棋居中和手机大棋盘、设置对话框；仅外层视觉 |
| `ui/match.js` | 共用设置/静音/聊天空状态、本地围棋参考用时/棋谱展示；不结算、不新增网络接口 |
| `guandan-game.js` | 原规则/网络API不改，新增有限合法提示、取消、指针连续选牌/键盘、精确222:323布局；全屏改显式操作，沿用原右击提交 |
| `multiplayer-ext.js` | UI快照克隆、本会话落子记录、本地状态文案、退出/新局/结束取消待执行AI回调；7受保护渲染区域不改 |
| `scripts/verify-build.mjs` | 新match模块也必须存在且逐字节匹配，App copy继续验证 |
| `playwright.config.mjs`、`scripts/verify-dev-server.mjs` | 5178已有服务仅显式opt-in并核对5个源码SHA后复用；默认仍不复用，不停止用户进程 |
| `tests/browser/lobby.spec.mjs` | 仅允许截图目录重定向，原6断言保留，旧phase-1截图不覆盖 |
| `tests/browser/match.spec.mjs` | 新6项：触控/拖选/取消/防误出、PC牌桌、五页、围棋DPR/旋转/棋谱、场景/静音 |
| `tests/unit/match-ui.test.mjs` | 新4项：参考时钟、有限提示、快照/新局、退出AI延迟回调 |
| `scripts/isolated-env.mjs`、`scripts/isolated-supabase-check.mjs`、`scripts/isolated-supabase-fixture.sql` | 本地隔离确认、URL/key/account守卫和待执行契约/传输 smoke / 一次性SQL夹具 |
| `tests/unit/isolated-env.test.mjs` | 新2项：拒绝生产/端口/凭据/server key/缺测试身份 |
| `package.json`、`.gitignore` | 新 `test:isolated` 命令和一次性服务状态忽略项；依赖及lock不变 |
| `docs/nobi-v2/` | 本报告、隔离指南、移动工具链报告、截图README/实际PNG；更新构建指南、安全/资源/测试记录、索引 |

没有修改图片、asset-manifest、www历史副本、GD_MP协议、PC adapter地址/启动协议、Auth键、Bundle ID、生产数据库配置或签名文件。

## 游戏与音频行为

掼蛋：中央绿色桌面、四座昵称/剩牌/回合、级牌、牌型、真实完游人数对比（标记“非积分”）、出牌区、27张初始原PNG手牌和44px操作区。手牌步距根据实际可用宽度和张数计算，含安全区；不拉伸或压缩原图片。点选、连续拖选/拖取消、pointercancel恢复、键盘左右/空格/Enter，不在拖动结束时自动出牌；右击沿用旧明确提交行为。提示只搜索已有简单候选并调用原 typeOf/beats 检查，不是完整最优解或规则重写。聊天仅明确空状态，设置复用 AudioManager。取消普通点击/resize的自动全屏，有竖屏建议及显式全屏按钮。

围棋：PC原棋盘居中、两侧信息；手机主要竖屏，390×844棋盘实际约366×366，844×390约276×276，原基线约358.8/182，本轮扩大可用宽高且保持方形。真实点击及AI应手、DPR2、横竖屏回切保留棋局。最新一步沿用原闪烁标记，摘要/棋谱保留真实坐标。本地用时是可见前台时间参考，不用于判负、排名或服务端裁决；棋谱仅当前页面收到的落子，中途加入/丢包可能不完整，不冒充持久化历史或SGF。

音频：四场景仍为 lobby/guandan/go/result，无授权 BGM，因此明示缺省。新增对局内三域设置和“静音全部（保存设置）”；原AudioManager设置/解锁/中断单元及大厅MP3播放回归继续执行，另验证掼蛋→大厅→围棋场景、静音及刷新持久化。没有授权音乐听感、原生来电/耳机/Safari证据。

## 真实测试结果

环境：Windows、Node24.19.0、npm11.17.0、Edge153.0.4234.48。开发5178已被占用，核对响应与当前源码字节一致后用 `NOBI_REUSE_DEV_SERVER=1` 复用；默认不复用未知服务，测试所有的4173/4174/4175在结束后清理，用户5178不停止。

| 命令 / 检查 | 最终结果与边界 |
| --- | --- |
| `npm test` | PASS / 0，13文件 / 62项：Phase1原55 + 端口1 + 本阶段6 |
| `npm run build` | PASS / 0，真实dist/web；保留经典脚本/public CSS提示，文件复制及HTTP验证，不声称全量module打包 |
| `npm run build:app` | PASS / 0，真实mobile构建 + Android/iOS/Web cap copy，不代表APK/IPA |
| `npm run verify:assets` | PASS / 0，56 PNG SHA-256 / 7原围棋渲染区域 |
| `npm run verify:build` / `verify:mobile-assets` | PASS / 0，两套输出/两原生public，牌图、5音效、旧引擎和新UI字节匹配，App无PC adapter |
| `npm run test:browser`（msedge，显式reuse，截图重定向） | PASS / 0，3文件 / 18项：原12 + 新6；实际触控模拟及DPR、旋转、棋谱、音频 |
| `git diff --check` / staged材料守卫 | PASS，提交只选明确文件，无新增签名材料 |
| `npm run test:isolated` | BLOCKED / 2，缺本地URL/key/四账号/明确确认；没有发送网络请求 |
| 隔离SQL/真实Auth/RLS/两人围棋/四人掼蛋/重连恢复 | BLOCKED / NOT RUN；提供搭建与可执行契约/传输脚本，禁止当作通过 |
| Android Gradle unit / assembleDebug尝试 | 命令FAIL / 1，wrapper下载10s读取超时；JUnit / APK步骤NOT RUN；SDK34也缺失 |
| Windows iOS/Xcode/Pods、Simulator、APK/IPA/物理设备、Safari | NOT RUN；copy和Windows Edge模拟不是设备验收 |
| `npm run check:security` | FAIL / 1，既存RSA私钥/PKCS12暴露仍在，未删除/撤销/重写 |
| `npm audit --omit=optional --audit-level=high` | FAIL / 1，3 high / 1 critical（旧根依赖），未升级/执行audit fix |
| Codemagic连接/云构建/签名/部署/生产DB/远端CI | NOT RUN；没有授权触发；云源码及正式发布NO-GO |

可复现本地门禁（已有手动5178仅在同项目哈希匹配时开启reuse；没有服务则不设置该变量）：

```powershell
npm test
npm run build
npm run build:app
npm run verify:assets
npm run verify:build
npm run verify:mobile-assets
$env:NOBI_BROWSER_CHANNEL='msedge'
$env:NOBI_REUSE_DEV_SERVER='1'
$env:NOBI_SCREENSHOT_DIR='docs/nobi-v2/screenshots/phase-2/regression'
npm run test:browser
git diff --check
node scripts/security-audit.mjs --staged
```

### 失败与最小修复证据

- 中间构建曾因 match.js 未创建被路径守卫拒绝，未伪报为成功；补齐模块后重建。
- 浏览器首次因5178已有服务被阻止；加入显式reuse和逐文件SHA核对，未kill服务或使用自动换端口。
- **修复前掼蛋拖选断言FAIL：期望>1张，收到0张。** 保留断言，改统一指针处理；新增真正touch tap/drag/cancel/竖向划动测试，手牌仍27张，只有出牌按钮提交。
- 新横屏退局断言FAIL：底部导航hidden。手机844px原套PC媒体查询；扩展coarse触控布局，不削弱退出断言，完整重跑通过。
- 截图复核发现Toast上下双定位导致大面积遮挡、Go按钮换行；修正Toast高度/定位和触控按钮宽度后重新截图。
- **围棋退出延迟回调测试先FAIL：退局后2枚子，期望只有已下1枚。** 跟踪/取消pending AI timer并检查执行时单机执色，原AI/规则不改；保留测试重跑。
- Android、安全audit失败和隔离BLOCKED保持记录，没有删除失败断言或改资产基线接受差异。

## 截图、提交与风险

[真实运行截图画廊](screenshots/phase-2/README.md)提供PC大厅、手机五页、PC/横屏手机掼蛋、PC/手机围棋及原大厅回归截图；均来自实际产物，已逐张查看。最终用户视觉确认仍待完成，PC参考仍缺。每次重新运行随机发牌/AI可能改变牌序/落点，不等于资源变化。

按功能提交：手机大厅与安全本地验证 `8e931136a8959da281d3ef7e45cfb429e1f11611`；掼蛋/围棋界面与回归 `28b4c7c1eec3eac945de07fdff4b888eee64f71b`；隔离测试基础/文档及工具链阻断证据的最终SHA在交付回复提供，避免本文件自引用自己的hash。未推送任何分支，main未更改。各提交前门禁基于完整工作区执行；这些结果不表示逐个中间提交另做原生或联机验收。

### 下一阶段门禁

1. 用户验收五页及对局截图，补PC参考或明确接受当前三栏/桌面布局；小屏真机安全区验收不能用CSS声明代替。
2. 搭建独立Supabase、四测试账号，执行[隔离指南](isolated-multiplayer-guide.md)全部矩阵；现有全量手牌/伪造UID/无可信恢复、围棋占座与错误处理仍是多人发布阻断。不能把传输重订阅当完整恢复。
3. 补齐SDK34/Gradle/生成插件目录与Mac路径，真实Debug APK、Simulator/设备、触控/旋转/前后台/音频/返回键。见[工具链报告](mobile-toolchain-phase-2.md)。
4. 签名身份所有者批准处置历史泄漏、审核安全源码出口和受控依赖升级；当前安全NO-GO不因ignore/白名单恢复保密性。Codemagic不可上传/clone含秘密的历史来源。
5. 提供合法BGM授权，另行验证实际循环/渐变/中断；可信服务端结算、RLS/并发/负向测试完成前不发布真实排名。

生产迁移、签名分发、云发布、历史重写和证书处置均需新的明确授权，本阶段未执行。
