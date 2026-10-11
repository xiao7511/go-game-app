# 掼蛋移动横屏布局修正验收

日期：2026-10-11。工作分支：feature/nobi-games-v2。增量基线：8c7dbd0701defc10c13dbd16fcd443f02a26f030。

本次只调整横屏牌桌呈现和尺寸变化后的入屏位置，保留 guandan-standard-v1、双副牌 108 实例、每人 27 张及现有服务端联机协议。参考为 [设计原图](design/nobi-mobile-v21-reference.png) 中第⑥张。没有修改大厅、围棋绘图或原始扑克资源。

## 实现和实际比例

比例以 .gd-arena 布局层为基准，不包含联机房间页外部账号栏、房间栏和退出操作。

- 仅在宽度不超过 1023px、高度不超过 600px 的横屏应用新布局；正常 PC 1440×900、1280×800 使用既有布局。
- 中央可用区域高 28%，宽 34%，最大宽 310px。移除横屏大号空场字样、外框和底色，把当前轮提示、出牌者与实际牌面紧凑成组；空场文字紧接提示。
- 顶部对家区域约 13%，显示姓名、剩余张数和 3～5 张既有 PNG 背牌。两侧区域各占 14% 宽，与中间区分开。南家信息独立留在手牌左边。
- 底部按钮保持至少 44×44px；按钮与手牌间隔 8px。牌面按原图 222:323 比例和可用高度计算尺寸，再按实际牌数计算重叠步长；选择、实例 ID、确认出牌与服务端命令未改动。
- 临时提示收在左侧玩家下方，避免盖住操作按钮和手牌。设置、聊天和返回继续收在右边。
- 联机页在横屏尺寸变化后重新定位到牌桌，防止旧滚动位置裁掉顶部玩家。测试在隔离 Auth 标记完成后才登录。

下表来自真实浏览器布局测量，详细原始数值见 [测量 JSON](guandan-landscape-layout-metrics.json)。比较前样式取自增量基线的 ui/match.css，在真实页面中通过浏览器路由加载；无新尺寸变量时，手牌仍使用此前尺寸。比较图不是对历史截图的编辑。

| 844×390 横屏项目 | 调整前 | 调整后 |
| --- | ---: | ---: |
| 中间区域宽 | 422px（50%） | 287px（34%） |
| 中间区域高 | 93.6px（24%） | 109.2px（28%） |
| 中间区域边界面积 | 约 39,497px² | 约 31,332px²，减少约 20.7% |
| 顶部玩家层高 | 44px | 50.7px（13%） |
| 左右信息卡尺寸 | 106×44px | 118×52px |
| 南家信息卡尺寸 | 106×44px | 118×58px |
| 单张手牌可见高度 | 90.2px | 101.0px（25.9%） |
| 首张手牌横向起点 | 145.9px | 138.2px |

568×320 小屏中央宽由 284px 降至 193px，边界面积减少约 13.5%；顶部由 36px 增至 41.6px，并恢复背牌。手牌起点由 122px 移至约 100px，可见牌面高由 78.6px 增至 83.0px。

比例口径与偏差：此前实际中央 CSS 高为 24%/22%，本次按指定范围设为 28%，因此高度没有下降；中央的缩小来自宽度、总面积和移除空白面板。建议中的底部 22%～26% 本次落实为完整牌面可见高度约 26%。包含按钮、选牌抬升和间隔的整个底部操作组，在 844×390 为 46.0%、568×320 为 50.4%，没有宣称整个操作组满足 22%～26%。这是为保留 44px 触控按钮、完整 PNG 比例和更突出的 27 张牌作出的空间取舍。

## 修改文件

| 文件 | 用途 |
| --- | --- |
| ui/match.css | 手机横屏三层比例、座位、中心提示、手牌与辅助工具布局 |
| guandan-game.js | layoutHand 读取横屏牌宽配置，按 PNG 比例适配可用手牌高度 |
| ui/online.js | 横屏尺寸变化后重新对齐嵌入牌桌 |
| tests/browser/guandan-visual.spec.mjs | 顶部/中央/左右比例、牌高、无覆盖、理牌实例保留、实际出牌边界和截图 |
| tests/guandan-browser/standard.spec.mjs | 真实联机比例与入屏断言、纯牌桌实拍、隔离 Auth 就绪等待 |
| 本报告、测量 JSON 与 screenshots/guandan-landscape-adjustment/ | 验收记录和真实截图 |

## 本次验证

所有浏览器为实际 Microsoft Edge，使用手机尺寸/触控模拟；不代表实体 Android/iPhone 测试。

| 检查 | 本次结果 | 证据日志（项目内隔离目录） |
| --- | --- | --- |
| 单元测试 | PASS，125/125，18 文件 | .nobi-isolated/phase3d/logs/landscape-unit-delivery.log |
| 全页面 Edge 回归 | PASS，23/23 | .nobi-isolated/phase3d/logs/landscape-pages-accepted.log |
| 原有真实联机 4 项 | PASS，4/4 | .nobi-isolated/phase3d/logs/landscape-online4.log |
| 原有真实竞技 2 项 | PASS，2/2 | .nobi-isolated/phase3d/logs/landscape-rated2.log |
| 真实四人连续两副牌 | PASS，1/1，完成两副 | .nobi-isolated/phase3d/logs/landscape-series-delivery.log |
| 56 原始 PNG 哈希、7 围棋源渲染基线 | PASS，56/56 + 7/7 | .nobi-isolated/phase3d/logs/landscape-assets-final.log |
| Web / Mobile 构建及资源验证 | PASS，两种构建各 56 牌面 / 5 音效 | landscape-build-web-delivery.log / landscape-build-mobile-delivery.log |

连续两副牌测试覆盖四个独立 Auth 账号、四个隔离浏览器上下文，108 个唯一实例、4×27 手牌、实际连续拖选、同花色同点数双实例点选及确认出牌、完整自然终局、四游、可信积分结算、下一副牌、进贡/还贡，以及进贡阶段服务重启恢复。同时检查 844×390、568×320、1280×800，完整 27 张牌无出界，四人信息及出牌/按钮无覆盖。

本次未重新运行此前 37 组独立 SQL/API 集成检查，服务端、规则及数据库迁移无新增改动；此前结果保留在 Phase 3D 报告。本次未构建或发布 Android/iOS，也未做实体设备验证。

修正过程中保留失败记录：一次临时提示断言把整条操作容器的空白边距当作按钮，已改为检查真实按钮边界；一次连续对局测试在隔离 Auth 初始化完成前点击登录，已增加实际环境就绪等待；另一次竖屏截图的出牌后临时气泡等待超时，已把等待移到建议牌确认出牌前，保留消退检查并在全部尺寸重跑通过。最终仅以上表实际重跑结果作为本次验收。

## 实际截图

截图直接来自实际运行页面，没有重绘、替换牌面或对截图进行修图。

- [真实联机：27 张牌、重复物理实例独立选中](screenshots/guandan-landscape-adjustment/online/table-mobile-landscape.png)
- [真实联机：小屏完整牌桌](screenshots/guandan-landscape-adjustment/online/table-small-landscape.png)
- [横屏实际出牌状态](screenshots/guandan-landscape-adjustment/mobile-landscape-played.png)
- [小屏实际出牌状态](screenshots/guandan-landscape-adjustment/small-landscape-played.png)
- [联机进贡状态](screenshots/guandan-landscape-adjustment/online/tribute-mobile.png)
- [第二副牌可信终局](screenshots/guandan-landscape-adjustment/online/second-hand-result.png)
- [PC 回归截图](screenshots/guandan-landscape-adjustment/pc.png)
- [竖屏回归截图](screenshots/guandan-landscape-adjustment/mobile-portrait.png)

参考原图 SHA-256：d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b。所有原始 PNG 与围棋基线另由资产验证核对。

## 本地 Git 交付

原工作目录仍在 feature/nobi-games-v2；当前权限配置把原仓库 .git 设为只读，未尝试绕过限制。本次增量提交在已有本地隔离 Git 副本 .nobi-isolated/phase3d/commit-worktree 的同名分支追加，不修改已有六次提交。提交 SHA、文件清单、源码/截图与提交树一致性核验及 bundle 哈希记录在 .nobi-isolated/phase3d/guandan-landscape-delivery.json，并在最终回复给出。

未访问生产数据库、推送远程、合并 main、重写历史或撤销证书。
