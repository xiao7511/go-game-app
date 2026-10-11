# Phase 0 完整审计报告

## 1. 审计边界与基线

- 仓库：`D:\project\go-game-app`；origin：`https://github.com/xiao7511/go-game-app.git`。
- 审计开始时分支：`feature/nobi-games-v2`。
- HEAD：`a0bb939dbe3544abb5b99ab7fc500a76b2998e06`，提交标题 `Update game.js`。
- 本地 `main` 也指向该基线；本轮不切换或修改它。不将本地检查等同于远端分支状态核验。
- 初始工作区干净。未发现仓库内或已检查的父目录中的 `AGENTS.md`。
- 本轮新增内容全部位于 `docs/nobi-v2/`，包含 Markdown、资源清单与检查证据 JSON。
- 未调用生产 Supabase，未执行 SQL，未注册 CS 协议，未下载或启动游戏，未推送、触发发布或部署。

结论分三级：**已核实**来自文件/哈希/命令；**已复现**来自离线内存探针；**待验证**需要正式设计稿、数据库快照、浏览器或设备。离线探针不能代替真实对局验收。

## 2. 项目结构

```text
/
├─ index.html → login.html → game.html
├─ register.html / config.js / supabaseClient.js / gameService.js
├─ game.js                 大厅、路由、登录态外壳、CS 拉起
├─ multiplayer-ext.js      围棋 Canvas、规则、AI、Supabase 房间
├─ guandan-game.js         掼蛋单机、规则、手牌 PNG 渲染
├─ guandan-mp-ext.js       掼蛋 Realtime 广播与匹配
├─ images/cards/           56 张 PNG + .gitkeep
├─ assets/sounds/          5 个既有按钮/棋盘音效 MP3
├─ www/                    另一套较早的围棋前端，Capacitor webDir
├─ android/ / ios/         Capacitor 原生工程
├─ src/                    未完整接入的 CS Express/Mongoose 示例
├─ functions/get-config.js Cloudflare Pages Function 格式
├─ .github/workflows/      GitHub Pages 发布流程
└─ downloads/              Windows CS BAT/VBS 启动脚本
```

无 React/Vue、Vite/Webpack、统一打包器或仓库级测试框架。项目主要使用传统 script 标签、立即执行函数、全局对象和内嵌/动态注入 CSS。README 仍描述直接打开 index 的简洁围棋；实际入口已有注册登录、多人对局和游戏大厅，运行说明落后。

### 两套前端的差异

| 项目 | 根目录 Web | `www/` 原生输入 |
| --- | --- | --- |
| 大厅 | `game.js` 动态三游戏大厅 | 旧围棋选择页 |
| 掼蛋 | 两个脚本 + 全套 PNG | 无掼蛋脚本、无 `images/cards/` |
| 围棋 | 主要由 `multiplayer-ext.js` 承载 | `game.js` 与扩展均含棋盘逻辑 |
| CS1.6 | 卡片、下载、协议和 API 调用 | 尚无对应实现 |
| 音效 | `assets/sounds/` 存在 | 未复制音效目录 |
| 配置 | 异步 fetch、configReady | 同步配置、无 configReady |
| 客户端封装 | `supabaseClient.js` 为 0 字节 | ESM 懒单例；仍有不兼容调用 |

`build:app` 只执行 echo build 后 cap copy，**不会将根目录同步到 www**。当前移动构建与 Web 不是同一版本，不能以 Web 正常推断原生正常。

## 3. 构建与依赖

根包 `go-game-app-pro@1.0.0`；锁文件与 `npm ls --depth=0` 一致：

| 依赖 | 声明 | 实际锁定 |
| --- | --- | --- |
| @capacitor/cli、core | ^5.7.8 | 5.7.8 |
| @capacitor/android、ios | ^5.7.8 | 5.7.8 |
| typescript | ^6.0.3 | 6.0.3 |

`www/package.json` 的 iOS 声明是 `^5.0.0`，其余大致一致；它不应成为另一套依赖权威来源。Supabase SDK 使用 jsDelivr 的 `@2` CDN 主版本路径，未纳入 npm 依赖和锁文件；断网、CDN 变化会影响登录。

`src/routes/cs16.js` 依赖 express、mongoose，但根依赖未声明这两个包。`src/index.js` 没有创建 app、监听端口、连接数据库或鉴权中间件。`src/scripts/gameLobby.js:2` 是裸 HTML，不是合法 JavaScript。该目录不构成可运行的业务服务，不应以新增 MongoDB 完成它。

当前有 **1,793 个 node_modules 文件被 Git 跟踪**。`.gitignore` 仅对局部配置/env 和 CS ZIP 设置忽略，未忽略根依赖、根签名材料。后续应在独立工程治理提交中处理；本轮不删除或重装。

本机：Windows，Node 24.19.0，npm 11.17.0，Java 17.0.12；无已声明的统一 Node/npm 工具链约束。构建命令能退出成功并不代表游戏资源已打包。

## 4. 掼蛋实现

### 已存在能力

`guandan-game.js` 使用闭包状态并暴露 `GD.state`、init、destroy、startNewRound、initGameMatch。两副牌生成 108 张，四家各 27 张；南北/东西为队友；级牌、红桃级牌、简单牌型判断、升级、AI 应手、20 秒操作计时、三种理牌及移动触摸/全屏已有实现。

`formatCard` 把 S/H/C/D 与 A/J/Q/K 映射为现有 `images/cards/*_of_*.png`，大小王分别使用 red_joker / black_joker。PNG 是当前视觉权威资源，全部原字节保留。

牌型与升级实现是现状记录，不是规则正确性的保证。顺子可接受大于 5 张、万能牌判断较宽、同花顺与炸弹比较不完整等需要规则用例核验；未看到完整进贡/还贡流程。新增大厅不能顺带重写这些规则。

### 联机实现与问题

`guandan-mp-ext.js` 使用 `room_guandan_GDxxxx` 广播信道。房主分席、180 秒匹配补 AI，四人或超时开局；使用 PLAYER_JOIN、ROOM_SYNC、GAME_START、PLAY_CARDS、PASS_TURN。没有对应持久化房间/战绩 SQL。

已离线复现：

1. PLAY_CARDS 回调引用未定义的 `handleNetPlayCards`。
2. PASS_TURN 回调引用未定义的 `handleNetPass`。
3. GAME_START 写入 `window.gdPlayerHand`，没有写入 `GD.state.players[*].hand`；`window.renderGameBoard`、`window.sortHandCards` 在项目中没有定义。
4. 网络牌对象缺少单机渲染/规则需要的 kind、label、value 等信息。

静态发现：本地 UID 与实际 Auth UID 脱节；开始事件给所有订阅者发送四家完整手牌；频道没有显式 private 授权；无服务器规则校验、消息序号/幂等、主机迁移、退出清理和断线恢复契约。客军的数据接入问题不能用隐藏大厅或重复定时器解决。现有联机不能作为可信排行榜来源。

单机入口直接启动本地引擎，普通 NET 入口仅启动网络扩展，未保证创建单机游戏 DOM；邀请路径又先启动单机引擎，存在本地 AI 与网络态并存风险。需在测试环境核验，当前不修复。

## 5. 围棋实现

`multiplayer-ext.js` 承担根目录 19×19 棋盘：Canvas 高清缩放、木纹、九星位、黑白渐变棋子、最新落点闪烁、BFS 计算气/提子、禁自杀、简化劫点、基础 AI、创建/加入房间和认输广播。

资源并非独立木纹图片；木纹在 `drawFullBoard` 与 `game.html --wood-image` 中生成，棋子在 `drawStone` 中生成。详见[资源保护规则](asset-protection.md)。不能将“没有木纹 PNG”理解为可以重设计棋盘。

已离线复现：

- `startAIGame` 清空棋盘但未清提子数和全局 koPoint：预置 5/7 后仍为 5/7，旧劫点仍存在。
- 广播处理先采用总提子数，再处理 captured 增量：单次白提 1 可得到 2；随后数据库快照可能覆盖，因此表现可能短暂或受时序影响。

其他静态风险：AI 用会修改正式棋盘/劫点的 placeStone 搜索；房间加入缺少原子抢位；远端落子缺少完整合法性/边界/发送者验证；数据库写入 error 未检查；board_state、广播与数据库更新没有统一版本；劫点未持久化到房间；订阅整表 UPDATE 再客户端筛选。根目录没有与旧版相同的完整计分/终局契约。

`www/` 仍有另一套围棋引擎、旧双人广播、getSession 校验和 handle_surrender RPC。不可简单把任一套整文件覆盖另一套；先建立行为基线和适配器，再分别修正问题。

## 6. CS1.6 实现

根 `game.js:131` 的 SINGLE 路径为 `cs16://`；NET 调用相对 `/api/games/cs16/launch-config` 并追加昵称。昵称从 profiles/users/auth metadata 逐级获取。该 API 的实际线上 Worker 实现不在仓库，注释中的路由存在不能证明服务已配置。

`downloads/` 是 Windows HKCU 协议 + BAT/VBS + 固定 D 盘目录的拉起方案；会从远程下载脚本/注册表/ZIP，部分直接执行，没有校验散列或签名。仓库 Express 返回的查询参数 URL，与 VBS 接收的 connect/name 路径形式不一致。VBS 默认含服务器连接，即使“单机”入口也可能连服务器；需要专门 Windows 验收。

PC 产品保留 CS 卡片和现有功能。现有能力仅支持 Windows，本轮不能宣称 macOS/Linux 也可拉起。Android/iOS 的大厅、注册表、路由、打包资产均应排除 CS；仅靠 CSS 隐藏或屏宽判断不满足约束。移动 Web 同样建议禁用，详细能力矩阵见[统一架构](architecture.md)。

## 7. Android / iOS / Capacitor

| 配置 | 当前值/现状 |
| --- | --- |
| Capacitor | 5.7.8，appId cn.obsmd.gogame，webDir www |
| 应用名称 | 在线游戏 Pro；尚未应用 Nobi 产品命名 |
| Android | min 22 / compile 34 / target 34；AGP 8.0.0，Gradle 8.0.2，Java 17 |
| Android Activity | 最小 BridgeActivity；INTERNET 权限，无业务插件 |
| Android 生成插件目录 | 本机不存在；settings.gradle 引用了它 |
| Android 本机 SDK | 无 local.properties、无 ANDROID_HOME/ANDROID_SDK_ROOT，adb 不在 PATH |
| Android 测试 | 2+2 模板单测；设备测试仍断言 com.getcapacitor.app |
| iOS | deployment 13.0，Swift 5.0，bundle cn.obsmd.gogame，CocoaPods |
| iOS 方向 | 手机竖屏/左右横屏；iPad 另含倒置竖屏 |
| iOS 生命周期 | 模板 AppDelegate，未接音频暂停或业务恢复 |
| 签名 | 根 ios_development.key 与 my-release-key.jks 已跟踪；前者私钥头已核实 |
| Deep link | Android 只有 launcher intent；iOS Info.plist 无业务 URL types |

后续需要正式设计稿、安全区/横竖屏/返回键/剪贴板/后台恢复验证，以及 macOS 的 iOS 工具链。现有 targetSdk、Capacitor、隐私声明等需在实际发布前按当时官方要求复核；本轮不进行版本升级或商店合规结论。

根目录两个 Gemini PNG 均为品牌图标概念排版，经查看不是移动大厅或游戏界面正式稿。未找到可识别的 Nobi V2.1 移动效果图版本/路径。该缺口阻挡视觉实施验收，不阻挡完成 Phase 0 文档。

## 8. Supabase、鉴权与数据

继续使用用户指定的上海腾讯云自建 Supabase。仓库不含可核验其部署版本、域名、RLS 实际状态的快照，本轮未访问生产；不能把示例 SQL 认定为线上结构。

SQL 声明 waiting_room/game_sessions/moves；主围棋代码使用 game.game_rooms；服务示例使用 matches；profile RPC 的 schema/参数也漂移。排行榜及个人积分存储均不存在。详见[专项审查](supabase-audit.md)。

登录使用邮箱密码，注册把 nickname/rank 写入用户 metadata，sessionStorage 存展示信息。根 game 页面没有完整的启动 session 校验/onAuthStateChange 消费；setLoggedIn 未接入从登录页恢复 UID 的统一流程，邀请会生成临时 UID。应以 Supabase 的认证用户作为唯一身份，显示段位与实际排名分离。

## 9. 发布与缓存

GitHub Pages workflow 自动触发 main push，也允许手动触发；上传 path 为整个仓库。存在将源码、依赖、签名文件带入发布包的风险，应采用产物白名单。本轮不运行 workflow 或 deploy.sh；后者使用 git add .、commit、push，不适合文档限定提交。

CI 生成 `window.CONFIG`，根 loader 读取 `APP_CONFIG_LOCAL/LOCAL_CONFIG`；在远程 /get-config 不可用时，离线复现配置丢失。game/register 未显式加载 config.local.js；GitHub Pages 不执行 Cloudflare Pages Functions。native www 同样没有正确注入本地配置链。

manifest/SW 硬编码 /go-game-app/，与自定义域名根路径/原生 localhost 可能不兼容；根 manifest 引用缺失的 icon-512.png/icon-192.png。仓库未找到 serviceWorker.register，因此当前 SW 文件是否线上注册不能确认。SW 若启用，cache-first 会缓存所有 GET，未排除鉴权/API/实时请求，版本治理不充分。

## 10. 审计收束

可保留的核心：原始 PNG、围棋渲染与规则实现、现有 Windows CS 外部拉起、上海自建 Supabase，以及 Capacitor 三端路线。

首要工程工作：保护守卫与回归、单一资源构建、配置/身份契约、发布白名单、隔离测试环境。新大厅/音频能在这些基础上增量建设；真实排行榜需可信结算，不能直接信任客户端广播或自选段位。

[风险清单](risks.md)、[开发计划](development-plan.md)、[验收标准](acceptance.md)及[测试结果](test-results.md)共同构成下一阶段入口。Phase 0 文档完成不意味着上述缺陷已修复。
