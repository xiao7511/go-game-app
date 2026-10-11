# 掼蛋 V2.1 牌桌视觉优化

2026-10-10。在 `feature/nobi-games-v2` 上，根据用户现有 `design/nobi-mobile-v21-reference.png` 底部横屏掼蛋牌桌优化真实页面。参考图可读取；其扑克、头像、积分不是新增素材来源，不将整图作为背景。

## 视觉与实现

- 深海蓝外围 / 信息面板，绿色桌面与细金棕桌沿，圆角长桌替代原来的大椭圆边框。
- 玩家区增加圆形昵称首字标识及金色当前回合高亮；仅展示已有姓名、剩牌，不捏造头像、等级、积分或局数。
- 左上分层显示真实级牌和本局完游人数（明确“非积分”），顶部品牌，右侧独立设置 / 聊天工具栏及返回入口。
- 操作顺序为“不出 / 提示 / 出牌 / 理牌 / 取消”，蓝色辅助、金色主操作、绿色理牌，焦点 / 禁用 / 选中状态保留。
- 横屏自己的座位移动到左下，手牌留出独立宽度，避免与西家或手牌重叠；保持全部 27 张初始手牌可见，原图比例 `222:323`。
- 568×320 小屏将牌宽调为54 CSS像素（只调整页面显示，未改图片文件），缩小手牌容器、上移对家和回合提示，避免出牌区覆盖按钮。
- 对手牌背直接使用原 `images/cards/back.png`；最多7张装饰牌背不代表实际张数，真实剩牌数在玩家信息中显示。
- 竖屏保留可操作布局及显式横屏 / 全屏建议，不强制旋转、不自动全屏。

改动：`guandan-game.js` 仅壳层 DOM、座位 / 空状态展示和手牌显示尺寸；`ui/match.css` 仅掼蛋样式。`tests/browser/guandan-visual.spec.mjs` 新增4个尺寸的回归；`tests/browser/match.spec.mjs` 支持截图输出目录，保留原断言。`.gitignore` 忽略完整复测的临时截图，原 Phase 2 截图不覆盖。

围棋样式 / 绘制、掼蛋牌型与出牌校验、AI、联机协议、Auth、生产配置及签名材料未修改。

## 实际截图

以下为本地构建产物在 Edge 中的实际运行截图，不是参考图或合成图。点击“提示”后等待提示文字自然消失，随机发牌可能造成牌序差异。

| 页面 | 截图 |
| --- | --- |
| 手机横屏 844×390 | [mobile-landscape.png](screenshots/guandan-v21/mobile-landscape.png) |
| 小屏横屏 568×320 | [small-landscape.png](screenshots/guandan-v21/small-landscape.png) |
| 竖屏备用 390×844 | [mobile-portrait.png](screenshots/guandan-v21/mobile-portrait.png) |
| PC 1440×900 | [pc.png](screenshots/guandan-v21/pc.png) |

## 验证记录

首次新增4项浏览器检查：3 PASS / 1 FAIL，小屏出牌区与操作条交叠。保留失败断言，调整小屏布局后重跑，并补充真实出牌后的牌面 / 按钮遮挡检查；没有删减用例接受错误。

最终门禁：

| 验证 | 实际结果 |
| --- | --- |
| `npm test` | PASS / 0，62 项，13 文件 |
| `npm run test:browser`（Edge） | PASS / 0，22 项，含原18项及新增4项，完整运行5.7分钟 |
| `npm run build` / `npm run build:app` | PASS / 0，Web / mobile 真实产物及 Android / iOS / Web Capacitor copy；不是 APK / IPA 编译 |
| `npm run verify:assets` | PASS / 0，56张扑克原PNG、7个原围棋渲染区域不变 |
| `npm run verify:build` / `npm run verify:mobile-assets` | PASS / 0，新UI进入正确输出，原生public资源完整且无PC专用adapter |
| `git diff --check` | PASS / 0 |

PC、844×390、568×320、390×844 四张截图均逐张查看。测试包含四座不重叠、27张原PNG与比例、手牌与自己的座位不交叠、44px按钮与选中手牌不交叠、工具栏与东家分开、真实出牌之后牌面与按钮不交叠、设置开启 / 关闭和取消选牌。视觉参考已读取，不声称逐像素还原或物理设备验收通过。

复测命令（只有已有5178服务通过源码哈希核验时才启用reuse；未停止用户服务）：

```powershell
npm run build
npm run build:app
npm test
npm run verify:assets
npm run verify:mobile-assets
$env:NOBI_BROWSER_CHANNEL='msedge'
$env:NOBI_REUSE_DEV_SERVER='1'
$env:NOBI_SCREENSHOT_DIR='docs/nobi-v2/screenshots/guandan-v21/regression'
$env:NOBI_MATCH_SCREENSHOT_DIR='docs/nobi-v2/screenshots/guandan-v21/regression'
npm run test:browser
git diff --check
```

物理设备、WebView / Safari、真实联机 NOT RUN，本次不改变 Phase 2 已记录的隔离联机 / 原生工具链 / 签名与依赖安全发布阻断。按 Sites local-only 流程复用既有工程与实际截图做视觉复核，没有注册托管项目、部署或接触生产数据库。
