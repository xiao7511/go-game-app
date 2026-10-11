# 资源完整性报告（Phase 0.5 / Phase 1）

## Phase 2 正式指令复测（2026-10-10）

56原PNG/7受保护围棋区域PASS，Web/mobile/Android/iOS复制后守卫PASS；相对Phase1图片、manifest、www和签名文件无差异。新增预览是独立DOM圆环，未改棋盘/棋子绘制。触屏确认与取消、旋转、单机整轮悔棋在Edge154/DPR2通过；棋盘366px竖屏/276px横屏保持正方形。最新指定截图见[画廊](screenshots/phase-2/README.md)。参考图哈希不变，仍为用户未跟踪文件。

## Phase 2 补充（2026-10-10）

最终 verify:assets PASS / 0：56 原 PNG 和 7 围棋区域哈希匹配；基线manifest未改。Web/mobile、新match组件、Android/iOS public copy后 verify:build / verify:mobile-assets PASS，5音效仍逐字节一致；没有新增BGM。用户参考图SHA不变，仍未跟踪；PC参考缺失。原图片/清单/签名/PC适配器/原生ID配置相对起点无差异。

本阶段只改变容器显示：手牌精确222:323和动态重叠，不拉伸牌图，不应用图像颜色滤镜；对手牌背直接引用原back.png。围棋绘制函数不改，手机390×844实际366px正方形、844×390实际276px，DPR2和旋转回切/落子回归通过。哈希不代替物理设备验收；见[实际截图](screenshots/phase-2/README.md)与[报告](phase-2-report.md)。

## Phase 1 补充（2026-10-10）

`npm run verify:assets` 再次 PASS：56 原 PNG / 7 原木纹棋子渲染区域匹配，清单指纹不改。Web/mobile 构建与 Android/iOS copy 后检查 PASS，新增 ui 组件逐字节匹配源码，原 5 音效不改。原牌图/asset-manifest/PC adapter/签名文件相对 Phase 0.5 无 diff。

大厅卡片直接引用 ace/king/queen/jack 原 PNG，给透明图加白色容器底衬，不重画/调色/重编码原牌；进入引擎仍真实加载 27 张手牌。围棋大厅卡片是入口预览，游戏内原 drawFullBoard/drawStone/--wood-image 原样保护，浏览器真正落子与完整横竖屏检查继续 PASS。

新增 [实际截图](screenshots/phase-1/README.md)，不拿设计图作为页面背景。用户移动参考 SHA-256 仍 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b`，保留未跟踪状态；PC 参考缺失。没有加入新 BGM 或生成牌图。真实设备视觉与声音 NOT RUN。

以下保留 Phase 0.5 原始保护与测试证据。

日期：2026-10-10。没有修改、重绘、替换、重命名或重新压缩原始扑克图片；没有修改围棋木纹或黑白棋子绘制片段。

## 受保护基线

原始提交：`a0bb939dbe3544abb5b99ab7fc500a76b2998e06`；Phase 0 文档提交：`0a69034665d128f64408f0da5883a6239f7fe0bd`。唯一清单是 [asset-manifest.json](asset-manifest.json)，本轮不更新其值来“接受”变更。

清单本身的 SHA-256（LF 规范化文本）：`3218114e9c30252d9d39192aac42e8fc07ef774bdf46d976a54dc03cc08fd011`，已从 Phase 0 提交读取并核对工作区。资源守卫固定此指纹，防止通过修改清单悄悄放行牌面变更。

`scripts/verify-assets.mjs` 递归扫描 `images/cards/` 的 PNG，精确比较大小写敏感路径集合、56 文件数量及每个文件原始字节 SHA-256；新增、缺失、改名、内容变化均退出非零。`.gitkeep` 不是 PNG，不计数。卡面尺寸信息仍见原清单（52 张普通牌、2 张 Joker、2 张牌背）。

围棋保护 7 段：root / www 的 `drawFullBoard`、`drawStone`，www 的 `drawBoard`，以及 root / www HTML 的 `--wood-image`。函数使用 TypeScript AST 唯一定位，CSS 使用唯一声明定位；规范化 CRLF/LF 后核对原始片段哈希。不会因源码行号移动、计数修复、配置更改或新增非渲染代码误报。完整 JS 文件哈希只作历史溯源，不冻结正常开发。

## 实际验证

| 范围 / 命令 | 结果 |
| --- | --- |
| `npm run verify:assets` | PASS：56 PNG / 7 渲染片段全部匹配 |
| `dist/web` / `dist/mobile`，`npm run verify:build` | PASS：两套输出各含 56 原始 PNG、5 个原音效，游戏脚本非空且与源码逐字节一致 |
| Android public / iOS public，`npm run verify:mobile-assets` | PASS：copy 后同样匹配；未包含 PC 适配器 |
| 修改/缺失/新增/改名 PNG 临时夹具 | PASS：四类不一致均被拒绝；没有动原始目录 |
| 清单被改动的夹具 | PASS：拒绝修改基线 |
| 非渲染代码和换行变化 | PASS：不会误报 |
| 浏览器 PNG 请求与自然尺寸 | PASS：原图片加载；未使用生成 SVG 替代 |

构建和测试均运行守卫，失败即停止相应流程。独立验证命令仍可脱离浏览器执行。

## 棋盘尺寸与资源缺失处理

原根目录 `formatCard` 的 onerror 会生成简化 SVG 替代牌面，违反“原图保留”预期。本轮删除替代绘制行为；原 PNG 缺失时保持失败图片并标记 `data-asset-error=missing`、报告错误，由资源守卫阻止这种缺失进入产物，而不是改画另一张牌。

横屏视口测试复现原棋盘裁切：844×390 下边界约 `y=196 + height=358.8 > 390`。仅在 `resizeCanvas` 约束较窄屏幕的剩余视口空间，并补 viewport resize 监听；修复后边界 `x=331,y=196,width=182,height=182`，完整可见。390×844 仍约 358.8px。木纹/19 路网格/黑白棋子函数及 CSS 哈希保持原值，未改牌面或棋子风格。

浏览器检查为 Windows Edge 中模拟手机尺寸与 UA，不是 Android/iOS 真机证据。物理设备 GPU、WebView、Safari、DPR、触控和音效验收尚未完成。

## 设计参考与后续保护

本地新增用户参考 `design/nobi-mobile-v21-reference.png` 已读取，SHA-256 为 `d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b`。它在开始本轮时未跟踪；保留原文件，未将其擅自纳入本轮提交。本轮没有据此实施新大厅或生成图片。

图中 PC 卡片示意不覆盖用户明确约束：Android/iOS 不提供 CS1.6。Phase 1 可用参考确定深蓝 UI 和布局，游戏中的原 PNG 与木纹棋子仍是不可替换的实物基线；统计数字和卡片插画不等于生产数据或实际牌面资源。
