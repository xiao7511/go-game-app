# Phase 0.5 安全发现与密钥管理

## Phase 3C 安全复核（2026-10-10）

下方全部历史风险保留。实际材料扫描仍 FAIL / 1；未修改签名私钥、CSR、容器或历史，没有推送、生产写入、轮换、撤销或正式发布。根 npm audit FAIL / 1：3 high / 1 critical；tooling PASS / 0 漏洞。没有新依赖或 audit fix --force。Android Debug 仅用默认 debug 签名，不能解除 release 阻断。

隔离环境实测全员原子团队 Elo、双方确认围棋数目、结果版本/收据幂等、故障全员回滚、并发 PostgreSQL 结算、普通用户改分/结算/赛季管理拒绝。结果核对私有终局快照及完整成员，参与者具备 Auth 外键。管理员私有 allowlist 不依赖 editable metadata 或前端隐藏。审计和完整手牌不进 REST/Realtime 广播；运行凭据和身份日志保持 ignored，新增提交执行 staged guard。

上述 PASS 仅限 localhost。正式发布继续 NO-GO：身份所有者须核实历史暴露并批准 Apple/Android 换钥；受控升级根依赖；最小权限 DB 连接替换 Docker 操作员桥；核验生产只读契约、公网限流、即时撤销、跨进程所有权/容量及真机生命周期。围棋争议期限/完整赛事劫时钟、掼蛋进贡/系列、弃局刷分政策须另行定版；短局/固定对手信号不能自动封禁。好友只有空接口。不得把本机迁移应用生产或将旧广播胜负接入结算。

## Phase 3A 安全复核（2026-10-10）

已有风险清单全部保留。私钥扫描仍 **FAIL**：原有未加密 RSA 私钥和已跟踪 PKCS12 容器未被处置；未输出私钥、读取/猜测密码、复制签名材料、撤销证书、修改历史或推送。Root npm audit 实测 3 high / 1 critical；tooling 与独立 Supabase CLI 各 0。审计提示修复涉及 Capacitor major 升级，留作受控迁移，未执行 audit fix --force。

本轮新增的防护已实测：隔离容器/卷归属检查、固定 loopback API、随机本地凭据与一次性 Auth 用户、RLS/RPC/Realtime 契约、客户端状态/结果/积分写入拒绝、服务端规则验证与幂等、私密手牌裁剪。真实 Supabase 通过不等于旧浏览器联机路径已完成迁移。权威服务尚未具备持久状态恢复、公开网络抗滥用和原子竞技结算；这些继续阻断生产部署和正式积分启用。

Android Debug APK 已构建并校验原始资源和发布白名单，仅使用 Android 默认 debug 签名；它不消除历史签名风险，也不代表 release/IPA/真机通过。本地 runtime.json、JDK/Gradle 缓存、日志及 APK 均保持 ignored，不进入 Git。所有新增提交运行 staged-material guard。

### 轮换与发布阻断清单

1. 身份所有者先只读确认 Apple 证书是否实际签发、关联应用和分发方式；CSR 与私钥指纹匹配不等于已有有效证书。确认后审批新密钥/CSR、替换证书、旧证书撤销及回退顺序。[Apple 证书撤销说明](https://developer.apple.com/help/account/certificates/revoke-a-certificate/)
2. Android 先区分上传密钥和 App Signing 密钥，再由所有者确认 Play App Signing/其他分发渠道及更新兼容性；上传密钥可按官方重置流程处理，不能自行把发布签名换成 debug 密钥。[Android 签名与上传密钥重置](https://developer.android.com/studio/publish/app-signing)
3. 在所有者完成历史公开范围调查、轮换和已发布产物处置之前，阻断携带现有 Git 历史/签名材料的 GitHub 推送、Codemagic 上传及正式 App 发布。删除历史、撤销和清理线上产物须另行授权，本轮未实施。
4. Capacitor 依赖兼容升级必须有 Android/iOS 构建和设备回归；保持 3 high / 1 critical 风险开放，不能用局部 tooling audit=0 掩盖根依赖风险。
5. 旧广播信任模型、崩溃恢复、可信完整对局协议和积分原子结算未通过前，正式竞技积分与生产联网仍为 NO-GO。生产库权限、线上公开暴露范围和真机音频/生命周期仍 NOT VERIFIED / NOT RUN。

npm run check:security 保持真实退出码 1；新文件 staged guard 和白名单构建通过。安全风险未被移动到“例外”或从旧报告删除。


## Phase 2 发布阻断复核（2026-10-10）

本轮 `check:security` FAIL / 1，仍是既存未加密RSA私钥及PKCS12容器；未打印私钥、读取容器密码、变更材料或Git历史。根 `npm audit --omit=optional --audit-level=high` 实际FAIL / 1，仍3 high / 1 critical，未执行audit fix或扩大依赖。新增文件逐个staging并执行材料守卫，白名单产物校验继续PASS。

正式发布阻断：历史签名暴露处置需身份所有者批准；旧CLI依赖需受控兼容升级；真实Supabase权限/私密手牌/可信裁决/序号恢复/并发仍未验收；设备音频/生命周期及原生构建未通过。Codemagic不能接收含历史秘密的源码或签名；本轮只查官方接入条件，不创建自动触发配置、不连接账户、不上传/推送。

隔离验证脚本不加载生产配置，只允许指定loopback端口、public key、一次性账号及专用标记RPC，默认BLOCKED且零请求。隔离SQL为刻意宽松的旧契约夹具，不是生产迁移或安全策略。详见[隔离指南](isolated-multiplayer-guide.md)及[工具链报告](mobile-toolchain-phase-2.md)。安全NO-GO不能被本地UI和资源测试PASS抵消。

日期：2026-10-10。本轮仅进行本地检查，不输出私钥内容、不猜测密码、不撤销证书、不更改线上配置、不重写历史。

## 已确认的材料类型

| 文件 | 证据 | 状态 / 风险 |
| --- | --- | --- |
| `ios_development.key` | 1,732 字节，Node crypto 无密码即可解析 RSA 私钥 | 未加密且有效的私钥材料；CRITICAL 暴露 |
| `ios_development.csr` | PKCS#10 CSR，签名验证成功；公开 SPKI 指纹与上述私钥相同 | 是申请，不是已签发证书；证书有效期、实际签发及撤销状态 NOT VERIFIED |
| `my-release-key.jks` | 2,758 字节，ASN.1 PFX version 3 / PKCS#7 ContentInfo 结构 | 实际是 PKCS#12/PFX 签名容器，不是 JKS；内部条目、MAC、密码强度及证书有效性 NOT VERIFIED；HIGH |

匹配的**公开密钥** SHA-256 指纹：`4fc8559bb10acc3c4ff847cb242d212c27030cb548ade1253053a1a538c82074`。这不是私钥、密码或 Token。CSR 没有证书有效期；私钥可用来计算签名，不代表 App 签名证书仍有效。没有获得发行平台记录或容器密码，不能断言 Apple / Android 当前签名身份可安全继续使用。

检查命令：`npm run check:security`，退出码 1，**FAIL（既存暴露未消除）**。输出仅包含类型、大小、公开指纹与核验状态。证书/CSR 通常不是秘密，但包含身份资料；本轮守卫一并禁止新增提交，须经审核另存。

## 可能的暴露路径

材料已被 Git 跟踪，可能在 GitHub 仓库、clone、历史提交、备份中留存。历史 GitHub Pages workflow 上传 `path: .`，将仓库根目录当网站产物，存在把私钥、签名容器、SQL、依赖公开的风险。**本轮没有检查或清除现有在线 Pages / Actions artifacts，线上实际暴露情况 NOT VERIFIED。** 新分支里的 workflow 修复尚未部署到生产，不能声称线上已经安全。

最小本地防护已实施：

- `.gitignore` 覆盖私钥、证书、CSR、签名容器、provisioning、环境文件与生成目录；不会取消已跟踪材料。
- 白名单 staging / Vite 发布只输出 Web 或 App 需要的文件；`verifyDistribution` 拒绝签名扩展及明显私钥/服务端 secret 内容。
- Pages workflow 改为上传 `dist/web`，保持 Pages 机制与 CNAME；deploy 仅允许 main。未触发任何部署。
- 新增 `node scripts/security-audit.mjs --staged` 检查 index 内容；本轮只 staging 指定文件，不新增敏感材料。
- Supabase 构建配置只接受公开字段，拒绝 service-role JWT、服务端 secret、生产 HTTP、含凭据的 URL；示例文件不包含实际访问密钥。

白名单与模式守卫并非完整敏感信息扫描：复杂编码、不识别的 Token、恶意源码仍需 code review。现有历史文件不是“安全例外”，只是等待授权处置的已知风险。

## 必须人工确认的处置

1. 由签名身份所有者确认私钥用途、对应证书、App Store Connect / Apple Developer 和 Android 已发布应用的关联。Android 上传密钥、App Signing 密钥和本地 keystore 不能混为一谈。
2. 以只读方式核查 GitHub 仓库权限、历史 Pages 产物和已下载副本；若公开过，按已暴露处理，即使删除当前文件也不能恢复保密性。
3. 确认后制定换钥/撤销/重新签名方案及回退计划。Apple 撤销可能影响现有构建；Android 自签名密钥随意更换可能导致既有安装无法升级。这些操作不在本轮授权范围内。
4. 经明确授权，先将有效材料迁入加密离线存储或专用 Secret 管理，验证备份与恢复，再安排从当前树移除、历史清理或 GitHub artifact 处置。历史重写必须协调所有 clone、分支和发布引用，禁止擅自强推。
5. CI 签名只在批准的发布流程中从 Secret 安全注入临时目录，不写入源码、网页 public 目录、日志或构建报告；结束后按受控流程清理。

本轮三个材料的工作区及 Git 内容均未修改；没有新增签名、撤销证书或改线上 Supabase。

## 依赖与应用安全剩余风险

| 检查 | 本轮结果 | 后续 |
| --- | --- | --- |
| `npm audit --prefix tooling --audit-level=high` | PASS，0 已报告漏洞 | 固定 lock，持续 CI 审查；不等于供应链零风险 |
| 根目录 `npm audit --omit=optional --audit-level=high` | FAIL，4 个：3 high / 1 critical | 旧 Capacitor CLI 链中的 tar、xmldom、brace-expansion 等风险；另开兼容升级任务，不执行 audit fix --force |
| 生产 Supabase Schema/RLS/Realtime/Auth | NOT VERIFIED | 授权人员执行只读核验和测试环境验收 |
| 掼蛋广播 | 本地协议回归 PASS，安全性不可信 | 全量手牌广播、客户端可伪造 UID/动作、无服务端裁决、丢包/断线恢复不足；禁止作为可信排行榜结算来源 |
| 围棋房间 | 本地计数修复 PASS，数据库契约 NOT VERIFIED | 房间占座并发、更新字段权限、结果裁决、写入错误处理仍需受控设计 |
| public 资料 RPC | 前端参数按仓库 SQL 对齐 | SECURITY DEFINER / 默认 EXECUTE、元数据可自改；生产授权及数据暴露 NOT VERIFIED |
| PC 协议启动/远程 BAT/VBS | 仅保留原 PC 功能，未执行 | 外部包来源/完整性、实际协议安装与服务端 API 未验收 |

旧 `src/scripts/gameLobby.js` 混入 HTML、示例后端依赖/契约不完整，未作为当前构建来源；旧 `www/` 客户端与 SQL 不兼容的代码亦不发布。不能拿它们来宣称全项目已可上线。

既存私钥暴露和旧依赖风险是发布 NO-GO，不应阻止与生产隔离的本地 UI / 测试基础工作。详见 [Phase 1 门禁](phase-1-readiness.md)。

## Phase 3B 补充（2026-10-10）

原 CRITICAL RSA 私钥、HIGH 签名容器及根依赖 3 high / 1 critical 均仍存在；只核验元数据，没有输出私钥、索取密码、修改历史、撤销证书或推送。正式发布维持 NO-GO。签名所有者需核实暴露范围及已签发证书、批准新密钥/证书和 Android 应用签名迁移策略，再在授权范围处置历史与 CI Secret；CSR 不是证书，不能据其推断有效期/撤销状态。

本地新增私有 Schema 未暴露给 REST/Realtime，普通玩家不能读写全手牌、收据、可信结果或积分。提交守卫增加 `.nobi-isolated/` 和 `.nobi-stage/` 拦截；手工测试密码及运行时 JWT/DB Secret 均保持 ignored。客户端仅携带公开 anon 配置和本人的真实 Auth Session。

Phase 3C 上线前还需要：最小权限 DB 连接替换 Docker 操作员桥、公开网络限流、Auth 撤销/过期流策略、规则/时钟定版、跨进程所有权与压力测试、日志压缩/保留、真机生命周期与独立 HTTPS 测试环境。当前本地 PASS 不消除这些风险，也不证明生产契约已核验。
