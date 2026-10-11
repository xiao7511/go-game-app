# Nobi 游戏 V2.0 — Phase 0 开发基线

## 最新阶段：Phase 2

2026-10-10 已完成移动五页复核、掼蛋/围棋对局界面与交互优化、音频场景和资源验证；62 单元 / 18 Edge、Web/App资源构建复制 PASS。真实联机 BLOCKED，Android wrapper尝试 FAIL、APK/IPA/设备 NOT RUN，历史签名和旧依赖仍阻断发布。实际起点含 5178 端口修复，不回退 Phase 1。

- [Phase 2 报告与文件/测试清单](phase-2-report.md)
- [Phase 2 实际截图](screenshots/phase-2/README.md)
- [掼蛋 V2.1 牌桌视觉优化与最新截图](guandan-v21-ui-update.md)
- [隔离 Supabase 搭建与可执行验证](isolated-multiplayer-guide.md)
- [移动工具链与 Codemagic 接入条件](mobile-toolchain-phase-2.md)

## Phase 1 历史交付

2026-10-10 已交付真实 PC/手机 Nobi 大厅、品牌、平台注册表、排名空状态和音频管理。55 单元 / 12 Edge 测试与 Web/App build/copy/资源守卫 PASS；无授权 BGM/真实积分，设备 NOT RUN，生产 NOT VERIFIED，既存安全风险仍阻断上线。

- [Phase 1 交付报告与修改清单](phase-1-report.md)
- [实际截图画廊](screenshots/phase-1/README.md)
- [音频资源与授权边界](audio-resource-inventory.md)
- [Phase 2 启动条件](phase-2-readiness.md)

## Phase 0.5 历史基线

2026-10-10 已完成本地资源守卫、真实构建、统一配置与必要缺陷回归。38 单元、6 浏览器测试 PASS；原生编译/真机 NOT RUN，生产 Supabase NOT VERIFIED，签名暴露与旧依赖风险仍 FAIL。可启动隔离的 Phase 1 UI 开发，不代表可生产发布。

- [Phase 0.5 完成报告](phase-05-foundation-report.md)
- [构建与测试指南](build-and-test-guide.md)
- [安全发现与密钥管理](security-findings.md)
- [资源完整性报告](resource-integrity-report.md)
- [Phase 1 启动门禁](phase-1-readiness.md)

以下保留 Phase 0 历史记录；当前交付状态以 Phase 2 报告为准，历史失败证据不覆盖。

审计日期：2026-10-10（Asia/Shanghai）。本轮仅审计、验证与规划，不改游戏核心、不执行生产数据库 SQL、不部署。

基线：`feature/nobi-games-v2` / `a0bb939dbe3544abb5b99ab7fc500a76b2998e06`。

## 文档索引

- [完整审计报告](phase-0-audit.md)：项目结构、依赖、三款游戏、平台及发布现状。
- [资源保护规则](asset-protection.md)与[逐文件资源基线](asset-manifest.json)：56 张原始扑克 PNG 和围棋渲染源码。
- [Supabase 与鉴权审查](supabase-audit.md)：仓库结构与调用契约、权限风险及未验证项。
- [统一架构与功能设计](architecture.md)：PC/Android/iOS、大厅、排行榜与音乐。
- [风险清单](risks.md)：按优先级记录证据、影响、处置与验收门槛。
- [开发计划](development-plan.md)：Phase 1 及后续阶段，依赖与回退边界。
- [验收标准](acceptance.md)：资源、功能、平台、权限与发布前条件。
- [测试与验证记录](test-results.md)：实际命令、结果、失败与未执行项。
- [机器可读检查记录](checks.json)：本轮检查结果。

## 必须持续遵守的约束

1. 保留 `images/cards/` 全部原始 PNG；不得重新绘制、替换图片或修改牌面设计。
2. 保留围棋原有木纹、黑白棋子、网格、星位、阴影和游戏风格。
3. PC 保留 CS1.6；Android/iOS 不提供其入口、协议拉起或安装资源。
4. 移动端采用已确认的 Nobi 游戏 V2.1 效果图；正式稿的文件映射尚待补齐，不另行设计替代稿。
5. 大厅采用深蓝电竞风，通过游戏注册表支持扩展。
6. 新增排行榜、个人排名、背景音乐、音量设置；排名必须以可信结果为依据。
7. 继续使用上海腾讯云现有自建 Supabase，不增加 MongoDB 等第二套业务数据库。
8. 不修改生产数据库、不破坏原游戏逻辑、不直接修改 `main`。

## 当前结论

审计交付与可发布性分别验收。现有基线存在移动资源缺失、配置契约漂移、掼蛋联机接口不完整、签名材料入库和测试覆盖不足等问题，不能据此宣称三端可发布。生产 Supabase 的版本、实际表结构及权限尚未验证。

Phase 1 建议先建立资源守卫、单一构建来源、开发环境配置与回归测试，再实施新大厅；核心规则问题应在独立任务中修复并验证。后续阶段需另行启动，本轮不进入实现。
