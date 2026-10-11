# 构建、配置与测试指南（Phase 0.5 / Phase 1）

## Phase 2 本地验收补充（2026-10-10）

最新正式验收为66单元 / 23 Edge（Edge154.0.4258.62）。`npm run dev`仍为5178，Web preview为4173，App preview为4174；`ui/match.js/css` 同步进入真实build/copy。截图及限制见[Phase 2 报告](phase-2-report.md)。

浏览器默认拒绝占用端口。如果5178已经是当前项目dev，可先 `npm run build` 更新其白名单stage，再明确设置 `$env:NOBI_REUSE_DEV_SERVER='1'`；配置会对HTML/game/guandan/multiplayer/lobby/match源码响应SHA逐字节核对，不匹配即失败，且不关闭用户服务。不要用该选项复用未知项目或旧源码。其他测试preview端口仍必须空闲；本轮没有已有dev服务，未设置reuse。

```powershell
npm test
npm run build
npm run build:app
npm run verify:assets
npm run verify:build
npm run verify:mobile-assets
$env:NOBI_BROWSER_CHANNEL='msedge'
# 仅已有并已核实的5178服务需要下面的显式复用：
$env:NOBI_REUSE_DEV_SERVER='1'
$env:NOBI_SCREENSHOT_DIR='docs/nobi-v2/screenshots/phase-2/regression'
npm run test:browser
Remove-Item Env:NOBI_BROWSER_CHANNEL,Env:NOBI_REUSE_DEV_SERVER,Env:NOBI_SCREENSHOT_DIR
git diff --check
```

match用例把本阶段游戏/五页截图写入phase-2，原lobby用例通过目录变量保留phase-1历史证据。真实隔离Supabase另看[搭建与smoke说明](isolated-multiplayer-guide.md)；`npm run test:isolated`缺确认/本地公开配置/四测试用户时退出2（BLOCKED），不会发请求。不能通过填生产配置来让它“通过”。

## Phase 1 本地大厅预览补充（2026-10-10）

根源码新增 `ui/` 共享品牌/注册表/大厅/音频/排名组件，同一白名单流程复制并验证。无需新增依赖或全量框架迁移。

```powershell
npm run dev
# http://127.0.0.1:5178/game.html （本地单机与大厅）
# 页面：#/home、#/games、#/rank、#/friends、#/me、#/music
# 停止 dev 后执行最终门禁：
npm run build
npm run build:app
npm test
npm run verify:assets
npm run verify:build
npm run verify:mobile-assets
$env:NOBI_BROWSER_CHANNEL='msedge'
npm run test:browser
Remove-Item Env:NOBI_BROWSER_CHANNEL
git diff --check
node scripts/security-audit.mjs --staged
```

独立 Web 预览：`npm run preview` → `http://127.0.0.1:4173/game.html`；mobile 产物：`node scripts/frontend.mjs preview mobile` → `http://127.0.0.1:4174/game.html`。App 构建无 PC adapter，Web 手机 UA 同样过滤 PC 游戏。不要从项目根目录开启通用静态服务器。

Phase 1 最终 55 单元 / 12 Edge 用例包含原 38 / 6；新 UI 测试生成 [真实截图](screenshots/phase-1/README.md)。后续新增端口契约回归用例，开发服务及浏览器验证统一改为 5178，避免与现有 5173 服务冲突；历史验收报告中的 5173 为当时实际使用的端口。当前测试占用 5178/4173/4174/4175，先停止这些端口的手动验证服务器，不需要停止 5173 服务。Vite 的经典脚本与 CSS public 路径提示仍存在：文件按白名单复制、哈希校验和 HTTP 实测，不改为 module 冒险破坏旧全局引擎。

排行榜默认为未接入，好友/通知/战绩为空状态；没有生产积分写入。所有 BGM 场景为空，开关只保存偏好，试听使用原 MP3。设备/Xcode/签名、真实 Auth/SQL/联机、CS 安装、线上部署仍未验证。见 [Phase 1 报告](phase-1-report.md) 和 [Phase 2 门禁](phase-2-readiness.md)。

5178 端口调整验证（2026-10-10）：`npm test` **PASS，56 项**；`npm run build` **PASS**（保留上述经典脚本/public CSS 提示）；`npm run verify:assets` **PASS，56 张 PNG / 7 项围棋基线**；设置 `NOBI_BROWSER_CHANNEL=msedge` 后执行 `node tooling/node_modules/@playwright/test/cli.js test tests/browser/foundation.spec.mjs` **PASS，6 项**，实际访问 5178 页面与资源，测试服务清理完成、退出码 0；`git diff --check` **PASS**。本次未重新运行另外 6 项大厅 UI 测试或设备验收；未更改游戏代码和生产配置。

以下为保留的 Phase 0.5 基础流程与证据。

日期：2026-10-10。支持当前静态 HTML / 全局脚本，不实施 Vue 迁移。先阅读 [实施报告](phase-05-foundation-report.md) 与 [安全发现](security-findings.md)。

## 环境与安装

本轮实际环境：Windows、Node 24.19.0、npm 11.17.0、Java 17.0.12。新增工具固定版本：Vite 8.3.4、Vitest 5.0.3、Playwright 1.64.0、Supabase JS 2.117.3、esbuild 0.28.2。工具链声明 Node 24；不要使用不满足其 engines 的旧 Node。

工具使用依据：[Vite 官方指南](https://vite.dev/guide/)、[Vitest 官方指南](https://vitest.dev/guide/)、[Playwright 安装与测试说明](https://playwright.dev/docs/intro)、[Supabase 客户端初始化](https://supabase.com/docs/reference/javascript/initializing)。具体版本以本仓库 tooling lock 为准，实际成功与否以本地记录为准。

```powershell
npm ci --prefix tooling --ignore-scripts
```

`tooling/package-lock.json` 是新增工具链锁文件。现有根目录锁文件与 1,793 个已跟踪的 `node_modules` 文件未改动；本轮没有在本地清空、重装或升级这些历史依赖。CI 的临时 checkout 会另执行根目录 `npm ci --ignore-scripts`，不写回仓库。依赖清理和 Capacitor 大版本升级应另开受控任务。

## 唯一源码与产物

根目录 `index.html/login.html/register.html/game.html`、对应游戏脚本、`pc/`、`images/cards/`、`assets/sounds/` 是可信输入。`www/` 只保留历史记录，不作为构建或 Capacitor 输入。`src/` 的旧后端示例、签名材料、SQL、文档、依赖目录不发布。

`scripts/frontend.mjs` 按显式白名单生成 `.nobi-stage/web` 或 `.nobi-stage/mobile`；它们是临时副本，不可手工维护。Vite 处理四个 HTML 入口；原全局脚本字节复制到发布目录，Supabase SDK 独立打包为 `vendor/supabase.js`，无需 CDN。原牌面与音效不压缩、不重绘。构建后自动执行资源/脚本/路径/敏感文件守卫。

```powershell
npm run verify:assets
npm run dev
# 另一个终端，或先停止 dev：
npm run build
npm run preview
```

dev：`http://127.0.0.1:5178/login.html`；preview：`http://127.0.0.1:4173/login.html`。均只监听本机，端口占用直接失败。不要用项目根目录的通用文件服务器，以免暴露私钥。访问 `game.html` 可离线体验单机；联机必须有有效公开配置和 Auth 身份。

`dist/web` 是唯一 Web 发布产物；`dist/mobile` 是唯一 App 网页产物。相对 HTML、图标、牌面、音效路径兼容自定义域根路径、GitHub Pages `/go-game-app/` 和 Capacitor。本轮保留 `CNAME=game.nobistudio.com`。页面 URL 与房间 query 参数不变。

保留经典脚本是有意的兼容策略：Vite 会提示非 `type=module` 脚本不能被打包，但它们通过 public 白名单复制，且由 `verify:build` 与浏览器验证存在、非空、非过期。不能仅凭这些提示认定资源已打包，也不能改成 module 后假定全局行为等价。

## Supabase 公开配置

复制 `.env.example` 为未跟踪的 `.env.local`，填写现有上海实例的 URL 与匿名/公开访问密钥。不要填 service-role、服务端 secret、密码、私钥。开发代码不提供实例迁移或自动建表。

也兼容未跟踪的 `config.local.js` 注入 `window.CONFIG`、`window.LOCAL_CONFIG`、`window.APP_CONFIG_LOCAL`；同名值按上述顺序覆盖。构建只输出两个已校验的公开字段，不原样发布本地 JS。环境变量优先于本地配置。构建 URL/key 必须成对，均为空允许离线开发；已提供的无效/高权限配置使构建失败。

浏览器统一接口：`NobiConfig.ready/get/normalize`；`NobiServices.ready/getClient/requireClient/requireUser/getProfile`。只创建一个默认 public Auth/Realtime 客户端；围棋表访问显式 `.schema('game')`；资料 RPC 显式 `public.get_player_profile({player_id})`。元数据昵称/段位不是可信排名成绩。未配置的 native 不请求不存在的 `/get-config`；Web 的该端点仅作有限时 fallback，GitHub Pages 不执行 Cloudflare Function。

生产结构核验：`scripts/supabase-readonly-validation.sql`，由授权人员在批准的只读连接手动运行。脚本使用只读事务、catalog SELECT、ROLLBACK。本轮未运行；生产 Schema、RPC、RLS、Realtime 和 Auth 会话 **NOT VERIFIED**。不要执行历史 `supabase_schema.sql` 来“修复”未知生产库。

## 自动测试

```powershell
npm test
npm run verify:assets
npm run build
npm run build:mobile
npm run verify:build
node tooling/node_modules/@playwright/test/cli.js install chromium
npm run test:browser
```

本机 Chromium 下载停滞，已停止该下载；实际浏览器验收使用已安装的 Edge 153.0.4234.48：

```powershell
$env:NOBI_BROWSER_CHANNEL='msedge'
npm run test:browser
Remove-Item Env:NOBI_BROWSER_CHANNEL
```

浏览器测试自动启动 dev、Web preview、mobile preview 和 Pages 子路径 preview（5178/4173/4174/4175），结束时关闭服务；不要预先占用这些端口。默认 CI 使用 Chromium，远端 CI 本轮未触发。失败 trace 写到忽略的 `test-results/`。单元测试用 VM 执行真实旧脚本，测试钩子只注入内存，不在产品里暴露规则测试 API；网络测试使用 mock channel，不连接生产 Supabase。

## App 资源复制与原生边界

```powershell
npm run build:app
npm run verify:mobile-assets
```

该流程真实构建 `dist/mobile` 并 `cap copy`，替代历史人工复制。亦可单独 `npx cap copy android` / `npx cap copy ios`；copy 后的原生 public/config 是生成物，不提交。只新增原生插件或修改依赖时才需要另行评估 `cap sync`；iOS sync/Pod/Xcode 必须在 Mac 验证。

PC 适配器只复制到 Web；App 不复制协议、注册表或下载实现。Web 上 Android/iPhone/iPad 与 native 标志也禁止该入口；PC 窄屏不因此被当成手机。共享选择标识仍存在，但不能在移动端拉起 PC 功能。

Android 单元测试尝试：

```powershell
cd android
.\gradlew.bat --offline :app:testDebugUnitTest '-Dorg.gradle.internal.http.connectionTimeout=10000' '-Dorg.gradle.internal.http.socketTimeout=10000'
```

本轮 wrapper 下载超时，命令 FAIL，JUnit 实际 **NOT RUN**；本机亦无 Android SDK。Windows 的 iOS/Xcode、签名、真机音效与生命周期测试 **NOT RUN**。copy PASS 不代表 APK/IPA 构建或真机验收 PASS。

## 提交与安全检查

```powershell
git diff --check
git status
node scripts/security-audit.mjs --staged
npm run check:security
npm audit --prefix tooling --audit-level=high
npm audit --omit=optional --audit-level=high
```

`--staged` 检查 index 内容，不读取或发布历史私钥；签名扩展、私钥头和服务端 secret 会阻止提交。它是补充守卫，不是完整 DLP。`check:security` 对已有入库材料有意返回失败，不能将其改成 PASS 来掩盖风险。仅手工 staging 明确文件；不要 `git add .`，避免带入用户的未跟踪设计图。不要运行历史 `deploy.sh` 或向 main 推送。
