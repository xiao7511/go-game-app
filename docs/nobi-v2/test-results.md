# 测试与验证记录

## Phase 2 正式指令最终复测（2026-10-10）

Windows、Node24.19.0、Edge154.0.4258.62：单元13文件66/66 PASS；Edge4文件23/23 PASS，59.4秒。原Phase1的55/12完整保留，起点已有62/22；本轮新增4单元与1Edge，覆盖围棋预览、旋转、整轮悔棋、提子/劫点恢复、AI取消、终局输入保护和认输。Web/App网页构建、cap copy、verify:assets/build/mobile-assets PASS（56 PNG/7围棋区域/5音效）。

完整回归曾发现新增data属性与预览标记冲突而隐藏body，导致旧大厅门禁/入口FAIL；改独立状态属性和棋盘内查询后完整重跑23项通过，没有删改原断言。首次reuse5178无服务被拒绝，最终自动启动本地服务。

test:isolated BLOCKED/2，守卫零请求；真实联机NOT VERIFIED。check:security FAIL/1，既存签名暴露保留。Gradle新尝试开始下载8.0.2-all，但窗口内未完成，主动中止/1，JUnit/APK NOT RUN；本次并非历史10s读取超时。缺SDK34、JAVA_HOME已变JDK21、adb无设备；IPA/真机/Safari/云构建NOT RUN。详见[最新报告](phase-2-report.md)，下方历史数字保留。

## Phase 2（2026-10-10）

完整记录见 [Phase 2 报告](phase-2-report.md)，历史断言保留，未改资源清单。

| 项目 | 结果 |
| --- | --- |
| npm test | PASS / 0，13文件 / 62项（原Phase1的55 + 端口1 + 本阶段6） |
| test:browser，Edge | PASS / 0，3文件 / 18项（原12 + 新6），触控tap/drag/cancel/防误出、手机五页、DPR2/旋转、棋谱/音频 |
| build / build:app / verify:assets / verify:build / verify:mobile-assets | PASS / 0；Web/mobile、Android/iOS copy、56 PNG / 7渲染区域 / 5音效 / 新match组件 |
| test:isolated | BLOCKED / 2，守卫拒绝缺隔离配置，零网络请求；真实Auth/Schema/RLS/多人/重连恢复未执行 |
| Android Gradle unit + assembleDebug尝试 | FAIL / 1，wrapper8.0.2下载10000ms读取超时；JUnit/APK步骤NOT RUN；SDK34缺失、无设备 |
| iOS/Xcode/Pods/Simulator/设备/Safari | NOT RUN |
| check:security / 根audit --omit=optional | FAIL / 1；历史私钥/容器与3 high / 1 critical，未扩大/修复依赖 |
| 云构建/签名/生产数据库/推送/部署 | NOT RUN |

失败未掩盖：中间match模块缺失构建被守卫拦截；5178已有服务默认拒绝后仅哈希核实显式复用；拖选先FAIL（0张）；横屏退局底栏hidden先FAIL；围棋退局延迟AI回调先FAIL（退后2子而非1子）。修复后保留断言完整重跑。真实[截图](screenshots/phase-2/README.md)已查看，原phase-1图未覆盖。

## Phase 1（2026-10-10）

原测试未删除。[交付报告](phase-1-report.md)记录实现、失败复现和核验边界。

| 项目 | 结果 |
| --- | --- |
| npm test | PASS / 0，11 文件 / 55 项（原 38 + 新 17） |
| npm run test:browser，Edge | PASS / 0，2 文件 / 12 项（原 6 + 新 6）；真实截图写入 docs |
| build / build:app | PASS / 0，Web/mobile 与 Android/iOS/Web copy |
| verify:assets / verify:build / verify:mobile-assets | PASS / 0，56 PNG / 7 围棋区域 / 5 音效 / 新 UI 文件 / 两原生 public |
| 注册表扩展 / 手机目录、搜索、query/hash / PC CS | PASS；真实 CS 安装及联机 NOT RUN |
| 音频持久化、音量域、autoplay、迟到播放、中断、游戏委托 | PASS；Edge 实际 MP3 play 接受；BGM/设备听感 NOT RUN |
| 排名 provider、演示标签、错误重试、键盘、小屏 320/360/390px | PASS，产品默认无真实/模拟积分 |
| git diff --check / staged guard | PASS，未新增敏感材料 |
| check:security | FAIL / 1，既存 CRITICAL 私钥与 HIGH 签名容器暴露 |
| APK/IPA/Xcode/设备、Safari、PWA 安装 | NOT RUN |
| 生产 Supabase/可信结算/真实多人 | NOT VERIFIED，未访问生产或执行 SQL |
| 线上 Pages/远端 CI/部署 | NOT RUN，未触发 |

失败记录：新 UI 测试文件一处参数对象语法错误导致发现阶段 FAIL，修正后完整测试通过；手机搜索“CS”后返回首页的新增断言先 FAIL（0 而不是 2 张卡），修正手机首页 query 状态并保留断言。原 6 浏览器文件不改动，图片与棋盘断言不放宽。音乐 crossfade 使用合成 Audio/时钟测试，并非真实 BGM 或原生设备证据。

每次代码提交门禁：品牌 40/6、大厅 43/10、音频 55/12；build/copy/assets/diff/staged guard 同时执行。最终交付再次完整运行；详情与 Commit 见报告及最终回复。以下历史阶段结果保留。

## Phase 0.5（2026-10-10）

本节是后续真实结果，不覆盖下方 Phase 0 的失败证据。详见 [完成报告](phase-05-foundation-report.md) 和 [运行指南](build-and-test-guide.md)。

| 项目 | 结果 |
| --- | --- |
| Vitest，npm test | PASS / 0，7 文件 / 38 用例 |
| Playwright，NOBI_BROWSER_CHANNEL=msedge | PASS / 0，6 用例，Edge 153.0.4234.48 |
| build / build:mobile / build:app | PASS / 0，实际产物与 copy |
| dev / preview | PASS，测试服务真实 HTTP 访问后关闭 |
| verify:assets | PASS / 0，56 PNG、7 围棋片段 |
| verify:build / verify:mobile-assets | PASS / 0，两套构建及两原生 public |
| diff --check / 暂存材料 guard | PASS / 0 |
| check:security | FAIL / 1，既存私钥/容器暴露未处置 |
| tooling 完整 npm audit | PASS / 0，0 已报告漏洞 |
| 根 npm audit --omit=optional | FAIL / 1，3 high / 1 critical |
| Android Gradle unit | 命令 FAIL / 1，wrapper 10000ms 下载超时；JUnit NOT RUN |
| iOS/Xcode、APK/IPA/真机/实际音效 | NOT RUN |
| 生产 Schema/Auth/RLS/RPC/真实联机/CS 协议 | NOT VERIFIED |
| 远端 CI/Pages/生产部署 | NOT RUN，未触发 |

原失败测试未删除；新增牌型和横屏失败也保留断言后最小修复。Chromium 下载停滞已停止，不伪称成功；使用 Edge 完成实际浏览器验证。图片加载测试从 DOM 即时检查改为等待实际图片加载完成，仍检查原路径与自然尺寸。

以下是原 Phase 0 历史记录。

日期：2026-10-10（Asia/Shanghai）。源代码基线 a0bb939dbe3544abb5b99ab7fc500a76b2998e06。本轮既有测试和补充审计检查分别记录；不存在“全部测试通过”的结论。

## 1. 环境

Windows；Node v24.19.0；npm 11.17.0；Java 17.0.12。Capacitor CLI/core/Android/iOS 实装 5.7.8，TypeScript 6.0.3。

本机未发现 Android local.properties/生成 Cordova 插件目录；ANDROID_HOME、ANDROID_SDK_ROOT 未设置；adb 不在 PATH。xcodebuild/pod 不在 PATH，Windows 不能执行 iOS Xcode 构建。本轮不安装 SDK、创建原生发布包或更改依赖。

终端沙箱 helper 最初无法初始化；只读/测试命令在获准的沙箱外执行。apply_patch 写入均限定本仓库 docs，未绕过权限执行生产动作。

## 2. 已有测试与构建

| 命令/项目 | 退出码 | 结果与含义 |
| --- | --- | --- |
| npm test | 1 | Missing script: "test"；没有仓库级测试入口，没有业务用例运行 |
| npm run build | 0 | 输出 'Static site - no build step required'；仅 echo 成功，无 bundle 或资源打包证明 |
| npm ls --depth=0 | 0 | 五个直接依赖均已安装，与锁文件版本一致；不是漏洞扫描 |
| android/gradlew.bat :app:testDebugUnitTest --offline --no-daemon --console=plain | 1 | Wrapper 引导下载超时，没有编译或执行 ExampleUnitTest |
| Android ExampleInstrumentedTest | 未执行 | adb/设备和可用构建条件缺失；其预期包名与真实 appId 不一致 |
| iOS 测试/构建 | 未执行 | 仓库未见 iOS 测试 target；本机无 macOS/Xcode/CocoaPods 工具链 |

Gradle 输出关键证据：

```text
Downloading https://services.gradle.org/distributions/gradle-8.0.2-all.zip
java.io.IOException: Downloading from ... failed: timeout (10000ms)
Caused by: java.net.SocketTimeoutException: Read timed out
```

--offline 控制 Gradle 本体依赖解析，不阻止 Wrapper 在本机没有分发包时先引导下载。此失败是在已获准的沙箱外运行发生，不属于待重新申请权限即可通过的问题。没有改 wrapper 超时、下载安装镜像或反复运行；还存在未配置 SDK/缺生成目录等前置条件，应在下一阶段治理。

Existing ExampleUnitTest 只断言 2+2=4；即使未来通过，也不是游戏规则测试。设备测试断言 com.getcapacitor.app，而 applicationId 已为 cn.obsmd.gogame，修复后方可作为基本安装检查。

没有执行 build:app/cap copy/sync：当前 Web build 不生成资源，且 copied www 不是完整 V2.0 输入；本轮通过静态审查记录问题，不制造可发布原生包。

## 3. 补充语法与资源检查

检查所有 Git 跟踪、非 node_modules 的 JavaScript，每个运行 node --check；HTML 内嵌非空非 src 脚本用 vm.Script 只解析。

- 外部 JS：19 个，18 通过、1 失败。
- 失败：src/scripts/gameLobby.js:2，裸 HTML，SyntaxError: Unexpected token '<'。
- HTML 内嵌脚本：7 个，7 个语法通过。
- 空的根 supabaseClient.js 语法通过，**不证明有正确 export**。
- 解析不会执行 CDN、DOM、裸模块解析、Auth、网络或真实游戏，不是 E2E。

资源从 git show 基线原始 blob 读取 SHA-256；所有 56 原 PNG 与工作区原字节比对一致。保存 66 个文件来源记录（56 PNG、8 个游戏/渲染来源文件、2 张图标参考）及 7 个围棋渲染区域哈希。原始 PNG 的数量、名称和尺寸已核实；不做转码或生成图片。

## 4. 离线运行探针

探针使用假 URL/key、模拟 DOM/计时器/Realtime，不发真实 HTTP/WebSocket。源文件仅在内存 vm 中执行；围棋内部 state 暴露钩子仅注入内存字符串，未修改文件。

| 场景 | 实测结果 | 判断 |
| --- | --- | --- |
| 远程 /get-config 不成功，注入 window.CONFIG | APP_CONFIG URL 空、key_present=false | CI 与 loader 契约不符 |
| 同条件，注入 APP_CONFIG_LOCAL | URL 清洗为 https://example.invalid，key_present=true | loader 支持此变量与 URL 清洗 |
| 掼蛋收到 PLAY_CARDS | ReferenceError: handleNetPlayCards is not defined | 网络动作处理器缺失 |
| 掼蛋收到 PASS_TURN | ReferenceError: handleNetPass is not defined | 网络动作处理器缺失 |
| ROOM_SYNC 分配席位后 GAME_START | 全局手牌 1；GD.state.players 仍为空；网络牌无 kind；renderer/sorter undefined | 网络手牌未接入现有核心；不是完整游戏流程验收 |
| 围棋预置 captures=5/7、koPoint=(2,2)，再 startAIGame | 提子仍为 5/7，劫点仍为 (2,2) | 新局状态重置不完整 |
| 围棋广播白总提子 1，captured 一个黑子 | 白提子数得到 2 | 总数与增量重复累加 |

探针自身完成退出码 0，表示复现过程成功，不表示被审查游戏通过。广播计数后续可能被数据库快照校准，真实表现依赖时序，尚未做双客户端验证。

机器可读证据和原探针代码见 [checks.json](checks.json)。可在根目录只读重跑（不接生产）：

```powershell
$auditChecks = Get-Content -Raw -Encoding UTF8 docs/nobi-v2/checks.json | ConvertFrom-Json
$auditChecks.syntax_probe_script | node
# 预期退出 1：gameLobby.js 仍含裸 HTML。
$auditChecks.runtime_probes.script | node
# 预期退出 0：输出上述已知缺陷的观测结果。
```

## 5. 未验证范围

未运行真实浏览器交互/E2E、围棋双人/掼蛋四人对局、规则全覆盖、实际 Supabase SQL/RLS/RPC/Auth/Realtime、安全区/音量真机、CS API/协议/安装/启动、APK/IPA 构建、性能压测或生产部署。

两张 Gemini 根 PNG 经图像查看确认为图标概念图；没有可用于移动 UI 验收的正式 V2.1 页面映射。围棋尚未建立浏览器截图金样，后续须补录，不能以代码颜色/哈希替代实际视觉回归。

## 6. 提交前后保护验证

本轮提交应满足：

1. git diff a0bb939 --name-only 只列 docs/nobi-v2 下的新增文档/JSON。
2. 原游戏、构建、配置、SQL、PNG、签名材料、node_modules 无改动；main SHA 仍为基线。
3. 56 PNG SHA-256 与清单全部一致；清单 66 个来源的 Git blob 与基线一致。
4. 文档相对链接存在、JSON 可解析、diff --check 无空白错误。
5. 提交父 SHA 为基线，当前分支仍 feature/nobi-games-v2，提交后工作区干净。

最终提交 SHA 在用户交付消息中报告；不把自身 SHA 写入同一提交文件，避免自引用。任何 Git 保护检查失败则停止提交并核查。

本轮提交前最终核查：11 个交付文件、20 个文档相对链接、66 个来源哈希、7 个围棋渲染区域全部通过；56 原 PNG 全部一致。Git 核对原有跟踪文件无变动、main/HEAD 仍为基线，文档内保存的语法/运行探针重跑结果与记录一致。
