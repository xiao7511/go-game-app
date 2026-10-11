# 掼蛋手机横屏布局：第二轮修正

日期：2026-10-11。分支：feature/nobi-games-v2。增量基线：8a7e21f803b27a03acabfe4e0ad69618236a8020。

本轮直接修改运行页面，按 [参考图](design/nobi-mobile-v21-reference.png) 第⑥张调整四人座位、底部操作组和手牌辨识度。规则仍为 guandan-standard-v1；108 张物理牌、4×27、私有手牌和服务端命令没有改动。

## 开始前审计与备份

原仓库 HEAD 为 43fe74811072366f79ec75f9bd476e6b12be989a，隔离 Git 副本领先 7 个提交。对比这 7 个提交涉及的 79 个交付文件，当前工作区与隔离提交树没有代码差异（文本统一换行后比较，PNG 按字节比较）。

修改前已备份 87 个未提交文件，共 26,064,117 字节，并保存上一轮 bundle。备份和逐文件 SHA-256 位于 [备份清单](../../.nobi-isolated/landscape-round2/backup-2026-10-11T01-31-21-267Z/manifest.json)。本轮完成后再次检查，除本轮明确修改的文件外，备份文件均保持原样。未执行 reset --hard、clean、历史重写或整目录覆盖。

## 页面改动

- 北家位于上方中央，西家和东家位于两侧中部，南家位于手牌左侧。侧边卡使用稳定的 128/140px 宽度，头像 32/36px；昵称允许两行，剩余张数独立显示。长昵称保留完整文本和 title，避免撑大卡片。
- 手机手牌保持一行，单牌 54px 宽，按原 PNG 的 222:323 比例显示。852×393 可以同时看到 27 张；667×375 和 568×320 使用明确的“左右查看手牌”按钮。没有删除、拆分或重新分配任何牌实例。
- 重叠步长按手牌视口宽度计算，手机横屏最低约 23px。小屏宁可提供浏览，也不继续压缩成过窄白条。浏览、理牌和窗口变化保留按物理 ID 存储的选择；取消仍清除整个选择集，包含暂时位于视口外的牌。
- 五个操作按钮保持一组，下移并紧邻手牌，至少 44×44px。左右浏览按钮也为 44×44px，边界处禁用；确认出牌不会随手牌滚走。继续保留点击、触屏拖选、拖选取消、键盘选择和旋转支持。
- 中心只显示轮次提示、出牌者和原 PNG 牌面，没有恢复手机透明大框或空场水印。玩家、实际已出牌和按钮分别检查无重叠；低于 340px 的横屏单独压缩中心高度和已出牌尺寸，保护 568×320 的北家。
- 正常 PC 继续使用原布局。大厅、围棋绘图、联机协议、数据库迁移与原始图片没有修改。

牌面取舍：本轮将手机单牌由约 70×102px 调为 54×78.6px，使可辨识内容露出更多，并将操作组放低。这不是放大每一张 PNG；改善来自更高露出比例、稳定玩家卡宽度和小屏浏览。没有宣称所有屏幕同时显示全部 27 张。

## 实际 CSS 测量

数据取自真实 Edge 中运行的 Web/Mobile 构建页面，完整坐标与修改前对比见 [测量 JSON](guandan-landscape-round2-metrics.json)。以下是独立牌桌视口；真实联机截图另包含房间页和 iframe，嵌入宽度会因外层边距略小。

| 视口 | 左右座位宽 | 单牌宽×高 | 露出步长/比例 | 27 张访问 | 页面横向溢出 |
| --- | ---: | ---: | ---: | --- | --- |
| 852×393 | 140px | 54×78.6px | 24.23px / 44.9% | 全部同时在屏内 | 无 |
| 667×375 | 128px | 54×78.6px | 23px / 42.6% | 左右浏览；滚动范围 153px | 无 |
| 1920×1080 | 原布局 | 88×128px | 44px / 50% | 全部同时在屏内 | 无 |

852×393 的手牌露出比例由约 34.6% 提升至 44.9%；667×375 由约 27.1% 提升至 42.6%。操作组顶部分别由约 212.8/199.5px 下移至 231/213px。南家卡固定宽 128px，不随小屏压缩到 93px。

中心布局边界在 852×393 为 310×110px，在 667×375 为 277×105px。这是承载提示和牌面的无框容器，不是可见的大透明面板；本轮没有把中心边界面积下降作为完成依据。开发者已查看参考图及三个指定视口的实拍，比较围桌位置、实际牌面与按钮关系。设计验收仍以实拍视觉对比为准，不以百分比或测试通过代替用户验收。

## 本次测试结果

全部为实际执行结果，详见 [测试证据 JSON](guandan-landscape-round2-test-results.json)。浏览器为 Microsoft Edge 的真实页面和触控模拟，不代表实体手机测试。

| 检查 | 结果 | 项目内日志 |
| --- | --- | --- |
| 全部单元测试，包含原有 92 项 | PASS：125/125，18 文件 | .nobi-isolated/landscape-round2/logs/units-delivery.log |
| 全页面 Edge，保留原有 23 项 | PASS：30/30 | .nobi-isolated/landscape-round2/logs/edge-delivery.log |
| 原有真实联机 | PASS：4/4 | .nobi-isolated/landscape-round2/logs/online4.log |
| 原有真实竞技/积分 | PASS：2/2 | .nobi-isolated/landscape-round2/logs/rated2.log |
| 四个真实 Auth/浏览器的双副牌连续对局 | PASS：1/1，完成两副 | .nobi-isolated/landscape-round2/logs/standard-online-final.log |
| 隔离 Supabase 私有状态/竞技/双副牌检查 | PASS：19+11+7=37 组 | .nobi-isolated/landscape-round2/integration/ |
| 原始扑克 PNG / 围棋源渲染基线 | PASS：56/56 + 7/7 | .nobi-isolated/landscape-round2/logs/assets-delivery.log |
| Web / Mobile 构建及资源验证 | PASS：各 56 牌面、5 音效 | .nobi-isolated/landscape-round2/logs/build-web-delivery.log、build-mobile-delivery.log |

新增检查包括三个指定视口、窄屏逐一访问全部物理 ID、浏览时保留选牌、理牌与尺寸变化保留选牌，以及 852/667/568 下十张牌的显示边界。十张牌案例是明确的渲染夹具，用于测试拥挤显示，未冒充实际合法竞技出牌。

真实四人连续对局覆盖 108 个唯一实例、4×27、真实连续拖选、同点数同花色双实例点选和确认出牌、四游、升级、两副自然终局、进贡/还贡、进贡阶段服务重启恢复和原子团队 Elo。原有联机和 37 组集成检查另验证权限、断线恢复、结算重试、并发写入、赛季及旧/新规则积分隔离。

失败记录保留：初次浏览按钮继承 pointer-events:none，被桌面拦截，已修复；十张牌夹具过早加载被首次发牌刷新，已等待 27 张就绪；568×320 的中心碰到北家，已增加短屏布局。中途样式变更也触发了源码一致性保护。最终联机复验还发现截图 API 改变外层滚动位置，造成后续真实点击出视口；测试现在在截图前后保存和恢复原滚动位置，并继续检查 iframe 入屏，不使用强制点击。最终重新运行全套 Edge 后 30/30 通过，未将早期失败算作通过。

## 真实截图

没有修图或模拟牌面替换。实际牌面全部读取原始 PNG。

- [852×393：独立牌桌](screenshots/guandan-landscape-round2/runtime/landscape-852.png) / [修改前](screenshots/guandan-landscape-round2/runtime/before-852.png)
- [667×375：独立牌桌、明确浏览控件](screenshots/guandan-landscape-round2/runtime/landscape-667.png) / [修改前](screenshots/guandan-landscape-round2/runtime/before-667.png)
- [1920×1080：PC 实拍](screenshots/guandan-landscape-round2/runtime/landscape-1920.png)
- [852×393 外层：真实四人联机、重复实例选中](screenshots/guandan-landscape-round2/online/table-mobile-landscape.png)
- [真实确认出牌后](screenshots/guandan-landscape-round2/online/table-mobile-played.png)
- [667×375 外层：手牌起点](screenshots/guandan-landscape-round2/online/table-small-landscape.png) / [手牌末端](screenshots/guandan-landscape-round2/online/table-small-landscape-last.png)
- [真实进贡阶段](screenshots/guandan-landscape-round2/online/tribute-mobile.png) / [第二副可信终局](screenshots/guandan-landscape-round2/online/second-hand-result.png)
- [原有 568×320 小屏回归](screenshots/guandan-landscape-round2/baseline/small-landscape-played.png)

参考图 SHA-256：d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b。

原有联机回归的两张新图已归档到本轮 regression-online，旧路径图片按开始前未修改的 Git 状态恢复。后续竞技回归使用独立 regression-rated，未覆盖旧验收图。

## 修改文件清单

| 文件 | 改动 |
| --- | --- |
| guandan-game.js | 手牌视口、左右浏览、步长计算、按实例保留选择、昵称 title |
| ui/match.css | 四人位置、信息卡、手牌/按钮、安全区域、短屏中心 |
| tests/browser/guandan-visual.spec.mjs | 新增指定视口，保留原四尺寸及功能断言 |
| tests/browser/match.spec.mjs | 小屏逐一浏览检查代替强行挤入一屏，保留触控/取消断言 |
| tests/browser/guandan-layout-helpers.mjs | 通过真实控件访问每个实例，检查比例、边界和选择保留 |
| tests/browser/guandan-landscape-interaction.spec.mjs | 窄屏交互与十张牌渲染边界 |
| tests/guandan-browser/standard.spec.mjs | 指定联机视口、浏览、重复实例及真实截图 |
| 本报告、测量/测试 JSON、screenshots/guandan-landscape-round2/ | 实际交付证据 |

## Git 和保护状态

实际提交仓库是 D:/project/go-game-app/.nobi-isolated/phase3d/commit-worktree，分支 feature/nobi-games-v2。本轮在上述增量基线后追加提交；SHA 与 bundle 哈希见 [交付收据](../../.nobi-isolated/landscape-round2/delivery.json) 及最终回复。隔离副本保留完整 Git 索引，工作目录仅存交付文件，并未完整检出旧文件；本轮仅暂存 46 个指定路径，没有把其他缺失文件作为删除提交。原仓库 .git 由当前权限设为只读，原 HEAD 保持 Phase 3C；源文件改动已在原工作目录内完成，未绕过 Git 写保护。

原仓库 main 仍为 a0bb939dbe3544abb5b99ab7fc500a76b2998e06。未修改生产数据库、推送远程、合并 main、强制改写历史或发布 Android/iOS。本轮没有依赖和签名证书操作；既有安全处置记录继续保留，未宣称签名密钥已完成轮换。
