# Nobi 游戏 V2.0 — Phase 0.5 完成报告

日期：2026-10-10（Asia/Shanghai）；目录 `D:\project\go-game-app`；分支 `feature/nobi-games-v2`；起点 `0a69034665d128f64408f0da5883a6239f7fe0bd`。

已读取全部 11 个 Phase 0 文件：README、acceptance、architecture、asset-manifest、asset-protection、checks、development-plan、phase-0-audit、risks、supabase-audit、test-results，并核实实际源码。完成的是本地工程与回归基础，**不是生产发布验收**。

## 交付结论

原 56 张 PNG 和 7 个围棋木纹/棋子渲染片段 PASS，未修改资源基线。Web/App 真实构建、Capacitor copy、复制后资源核验 PASS；Vitest 7 文件 / 38 用例和 Windows Edge Playwright 6 用例 PASS。统一配置/客户端和仓库 SQL 资料参数契约已对齐；生产 Supabase NOT VERIFIED。签名材料暴露和旧依赖审计仍 FAIL，原生编译/真机 NOT RUN。

Phase 1 可启动隔离的 UI、Mock 排名与音频设置开发；生产上线、可信联机排名和签名分发 NO-GO。详见 [启动门禁](phase-1-readiness.md)、[构建指南](build-and-test-guide.md)、[资源完整性](resource-integrity-report.md) 和 [安全发现](security-findings.md)。

## 修改的具体文件

| 组 | 文件 |
| --- | --- |
| 工程 | `package.json`、`capacitor.config.ts`、`tooling/package.json`、`tooling/package-lock.json`、`tooling/sdk-entry.js`、`scripts/frontend.mjs` |
| 守卫 | `scripts/verify-assets.mjs`、`scripts/verify-build.mjs`、`scripts/verify-mobile-assets.mjs` |
| 配置/鉴权 | `config.js`、`supabaseClient.js`、`scripts/public-config.mjs`、`.env.example`、`scripts/supabase-readonly-validation.sql` |
| 页面/平台 | `index.html`、`login.html`、`register.html`、`game.html`、`manifest.json`、`game.js`、`platform.js`、`pc/cs16-adapter.js` |
| 游戏修复 | `multiplayer-ext.js`、`guandan-game.js`、`guandan-mp-ext.js` |
| 安全/CI | `.gitignore`、`scripts/security-audit.mjs`、`.github/workflows/deploy.yml`、`.github/workflows/foundation.yml` |
| 测试配置 | `vitest.config.mjs`、`playwright.config.mjs` |
| 单元/回归 | `tests/unit/legacy-harness.mjs`、`assets.test.mjs`、`build-contract.test.mjs`、`config-platform.test.mjs`、`game-core.test.mjs`、`network.test.mjs`、`regressions.test.mjs`、`security.test.mjs`（以上均位于 tests/unit）；`tests/browser/foundation.spec.mjs` |
| 原生模板 | `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` |
| 文档 | 本报告、build-and-test-guide、security-findings、resource-integrity-report、phase-1-readiness，及 README/test-results 更新 |

未修改牌面、Phase 0 manifest、旧 www、现有根 lock/1,793 个已跟踪依赖文件、生产 SQL 或历史签名材料。生成目录不提交。用户未跟踪设计图保留，未 staging。

## 修复前后与证据

| 修复前实际问题 | 最小处理 | 回归证据 |
| --- | --- | --- |
| build 只 echo；www 过期且缺掼蛋/图片/音效 | 根 HTML/脚本为唯一输入；白名单多入口 Vite 构建双产物；SDK 本地 bundle；Capacitor 使用 dist/mobile | 实际 HTTP、build/copy/产物校验 |
| 缺牌图时生成简化 SVG 替代原牌 | 移除替代绘制，标记缺图；守卫阻止缺失进入产物 | formatCard、原 PNG 哈希与自然尺寸 |
| 围棋新局保留 captures=5/7 和 ko=(2,2) | 重置计数/劫点；断开旧房间并忽略晚到落子 | 先失败的新局与旧频道用例 |
| 收到 total=1 后又加 captured.length，变 2 | 总数替换，缺总数才增量；重复消息不改计数；先校验消息 | 实际 channel callback 和去重 |
| 越界 row=19 抛 TypeError | 坐标、颜色、提子列表与非负计数边界校验 | 越界/提子/自杀/棋局状态 |
| AI 探测污染真实 board/counters/ko | 探测后恢复快照，仅最后提交一次 | AI 提子回归 |
| 844×390 横屏棋盘 bottom≈554.8，裁切 | 按已占顶部空间约束尺寸，增加 viewport resize 监听 | 保留完整可见断言；修复后 bottom=378；原绘制哈希不变 |
| GD PLAY_CARDS/PASS_TURN 未定义；手牌写入无效全局变量 | 真实 handler 桥接原引擎；复用 108 牌生成器，手牌写 GD.state；旋转本地 seat=0；校验序号/轮次/归属 | 双上下文手牌/轮次、真实订阅处理器、重复与伪造消息 |
| 网络仍本地发牌/计时自动出牌、普通 AI 乱参与 | 网络不启动本地发牌/时限操作，仅 host 管 bot；退出清理 | 网络动作与单机浏览器回归 |
| 可越轮次出牌、打不存在的牌、无 trick 也 pass | 原函数增加当前玩家/真实手牌/重复牌/有桌面牌检查 | 非法动作先 FAIL 后 PASS |
| 33/44/55 连对及部分三带两误判顺子 | 仅给顺子/同花顺增加点数唯一条件 | 原误判失败，常见牌型与非法重复点数用例 |
| CONFIG 不被读取、重复客户端、资料 p_id/schema 错位 | 配置 ready/singleton；显式 public/game；RPC player_id；Auth 身份取代临时 UID | 配置/单客户端/Auth/资料契约 |
| logout 清空所有本地设置 | 仅清业务会话、Auth signOut | 真实 handler 的 Mock signOut/设置保留 PASS；真实端到端 NOT VERIFIED |
| PC 实现及入口混入移动 | 独立 PC adapter；移动 gate；App 不复制实现 | PC 保留、Android UA/native 隔离 |
| Android 模板断言错误包名 | 修正为真实 cn.obsmd.gogame | 静态契约先 FAIL 后 PASS；设备 NOT RUN |
| Pages 上传整个根目录、无密钥忽略规则 | 上传 dist/web、发布白名单、ignore/staged guard | 产物守卫、本地 HTTP 不泄露材料 |

核心规则没有重写；单元 harness 只在内存注入测试钩子，执行真实旧脚本。Mock channel 回归不代表生产多人联机或防作弊已经通过。

## Supabase 核验边界

统一默认 public Auth/Realtime 客户端；围棋表明确 `game.game_rooms`，资料明确 `public.get_player_profile({player_id})`，参数与仓库 SQL 一致。昵称/段位 metadata 可自改，不能作可信成绩。

仓库 SQL 定义 waiting_room/game_sessions/moves，却不定义前端使用的 game_rooms；所需字段含 code、black_id、white_id、board_state、next_turn、black_captures、white_captures、status。PC profiles/users 表与启动 API 亦未在当前 SQL/实际后端证实；历史 www 的 matches/handle_surrender 不用于产物。没有据此擅自创建或改名生产表。

已提供只读 catalog SQL（只读事务、SELECT、ROLLBACK），本轮未连接生产或执行脚本。实际 Schema 暴露、RPC EXECUTE、RLS、房间创建/加入/同步、Realtime、真实 Auth 与资料获取全部 NOT VERIFIED，不能从 mock PASS 推断生产一致。

## 实际测试与构建结果

| 命令 / 项目 | 结果 |
| --- | --- |
| tooling 独立安装 | PASS / 0；未重装根依赖 |
| npm run dev / preview | PASS；测试实际启动并访问，结束关闭 |
| npm run build / build:mobile | PASS / 0；实际 dist/web 与 dist/mobile |
| npm run build:app | PASS / 0；移动构建与 Android/iOS/Web copy |
| npm test | PASS / 0；7 文件、38 用例 |
| NOBI_BROWSER_CHANNEL=msedge，npm run test:browser | PASS / 0；6 用例；Edge 153.0.4234.48；Pages 子路径、落子、手机横竖屏 |
| npm run verify:assets | PASS / 0；56 PNG、7 渲染片段 |
| npm run verify:build | PASS / 0；两套路径/图片/音效/脚本与发布守卫 |
| npx cap copy android / ios | PASS / 0；仅资源复制 |
| npm run verify:mobile-assets | PASS / 0；原生 public 图片/音效/脚本与 config |
| git diff --check / --cached --check | PASS / 0；新文件尾随空白已修正 |
| security-audit.mjs --staged | PASS / 0；不新增敏感材料 |
| npm run check:security | FAIL / 1；既有私钥暴露尚未处置 |
| npm audit --prefix tooling --audit-level=high | PASS / 0，0 已报告漏洞 |
| 根 npm audit --omit=optional --audit-level=high | FAIL / 1，4 个：3 high / 1 critical；未强制升级 |
| Android Gradle unit 尝试 | 命令 FAIL / 1，wrapper 下载 timeout=10000ms；JUnit NOT RUN；SDK 缺失 |
| APK/IPA、真机触控/音频、iOS Xcode | NOT RUN |
| 生产 Supabase、真实多人/CS 协议、线上 Pages/远端 CI | NOT VERIFIED / NOT RUN；无生产变更 |

完整命令见构建指南。初轮 12 测试为 6 PASS/6 FAIL，复现计数/ko、越界、缺 handler、CONFIG 与替代 SVG；后续非法动作、旧频道、无效消息、错误包名、牌型、横屏边界也先失败再修复。失败用例未删除。HTML 注释被误算资源引用的问题已修复；图片检查等待实际加载，未放宽自然尺寸断言。Chromium 下载停滞后停止，未伪称安装成功；Edge 结果单独记录。

## 影响与仍存风险

单机掼蛋发牌/常见牌型与围棋落子/提子/AI 有回归，原资源和风格保持。PC 协议/下载保留但未安装或执行 BAT/VBS；移动没有入口。没有开始新大厅、BGM、音量设置或排行榜实现。

尚未验证整盘、所有掼蛋变体、贡牌/升级、多局同步、私密手牌、丢包恢复、服务端结算；围棋简化劫/终局、并发占座、写入错误和权限机制仍有风险。横屏旧顶部布局占空间较多，Phase 1 可优化容器但不能改绘制风格。历史 sw.js 不进入新产物（原页未注册），生产旧 worker/cache 状态 NOT VERIFIED；未来批准发布须评估升级/回退。未修成实际后端的 src Express/Mongoose 示例不构建、不发布。

## Git 与保留范围

工程基础提交：`30749fd7ded3145950058772d0aaf957dc68fa74`。

游戏修复/回归提交：`7f01d6252cb2050fff86d60f9f57702babbc5647`。

补充鉴权回归提交：`fa0fd2985205d05a389b9358baf7804981606907`。

文档独立提交，最终 SHA 在交付回复提供，避免自引用 hash。main 保持 `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。没有 push、merge、force push、生产部署、数据库迁移、签名处置或历史删除。最终 tracked 工作区应干净，仅保留开始时已有的未跟踪设计图。
