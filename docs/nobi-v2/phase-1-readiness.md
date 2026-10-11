# Phase 1 启动门禁与计划

日期：2026-10-10。依据 [Phase 0.5 实测](phase-05-foundation-report.md)，不是上线批准单。

**GO：与生产隔离的本地大厅/UI 开发。NO-GO：生产上线、可信排名结算、签名分发与生产 SQL 变更。**

## 门禁状态

| 门禁 | 状态 |
| --- | --- |
| 56 原 PNG、7 木纹/棋子渲染基线 | PASS |
| 单一源码、真实 Web/mobile 构建、相对 URL | PASS |
| Capacitor copy 与原生资源 | PASS，非原生编译 |
| 单元与浏览器 | PASS：38 + 6 |
| PC/App 功能隔离 | PASS，真实 PC 协议安装 NOT RUN |
| 统一配置/单客户端/资料参数 | PASS，生产契约 NOT VERIFIED |
| V2.1 参考 | 本地已提供并读取；未跟踪原文件保留，纳入 Git 另行确认 |
| 授权 BGM 曲目 | 未提供；5 个音效不能冒充背景音乐 |
| 签名暴露、旧 CLI 漏洞 | FAIL，发布阻断，处置待授权 |
| 生产 RLS/房间/RPC/Realtime/Auth | NOT VERIFIED |
| APK/IPA、设备音频/触控/生命周期 | NOT RUN |

## 下一阶段建议

1. Phase 1A 大厅壳：按 V2.1 参考做深蓝电竞 UI、导航与个人中心容器；建立可扩展 gameId/capability/route/launcher 注册表，同源调用原规则引擎。移动仅掼蛋/围棋，参考图中的 PC 卡片不得变成手机入口。先用可控 Mock 数据，不伪造人数与排名。
2. Phase 1B 音频基础：分音乐、游戏音效、提示音三个音量域；首次交互解锁、前后台/静音/耳机切换、持久化及登出保留。曲目有授权后再入库。本轮不生成或假设已取得 BGM。
3. Phase 1C 排名契约：确认维度/赛季/并列与个人名次；先 Mock UI。DBA 在授权的只读检查与隔离环境确认上海实例，再设计服务端裁决、幂等结算、RLS、索引与审计。客户端广播或自改 metadata.rank 不作为可信分数。
4. Phase 1D 原生验证：配置 Android SDK/Gradle/设备；Mac 完成 Pods/Xcode。旧 Capacitor 升级另开兼容任务，不 audit fix --force；保持 appId，签名所有者确认密钥用途后才允许分发。

本轮没有开始以上实现；下轮需明确启动范围。

## 发布前阻断

- 人工核实私钥/有效证书/Android 签名身份并批准处置；ignore 和白名单不清除历史或线上泄漏。
- 生产只读结果与测试环境必须到位；不能靠仓库 SQL 推断结构或自动迁移。
- 真实多人验证私密手牌、身份、丢包/乱序/断线、多局和服务端结果，才允许可信排名。
- 领域规则与整盘回归补齐；当前测试不是所有掼蛋变体/围棋终局验收。
- 完成原生构建、真机布局/触控/音频；Windows UA 模拟不等于 Safari/Android WebView。
- 批准部署前验证 workflow、域名/API、旧 Service Worker 缓存升级和回退。

## 验收标准

保持既有测试与守卫通过，新增功能补测试，不删除失败断言或更改牌面哈希。原 PNG 名称/字节及木纹/棋子渲染不变。新游戏仅通过注册表扩展，PC/mobile capability 无旁路，旧 URL/query 兼容。无后端的统计明确 Mock，不用设计数字冒充生产排名。

音频有授权记录，音量域互不干扰，刷新保存、后台不重复播放，自动播放受限可恢复。Supabase 使用 Auth 身份与明确 Schema/RPC，批准环境上的创建/加入/同步及权限否定测试通过；生产禁止自动 SQL。Android/iOS 真机逐项 PASS/FAIL，无设备则 NOT RUN。签名与上线另行审批，不强推、不覆盖 main。
