# 掼蛋牌桌双端最终视觉修正

日期：2026-10-11。分支：feature/nobi-games-v2。增量基线：c5144d52d51bea10a09319aa83ab16705de70caa。规则仍为 guandan-standard-v1。

本轮实际修改原工作目录源码，并用真实 Edge 运行 Web/Mobile 构建页面，逐张对照指定参考图第⑥张。截图直接来自浏览器，没有重绘牌面或修改截图。功能回归与视觉判断分别记录，测试通过不等于用户设计验收通过。

## 工作区保护

原仓库 HEAD 为 43fe74811072366f79ec75f9bd476e6b12be989a，隔离副本 HEAD 为上述增量基线，领先 8 个提交。比较 121 个交付文件：文本统一换行、PNG 按字节比较，没有差异。修改前已备份 122 个未提交及未跟踪文件，逐文件哈希见 [备份清单](../../.nobi-isolated/landscape-round3/backup-2026-10-11T02-22-24-859Z/manifest.json)。既有参考图、上一轮报告和截图、依赖工作区成果均保留。

本环境将原仓库 .git 设为只读。因此代码改动在 D:/project/go-game-app 内完成，提交继续追加到 D:/project/go-game-app/.nobi-isolated/phase3d/commit-worktree 的 feature/nobi-games-v2。没有重置、清理、强制覆盖、修改生产数据库、推送远程或合并 main。

## 实际改动

PC 三个目标尺寸采用独立的内容定位：北家上方中央、东西家围住出牌内容、南家位于手牌左侧。内容区宽度限制为 1400px，座位按内容区定位；木框桌面仍延伸到窗口，座位与手牌位置分别计算。玩家卡增加默认头像、昵称、剩余牌数及出牌中/队伍/已完游状态，使用深蓝卡片和金色高亮。

PC 中心取消可见透明框及空场水印，只保留提示和实际出牌。当前服务端公开出牌按本地座位映射展示：北家在提示上方、南家在提示下方、东西家靠相应方向，并标明座位及昵称。没有从他人私有手牌生成显示内容。

PC 操作组和手牌组成有下边距的底部区域：操作目标为 48px 高，手牌保留上移及描边空间。1920×1080 使用 110×160px 牌面；1600×900、1366×768 使用 90×131px。手机保留此前 54×78.6px、至少约 23px 露出步长的手牌布局，按钮至少 44px；667×375 保留明确的左右浏览入口和固定确认按钮，选牌按物理 ID 保存。

393×852 使用全屏深蓝旋转遮罩，包含品牌、旋转 SVG 图标、指定提示和尝试全屏横屏按钮。全屏及方向锁定逐项检测能力并捕获拒绝；不能锁定时提示手动旋转。横屏由 CSS 自动恢复，监听窗口、方向和 visualViewport 变化重排手牌，不关闭或重新初始化对局。原生 Capacitor 仅在已有可用方向插件时请求锁定，没有安装插件、改原生工程或发布移动包。

## 调整前后测量

完整坐标、源码哈希和实际选牌未裁切检查见 [测量 JSON](guandan-layout-final-metrics.json)。下表为独立牌桌的 CSS 像素，不把 DPR 图片像素误当视口尺寸。

| 视口 | 中心边界：前 → 后 | 中心到按钮组间距：前 → 后 | 单牌：前 → 后 | 新手牌底边距 | 27 张访问 |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 760×220 → 560×190，无可见框 | 328.8 → 32px | 88×128 → 110×160 | 143.6px | 全部在屏内 |
| 1600×900 | 760×207 → 560×190，无可见框 | 214 → 32px | 88×128 → 90×131 | 122px | 全部在屏内 |
| 1366×768 | 683×176.6 → 560×190，无可见框 | 150.7 → 32px | 88×128 → 90×131 | 106.2px | 全部在屏内 |
| 852×393 | 310×110，保持 | 16px，保持 | 54×78.6，保持 | 8px | 全部在屏内 |
| 932×430 | 310×110，保持 | 16px，保持 | 54×78.6，保持 | 8px | 全部在屏内 |
| 667×375 | 277×105，保持 | 16px，保持 | 54×78.6，保持 | 8px | 左右浏览 153px |
| 393×852 | 原拉长桌面 → 旋转遮罩 | 隐藏底层操作 | 隐藏底层手牌 | 不适用 | 旋转后完整恢复 |

1366×768 的无框中心布局容器高度略增，不宣称所有视口中心高度都下降；改善来自移除框、按内容展示和重新组织座位及底部操作关系。PC 西家横坐标分别从 32px 调至 320/160/120px，南家不再靠屏幕边缘；PC 单位玩家卡由约 136×58px 调至至少 176×70px。空场状态仍会比实际出牌状态留白更多。

## 实际截图与人工对照

- PC：[1920×1080](screenshots/guandan-landscape-round3/runtime/delivery-1920.png) / [修改前](screenshots/guandan-landscape-round3/runtime/before-1920.png)；[1600×900](screenshots/guandan-landscape-round3/runtime/delivery-1600.png)；[1366×768](screenshots/guandan-landscape-round3/runtime/delivery-1366.png) / [修改前](screenshots/guandan-landscape-round3/runtime/before-1366.png)。
- 横屏：[852×393](screenshots/guandan-landscape-round3/runtime/delivery-852.png) / [选牌上移](screenshots/guandan-landscape-round3/runtime/delivery-852-selected.png)；[932×430](screenshots/guandan-landscape-round3/runtime/delivery-932.png)；[667×375](screenshots/guandan-landscape-round3/runtime/delivery-667.png) / [选牌上移](screenshots/guandan-landscape-round3/runtime/delivery-667-selected.png)。
- 竖屏：[393×852 旋转遮罩](screenshots/guandan-landscape-round3/runtime/delivery-393.png) / [真实全屏尝试后的手动旋转提示](screenshots/guandan-landscape-round3/runtime/portrait-fullscreen-attempt.png) / [修改前](screenshots/guandan-landscape-round3/runtime/before-393.png)。
- 真实多人：[桌面浏览器完整房间页](screenshots/guandan-landscape-round3/online/27-cards-pc.png)、[PC 北家实际出牌](screenshots/guandan-landscape-round3/online/table-pc-played.png)、[手机南家实际出牌](screenshots/guandan-landscape-round3/online/table-mobile-played.png)、[保持连接的竖屏遮罩](screenshots/guandan-landscape-round3/online/table-portrait-connected.png)。
- 窄屏真实联机：[手牌起点](screenshots/guandan-landscape-round3/online/table-small-landscape.png) / [末端](screenshots/guandan-landscape-round3/online/table-small-landscape-last.png)；[真实进贡](screenshots/guandan-landscape-round3/online/tribute-mobile.png) / [第二局可信终局](screenshots/guandan-landscape-round3/online/second-hand-result.png)。

多人 PC 使用正常桌面 UA、1920×1080 外层视口；在线房间页会保留房间栏，纯桌面 iframe 截图实际约 1896×855。手机联机截图外层为指定手机视口，iframe 受 12px 外层边距影响，CSS 宽度略小；移动 DPR 为 3。独立牌桌截图则严格对应上表指定尺寸。

开发者人工检查了参考图第⑥张及所有七个视口、选牌上移和 PC/手机真实出牌图。围桌关系、无框中心、底部手牌重点及操作组关系已实际改善；竖屏不再展示拉长的横屏桌面。仍存在以下设计差异，未标为视觉验收 PASS：

1. 使用清晰的文字默认头像，尚未还原参考图中的人物头像；牌背仍是受保护原 PNG，其颜色与参考图模拟牌背不同。
2. 深绿桌布与木框采用现有 CSS 表现，没有参考图的三维木质场景和道具。PC 大屏、尤其尚未出牌时，仍保留比手机参考图更多桌布留白。
3. 27 张真实牌面保持原始 PNG 比例，没有复制参考图模拟牌的倾斜透视。667×375 需要浏览，不能同时读清全部 27 张；已验证每个实例均可独立访问、选中和确认。
4. 浏览器触控模拟及能力不足的提示分支已验证；未进行 Android/iOS 实体设备、刘海安全区域或 Capacitor 原生方向锁定验收，不把这些标为 PASS。

## 本轮回归

最终代码的实际结果见 [测试 JSON](guandan-layout-final-test-results.json)，日志位于 .nobi-isolated/landscape-round3/logs/。

| 检查 | 实际结果 | 最终日志 |
| --- | --- | --- |
| 全部单元（保留原 92 项） | PASS：125/125，18 文件 | unit-serial-delivery.log |
| 全部 Edge（保留原 23 项） | PASS：34/34 | edge-delivery.log |
| 原有真实联机及竞技（保留原 6 项） | PASS：4+2 | online4.log、rated2.log |
| 四个真实 Auth/浏览器的连续双副牌对局 | PASS：1/1，完整两局 | standard-online-delivery.log |
| 真实隔离 Supabase（保留原 30 组） | PASS：19+11+7=37 组 | integrations.log |
| 原始扑克及围棋基线 | PASS：56/56、7/7 | assets-delivery.log |
| Web/Mobile 构建及资源 | PASS：各 56 牌面、5 音效 | build-web-verified.log、build-mobile-verified.log |
| 七视口实际拍摄、选牌抬升；真实浏览器全屏拒绝提示 | PASS：全部执行完成 | measured-capture.log、portrait-fullscreen.log |

浏览器检查包含：四家信息、头像、真实 PNG 比例、按钮命中/44px 触控目标、手牌全实例访问、抬升及描边不裁切、页面滚动、多人出牌位置、横竖屏恢复及 JS 异常。原有拖选、取消、理牌、提示、断线、权限、围棋、音频和大厅用例保留。

真实连续对局验证 108 个唯一实例、4×27、两个同花色同点数实例独立选择、真正点击确认对子、四游及升级、进贡还贡、重启恢复和原子团队 Elo。为稳定覆盖重复牌与进贡场景，测试发牌夹具保证重复对和第二局不抗贡；之后所有命令由真实服务端校验。十张牌的拥挤显示用例是渲染夹具，未冒充实际合法竞技炸弹。37 组集成另覆盖旧/新积分隔离、重复结算、并发积分、赛季、权限及私有手牌恢复。

早期失败保留：竖屏捕获工具等待手牌可见，而新遮罩按要求隐藏手牌，已调整为等待 DOM 与 PNG 加载；并行负载下单元一项 VM 100ms 超时，未改安全限制，完整低负载复跑通过。全屏重排曾缺少手牌参数，已修正，并在最终浏览器用例中增加未处理异常检查。中途日志保留，未把失败运行标为 PASS。

## 修改文件

| 文件 | 改动 |
| --- | --- |
| guandan-game.js | 旋转遮罩、能力检测及拒绝提示、玩家状态、座位方向、动态视口重排 |
| ui/match.css | PC 围桌/底部布局、玩家卡、无框出牌内容、专用竖屏遮罩；保留横屏手牌基础 |
| tests/browser/guandan-visual.spec.mjs | 全部目标尺寸、抬升描边空间、按钮命中、页面滚动、异常监听、竖屏恢复 |
| tests/browser/match.spec.mjs | 更新竖屏遮罩预期，保留点击、拖选、取消、围棋及音频回归 |
| tests/guandan-browser/standard.spec.mjs | 真实桌面 UA、多人 PC 出牌、在线旋转保留连接和物理选择 |
| phase-3d-report.md、guandan-layout-final-report.md、测量/测试 JSON、screenshots/guandan-landscape-round3/ | 交付记录及真实截图 |

## Git 与资源保护

参考图 SHA-256：d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b。原始 56 张 PNG、7 项围棋渲染保护区域验证通过，基线清单也校验哈希，没有修改图片、围棋绘制或大厅文件。服务端、数据库迁移、双副牌引擎、规则版本、Elo 和排行榜代码未修改。

提交 SHA、父提交、bundle 哈希、保护检查及逐项结果见 [交付收据](../../.nobi-isolated/landscape-round3/delivery.json) 和最终回复。原仓库 HEAD 保持 43fe74811072366f79ec75f9bd476e6b12be989a，main 保持 a0bb939dbe3544abb5b99ab7fc500a76b2998e06。隔离副本是保留完整索引的最小工作目录，只暂存本轮明确路径，其他缺失文件没有作为删除提交。

本轮没有依赖、私钥或证书操作，既有人工密钥轮换流程继续保留；没有宣称签名密钥已轮换。Phase 4 仍需设计截图验收、实体移动设备验收及原有发布/安全门槛满足。
