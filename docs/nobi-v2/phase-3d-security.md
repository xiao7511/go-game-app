# Phase 3D 安全处置记录

2026-10-11，限定本机隔离环境。未修改生产数据库、推送、重写 Git 历史、撤销证书或正式发行应用。

## 当前结果

材料检查真实 FAIL / exit 1：已跟踪的 ios_development.key 可解析为未加密 RSA 私钥；ios_development.csr 是匹配的申请而非证书；my-release-key.jks 实际为 PKCS12/PFX 容器，条目与有效期未核实。仅检查类型、大小和公开指纹，没有将私钥或容器密码写入报告/日志。历史曝光范围仍 NOT VERIFIED。

根和 tooling 的 npm audit 本轮均 exit 1，审计端点访问失败，状态 BLOCKED。历史报告的根 3 high / 1 critical、tooling 0 是历史结果，不是本轮结果；不得报告漏洞清零。锁文件当前版本：Capacitor CLI 5.7.8、tar 6.2.1、@xmldom/xmldom 0.9.12、brace-expansion 2.1.0。继续处理后，已将 @xmldom/xmldom 从0.9.10升级到0.9.12：从既有本机 npm 缓存只读提取原 registry 包，按缓存 registry 元数据的 SHA512 完整性核对，复制到工作区缓存，离线安装时只改一个包。plist 的 ^0.9.10 范围涵盖此补丁，manifest 与其他依赖版本不变；同步更新 root lock、已跟踪的 vendored 源码和内部 lock，未执行 audit fix --force。

维护者仍发布相关安全公告：[tar](https://github.com/isaacs/node-tar/security/advisories?state=published)、[xmldom](https://github.com/xmldom/xmldom/security)、[brace-expansion](https://github.com/juliangruber/brace-expansion/security/advisories)。这证明必须重新审计，不能凭某个补丁版本断言全部问题已修复。tar 新修复可能超出现有 CLI 的 6.x 范围；不能把跨主版本 override 视为安全升级。

xmldom 依据 [DocType 注入公告](https://github.com/xmldom/xmldom/security/advisories/GHSA-27p8-2357-5qqv)及[内存耗尽公告](https://github.com/xmldom/xmldom/security/advisories/GHSA-965w-775f-mr7g)选择0.9.12。新增回归验证非法 DocType 在 requireWellFormed=true 时被拒绝，以及 Capacitor plist 依赖的嵌套配置解析/生成兼容；原0.9.10副本实际不拒绝同一非法名字。此注入保护仍是显式启用选项；本项目的 plist 调用只使用 DOMParser，没有新增或宣称默认序列化自动安全。125项单元、两种前端构建和本轮 Android Debug/APK资产核验通过。补丁后最终23页面、原30+新7真实Supabase、原6浏览器联机与新增连续两副对局均exit0，横屏布局修复后的资源/Debug包再验证通过。完整网络审计仍无结果，因此整体依赖状态为 **PARTIAL / BLOCKED**。

brace-expansion 当前2.1.0仍受[嵌套递归高危公告](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7)影响，需更新同版本线；缓存只有1.x/5.x包，获取2.1.7 tgz真实失败 EACCES，未跨主版本替换。tar 6.x仍未修复，需与兼容的 Capacitor工具链迁移及iOS构建一起确认。

## 依赖修复的可执行顺序

1. 在可访问 registry 的受控本地 checkout 执行根与 tooling audit --json，并保存只含包名、版本、公告 URL、严重度、修复范围的报告。确认各链及 Node/Capacitor 的兼容范围。
2. 对同一受支持版本线的补丁升级逐项更新 lock；每项运行单元、构建、cap copy 与资源检查。超出 CLI 依赖范围的 tar 替换须与 CLI/Capacitor 一起做受控迁移，不能强制升级后省略 Android/iOS 构建。
3. 运行本报告全部联机与资源回归；Android Debug、macOS Pods/Xcode、设备流程和两套 audit 通过后，才能关闭依赖风险。当前 xmldom 补丁已完成，其余依赖与完整审计处置未完成。

## 必须由签名身份所有者执行的轮换

1. 只读确认 Apple 证书是否签发、证书类型/序列号、Team、应用、CI、设备和分发渠道；CSR 与指纹相符不能证明当前证书有效。核查 GitHub/Pages/Actions/备份曾否公开，登记暴露时间与受影响产物。材料按已暴露处理，删除当前副本不会恢复保密性。
2. 在所有者受控的 Keychain/Secret 存储生成新私钥与 CSR，备份恢复试验后申请替代证书。准备受影响 provisioning profiles、CI 注入、测试设备和回退安排。新私钥不得进入源码、网页、日志或聊天。
3. 由 Account Holder/Admin 明确批准后处置旧 Apple 证书；撤销会使包含该证书的 provisioning profiles 失效，需要重建与验证。操作遵循 [Apple 撤销说明](https://developer.apple.com/help/account/certificates/revoke-a-certificate)，本轮未执行。
4. Android 先确认容器对应上传密钥还是应用签名密钥、是否已发布及是否使用 Play App Signing。若为上传密钥，由所有者生成新上传密钥，仅导出公开证书并发起重置；若为应用签名密钥，按渠道的签名升级和既有安装兼容流程处理，不能直接替换为新普通/debug 密钥。依据 [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)。
5. 确认新身份的内测构建、既有安装升级、API 指纹/关联域、CI Secret 与受影响产物处置，再经单独授权移除当前树的旧材料。任何历史清理、远端 artifact 清理和证书撤销必须另获明确授权；本轮不强推、不改历史、不发送消息给第三方。
6. 保留事件记录与关闭证据：新证书公开指纹、授权人、换钥时间、撤销/重置回执、重新签名测试、历史公开范围和残留处置结果。报告不能包含私钥/密码。

## 本轮落实的保护

服务端洗牌/规则/结果裁决，物理牌校验，私有快照，规则版本及评级分区，原子贡牌交换与结算。提交 guard 新增受限 --repo 参数，只检查工作区内交付副本的 staged 内容；运行凭据、测试身份、数据库密码和原始日志仍在 ignored 目录。发布白名单与原始 PNG 校验保留。

Docker 管理接口不可访问时，测试可显式选 NOBI_LOCAL_DB_TRANSPORT=tcp。新桥固定 127.0.0.1:55422、每连接检查专用 fixture 标记，支持 MD5/SCRAM 并验证服务端签名，不打印 SQL/密码。它仍使用本地测试操作员 postgres 身份，业务事务 set local role nobi_authority；这不是生产最小权限驱动。生产的独立 DB 账号、HTTPS、公开限流、即时 Auth 撤销、跨裁判进程所有权及容量验收仍属于 Phase 4 条件。
