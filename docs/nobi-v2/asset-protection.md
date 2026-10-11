# 原始资源保护清单与规则

## 1. 保护对象与核实结果

基线提交：`a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。

`images/cards/` 共 56 张 PNG：52 张标准花色牌、black_joker/red_joker、back/back@2x；另有 .gitkeep。全部逐一从基线 Git blob 与工作区二进制比对，**56/56 字节一致**。

| 分组 | 数量 | 尺寸 | 命名 |
| --- | --- | --- | --- |
| 标准牌 | 52 | 222×323 | 2–10、ace/jack/queen/king × clubs/diamonds/hearts/spades |
| 大小王 | 2 | 222×323 | black_joker.png、red_joker.png |
| 牌背 | 1 | 157×238 | back.png |
| 高清牌背 | 1 | 314×476 | back@2x.png |

[asset-manifest.json](asset-manifest.json)列出每个文件的完整相对路径、Git blob SHA-1、原始字节数、SHA-256、PNG 尺寸与本轮一致性结果。52 张牌不能简化为“保护几个代表样本”。

## 2. 扑克硬规则

- 原始 56 个文件的路径、文件名、二进制内容保持不变；禁止重绘、替换、重压缩、重新编码、调色、裁切、改牌面。
- 产物复制必须逐字节复制原 PNG，不能通过图像优化器重编码；Web/Android/iOS 中所有 54 张正面牌都要能加载。
- 可按容器调整显示尺寸、间距、叠牌、选择偏移，保持牌面内容和比例；不应用会改变牌面外观的全局颜色滤镜。
- 映射保持 S=spades、H=hearts、C=clubs、D=diamonds；A/J/Q/K=ace/jack/queen/king；大王=red_joker、小王=black_joker。
- 牌背文件即使当前 renderer 未引用也继续保护。当前对手牌背部分由 CSS 绘制，不能据此删除原 PNG。
- 原有 onerror SVG 文本牌替代在 `guandan-game.js:746` 已存在，资源缺失会触发它；这是待修风险。下一阶段应让资源缺失可见并重试/报错，不能将 SVG 替代牌面当作通过验收。本轮保持代码。
- 任何“高清化”“统一风格”“AI 生成牌面”“换成 Emoji/文字牌”等做法都不满足要求。

## 3. 围棋视觉不是独立图片

| 位置 | 保护内容 |
| --- | --- |
| game.html:31、www/game.html:27 | --wood-image 木纹 CSS 与配色 |
| multiplayer-ext.js:282 | drawFullBoard：底色、12 条曲线木纹、19×19 网格、九星位 |
| multiplayer-ext.js:448 | drawStone：黑白渐变、半径、阴影、高光 |
| www/multiplayer-ext.js:287、330 | 移动副本原有棋盘/棋子渲染 |
| www/game.js:598 | 旧单机 drawBoard 及黑白棋子 |
| game.html / www/game.html | board-shell 尺寸比例、Canvas 容器与原游戏视觉边界 |

根棋盘底色 #f3c17a；木纹 #8e5a2d/#c8945a；网格/星位 #333；黑子 #555→#111、白子 #fff→#bbb；棋子半径 0.44 个格距。CSS 木框渐变 #8e6337/#6f4827。保留这些原有渲染，不引入新棋盘、霓虹棋子或扁平替代设计。大厅深蓝电竞主题仅作用于大厅和外层导航。

清单还保存 7 个围棋渲染区域的独立 SHA-256。它们是基线原始文本的函数正文/CSS 声明，不含函数前注释；全文件 SHA 是来源记录，**不要求未来整个大厅脚本永远冻结**。若提取模块，原渲染区域应保持原样并通过视觉比对。

## 4. 校验办法

Phase 0 的最终保护门槛是基线到提交仅增加 docs。未来先通过逐文件 PNG 校验，再对产物路径执行同样的 SHA-256；不能只比对源码目录。

在仓库根运行下列 PowerShell 检查，可核对工作区原始 PNG（适用于 Windows PowerShell 5）：

```powershell
$auditManifest = Get-Content -Raw -Encoding UTF8 docs/nobi-v2/asset-manifest.json | ConvertFrom-Json
$auditCards = @($auditManifest.assets | Where-Object { $_.category -eq 'protected-card-png' })
$auditActual = @(Get-ChildItem -LiteralPath images/cards -Filter *.png -File)
if ($auditCards.Count -ne 56 -or $auditActual.Count -ne 56) { throw 'PNG count changed' }
foreach ($auditCard in $auditCards) {
    if (-not (Test-Path -LiteralPath $auditCard.path)) { throw ('Missing: ' + $auditCard.path) }
    $auditHash = (Get-FileHash -LiteralPath $auditCard.path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($auditHash -ne $auditCard.baseline_sha256) { throw ('PNG changed: ' + $auditCard.path) }
}
'56 original card PNG files verified.'
```

渲染区域以基线 Git blob 的 LF 文本提取；工作区可能是 CRLF，比较时先按 Git 属性规范化，不能将换行差异误判为设计变更。JSON 中 `baseline_start_line` 只辅助定位，代码移动后按函数名匹配。

视觉回归至少覆盖空棋盘、黑白子、提子、劫点/落点闪烁、PC 与移动横竖屏，在固定尺寸和 DPR 下对比；本轮没有真实浏览器截图基线，Phase 1 必须补录。哈希能防资源替换，不能发现 CSS 拉伸或牌面隐藏。

## 5. 设计参考图

两个 Gemini PNG 已记录哈希且未修改；经查看都是图标概念图，不是已确认的 Nobi V2.1 移动页面。不能选其中一张作为 UI 正式稿。下一阶段需要把已有正式稿路径、版本和哈希加入设计映射；不重新生成替代效果图。
