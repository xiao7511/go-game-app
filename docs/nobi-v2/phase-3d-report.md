# Nobi V2.0 Phase 3D 开发与隔离验收报告

日期：2026-10-11（Asia/Shanghai）。项目 D:/project/go-game-app，分支 feature/nobi-games-v2，Phase 3C 基线 43fe74811072366f79ec75f9bd476e6b12be989a。

**本地功能与隔离验收 PASS。原仓库 .git 只读，提交保存在工作区内独立 Git 副本，原分支尚未快进。Android Debug/APK资源核验PASS。依赖升级 PARTIAL（xmldom已修复，剩余BLOCKED），历史签名暴露 FAIL，正式发布 NO-GO。** 未修改生产数据库、推送、合并 main、重写历史、撤销证书或正式发布 Android/iOS。

## 实际规则及来源

版本 **guandan-standard-v1**，仅为项目版本，未取得或宣称官方赛事认证。[完整规则矩阵](phase-3d-rules.md)逐项记录默认、依据及差异，来源为合肥开放大学2016赛事规则、中国石油大学2024交流规则、东南大学双副牌规则、BCTA2023规则；不能将这些活动文本称作唯一国家标准。

采用两副108张、四人各27张、对家队友；所有花色级牌等值，高于A、低于王；红桃级牌可代非王点数与花色。支持单/对/三张/三带二、5张顺子、三连对、钢板、4–10张炸弹、5张同花顺、四王炸。压制为四王 > 六张及以上炸弹 > 同花顺 > 五炸 > 四炸 > 普通牌型；A可作连续牌最低端。头游队友二/三/末游分别升3/2/1级，保留两队等级、主级及A失败次数；必须实际打A且队友不是末游才过关。

钢板默认**两个连续三张，共6张**，全部核实来源均如此。需求中“三连三/9张”变体 **BLOCKED**，需要具体文本确认；当前不将9张钢板认作合法或标为PASS，其余工作已执行。

完整配置写入快照：aceLow=true、steelTriples=2、maxBomb=10、aceFailureLimit=3（可2）、doubleAnti=team-two-big-jokers（可单人两王）、returnExcludesLevel=true（可false）、同点双贡按clockwise对应、还贡≤10/无低牌则最小非逢人配。级牌还贡排除按级牌高于A解释；首副安全随机先手、120秒行动时限、未声明时最低可压解释、每副Elo结算是明确的线上项目约定，不冒称全部原线下条款。HTTP新建只用默认配置，玩家不能更改；后续公平配置变更须新版本或独立分区。

## 实际完成

- 双副牌生成、服务端安全洗牌和发牌，UUID实例及deck=0/1区分同牌面；严格验证每副每种牌面、108唯一ID、4×27。
- 纯规则匹配、逢人配声明验证、大小比较、轮转、不出、借风、四名次、升级/A关、单/双贡、对应还贡及抗贡。贡牌双方先提交齐全才转移，公众视图不提前泄露候选或提交ID。
- 新房默认新引擎；formatVersion=2、规则版本、完整配置、初始系列、原始deal、日志、私有快照。恢复通过重放与快照一致性核对。保留Auth、原子持久化、幂等收据、SSE/Realtime、重连和服务恢复。
- 可信正常终局派生下一副，继承成员/座位/两队等级，独立room/match ID结算；重复进入返回同一子房。拥有者先创建，队员进入；冠军或异常终局不能继续该系列。
- 隔离迁移011–013为评级、事件、对局增加rules_version分区；排行榜/个人默认新规则。全员团队Elo仍在可信终局事务中提交。013修复回归发现的暂停赛季切换归档遗漏。
- UI保留原27张重叠布局与三种理牌，增加物理ID可访问标签、明确出牌确认/预览、逢人配解释选择、四名次含末游、两队等级/主级、贡/还确认与下一副入口。Nobi V2.1大厅源码和风格未改。

继续处理完成：xmldom兼容补丁；在线嵌入横屏遮挡修复；最终125单元、23页面、原30+新7真实Supabase、原6联机及新增两副浏览器对局全部完成exit0；当前Android Debug及APK资产/签名核验完成。新增修复保留既有五个提交并另作本地提交。

核心文件为 ui/guandan-rules.mjs、server/guandan-cards.ts、server/guandan-standard.ts、authority.ts、persistence.ts、http.ts、ratings.ts，及 guandan-game.js、ui/online.js；新增规则、真实数据库和浏览器验收测试。

## 历史解析与积分策略

审计发现 Phase 3C 实际已发108张/每人27张，single-hand意为单副对局，旧报告“单副牌”描述不准确；旧规则仍存在通配过度放行、王炸/顺子/同花顺边界、钢板、等级和贡牌缺失。

无版本或旧版本历史快照走legacy-rules.ts，未知版本拒绝。旧竞技保留在nobi-single-hand-v1，新规则独立从1500开始，Go保留Chinese-area-agreement-v1；无删分、无旧结果重新认定。旧分区可用rulesVersion参数查询；默认榜单/成绩/历史使用新分区。实库验证旧2800分不进入新规则榜单或个人积分。

## 全量测试

[无凭据汇总](phase-3d-test-results.json)。下列最终成功测试均exit 0，未用早期失败/挂起运行代替PASS。

| 检查 | 实际结果 | 范围 |
| --- | --- | --- |
| 原92单元 + 新31规则单元 + 新2安全单元 | **PASS 125/125，18文件** | 原测试保留；规则、DocType漏洞拒绝与plist兼容 |
| 原Edge页面 | **PASS 23/23** | 大厅、PC/手机、触摸、音频、围棋、PNG及构建 |
| 原真实Supabase | **PASS 19+11=30组** | Auth/RLS/RPC/Realtime、私有手牌、故障回滚、并发/Elo/赛季 |
| 原真实浏览器联机 | **PASS 4+2=6项** | 四人掼蛋、围棋、断网/重启/幂等、完整竞技及排名/历史 |
| 新真实双副牌Supabase | **PASS 7组** | 两副共299次出牌/不出；自然首副、升级、重启、分区、贡牌及并发重结算 |
| 新四客户端连续对局 | **PASS 1项、完整2副** | 27张手势、重复实例实际出牌、PC/两种手机横屏无遮挡、等级继承、贡牌重启、两次结算 |
| 离线HTTP框架 | **PASS 1项/10检查、143动作** | 模拟身份，不计入真实联网 |
| 服务TS及基础/私有/竞技契约 | **PASS** | 私有Schema不发布，客户端改收据/结果/分数拒绝 |
| 原扑克/围棋基线 | **PASS 56/56 PNG哈希、7/7渲染片段** | 原始manifest未改 |
| Web/mobile构建及白名单 | **PASS** | 新规则模块、56PNG、5音频完整 |
| Android/iOS public资源 | **PASS** | 最终dist/mobile手动同步并核验；不是原生编译 |
| Capacitor CLI copy | **BLOCKED，命令失败** | 沙箱uv_os_get_passwd失败，未伪报CLI通过 |
| 本轮Android Debug / APK资源 | **PASS** | 离线Gradle8.0.2/Java17/SDK34；56PNG、5音频、规则模块及APK围棋片段 |
| 本轮IPA/物理真机 | **NOT RUN** | Windows未运行iOS；ADB枚举退出3221226505，未确认设备，不宣称真机验证或正式发布 |
| 签名材料检查 | **FAIL / exit1** | 既有暴露未轮换 |
| 根/tooling npm audit | **BLOCKED / exit1** | 审计端点不可达，未获得当前漏洞数 |
| 高危依赖升级 | **PARTIAL / BLOCKED** | xmldom0.9.12离线安装/兼容PASS；brace/tar及完整审计仍未关闭 |

早期失败已记录：系统Edge路径/端口调整；下一副测试等待旧连接而非新roomId；随机先手与并发入座暴露数组下标当座位的测试假设；末游UI显示遗漏；复用生成目录导致旧源码；并行Playwright共用目录删除trace；补丁后构建首次执行被过小日志缓冲截断，扩大后两种构建实际exit0；嵌入视口修复后的拖选测试先滚动到可视区再计算坐标，PNG检查改为等待加载完成，断言未删减；PowerShell脚本策略阻止旧APK解包器，现用已有ZIP库并核验通过。修正后最终测试重跑通过，未减少断言或跳过用例。复用5189现核对7文件HTTP内容哈希（含online.css），拒绝旧源码；各Playwright套件使用独立产物目录，连续两副回归可通过NOBI_GUANDAN_SERIES_SCREENSHOT_DIR写入ignored目录，保留4张验收截图。早期runner/预览退出清理受沙箱限制，部分localhost预览可能仍运行；未停止用户原有5178服务。

### 15项完整对局要求

| 项目 | 覆盖与状态 |
| --- | --- |
| 1–4：108/4×27/同牌实例/无漏重 | 规范双副、20次发牌、重复负例；真实四手108集合：PASS |
| 5：级牌/逢人配 | 等值、非王代牌、单/双野牌、自然连续点数、声明负例：PASS |
| 6：全部支持牌型/比较 | 本版本类型、A低端、普通同型限制：PASS；9张钢板BLOCKED |
| 7：炸弹/同花顺 | 4–10炸、五/六炸分界、四王限制：PASS |
| 8：合法出牌/不出/轮转 | 错座/盗牌/重复ID/领出过牌拒绝、全过/借风、完整终局：PASS |
| 9：四名次/升级 | 3/2/1升级、主级变更、A过关/失败回2、四席终局显示：PASS |
| 10：贡/还/抗贡 | 单/双贡、同点方向、对应还、无低牌、级牌配置、单/分持双抗；实库贡牌重启：PASS |
| 11：四人隐私/权限 | 本人手牌、候选不泄露、第五人/写分/结果/管理拒绝：PASS |
| 12：断线后完整108恢复 | 20动作后服务恢复剩牌+已出108唯一ID；浏览器断网/刷新：PASS |
| 13：重启版本 | 开局及贡牌重启后版本/配置/级牌/108状态一致：PASS |
| 14：可信结算/团队Elo | 两副独立终局、四人事件、旧新分区、原全员失败回滚：PASS |
| 15：重复/并发积分 | HTTP终局重复、重启重试、两个真实PG后台并发/重结算不丢不重：PASS |

服务端持有全牌，客户端仅见本人和已公开的出/贡牌。28/26等仅为贡牌转移中间状态，总数108，还贡后4×27。第三人出完后可信确定唯一末游，未虚构末游已打完。

真实浏览器用自身NobiOnline命令经HTTP完成循环；拖选、重复牌确认、贡/还和下一副由真实鼠标/触屏/按钮驱动。合法服务端夹具保证重复牌和贡牌路径，首手夹具0只确定测试操作者；客户端不能选deal。自然随机牌局另在实库完整走完。4个独立Edge contexts/4个真实Auth用户，属于一个浏览器运行器；手机844×390/DPR3及568×320模拟，PC1280×800布局，非物理设备或四种内核。[4张实际截图](screenshots/phase-3d/README.md)已核看。继续复核发现嵌入在线房间的250px矮视口使操作栏遮挡对家，现掼蛋横屏视口常规最小390px、≤650px宽小屏最小320px并在进入/旋转时将桌面滚动到可视区；只修改online页面，不改大厅。新增844×390、568×320及1280×800实际几何断言验证四席、操作栏及桌面出牌互不遮挡，保留真实拖选/重复实例/两副终局断言。

## 资源与安全

原images/cards和manifest保持，围棋渲染、大厅源码未改。既有未跟踪参考图保留，SHA256 d739476492d2d0d7a5d1fc58499c83bef9b546bf1b75729c5cb36da2efdaec9b。旧阶段截图未覆盖，回归图在ignored目录。

[安全状态与人工轮换流程](phase-3d-security.md)。每项提交执行staged guard及diff检查；未记录私钥、测试Token或数据库密码。锁版本及维护者公告已核查，继续处理时利用经registry SHA512校验的本机缓存，离线升级xmldom0.9.10→0.9.12，manifest范围兼容，npm实际只改1包，并同步已有跟踪源码/lock。新增漏洞拒绝与plist往返测试通过；注入保护仍需requireWellFormed显式启用，未宣称默认序列化自动安全。审计端点及brace2.1.7下载仍不可达，tar6.x须工具链迁移验证，整体风险尚未关闭；旧3 high/1 critical仅为历史数据。所有者须确认签名用途/公开范围，生成新身份并验证，按Apple批准撤销和Android上传/应用签名分流处置；本轮未执行外部变更。

DB仅为隔离API127.0.0.1:55421及PG55422，每连接验证专用fixture。Docker接口不可访问时显式TCP桥支持MD5/SCRAM服务端签名校验；业务事务set local role nobi_authority，本地操作员postgres仍不是生产最小权限驱动。011–013仅应用隔离库，没有生产数据库连接。

## Git交付

原仓库git add/commit被.git/index.lock Permission denied拒绝，未提升权限或写入只读目录。独立副本 **.nobi-isolated/phase3d/commit-worktree** 的同名feature分支以Phase3C为父链创建五个真实提交，最终文件来自实测工作区。该副本用于Git对象交付，未完整检出基线；缺失文件不代表批准删除，不应在该目录使用add -A或commit -a。原仓库HEAD仍是基线；main仍a0bb939dbe3544abb5b99ab7fc500a76b2998e06。

| 批次 | 功能 | 实际Commit SHA |
| --- | --- | --- |
| 1 | 规则矩阵与双副牌基础 | 04313d1daa92f53686ae12239d9def67ae6eb4f2 |
| 2 | 牌型、升级与权威引擎 | 43949d8f9b7a200d9f6f071b42e8589dfedec470 |
| 3 | 进贡还贡及持久联机 | b687381ae1fc74b267f36d299b98cadc3a2f7673 |
| 4 | 27张UI与可信结算 | d86b4246a052d331b33f1351a9230d59a6670bf6 |
| 5 | 安全保护、测试、交付文档 | f3f188e8e01a9629c27af0c5c4146379556d0809 |
| 追加 | xmldom补丁、横屏视口、Android Debug及更新交付证据 | 本报告的追加提交；以下命令及最终回执提供实际SHA，避免自引用哈希 |

~~~powershell
git -C .nobi-isolated/phase3d/commit-worktree log -6 --format="%H %s"
git -C .nobi-isolated/phase3d/commit-worktree log -1 --format=%H -- docs/nobi-v2/phase-3d-report.md
~~~

增量包 **.nobi-isolated/phase3d/nobi-phase3d.bundle** 仅导出baseline..feature新增对象，以基线为前置条件，不导出旧签名文件/完整历史。保留原五个提交并追加修复提交，未amend/rebase。最终SHA、bundle校验及内容核对见 **.nobi-isolated/phase3d/git-delivery.json**。恢复原.git写权限后，再核对基线与工作区并导入/快进feature；本轮未快进原仓库。不得force push、reset --hard、main合并或公开上传。

## 重现与Phase 4条件

Node24、专用本机fixture和系统Edge。正常Docker环境保留原local:start/migrate。当前现有隔离服务可显式选择TCP与Edge路径：

~~~powershell
node tooling/node_modules/vitest/vitest.mjs run
node --import ./scripts/local-tcp-env.mjs tests/integration/supabase.test.mjs
node --import ./scripts/local-tcp-env.mjs tests/integration/competitive.test.mjs
node --import ./scripts/local-tcp-env.mjs tests/integration/guandan-standard.test.mjs
node --import ./scripts/local-tcp-env.mjs tooling/node_modules/@playwright/test/cli.js test --config phase3b.playwright.config.mjs
node --import ./scripts/local-tcp-env.mjs tooling/node_modules/@playwright/test/cli.js test --config phase3c.playwright.config.mjs
node --import ./scripts/local-tcp-env.mjs tooling/node_modules/@playwright/test/cli.js test --config phase3d.playwright.config.mjs
node scripts/verify-assets.mjs
node scripts/verify-build.mjs
node scripts/android-debug-check.mjs --phase=phase3d --offline
node scripts/verify-apk-assets.mjs --phase=phase3d
~~~

真实DB/联机套件应顺序运行，避免测试赛季互相切换；复用5189前重建当前源码，不一致即BLOCKED。23页面按playwright.config的dev/preview端口运行。原始日志/身份留ignored目录。

Phase 4可继续隔离工作，需先导入本地提交并复现回归、确认9张钢板意图（如坚持变体）、定版竞技弃局/超时/整场计分政策。生产或正式发行还必须完成：依赖安全升级/重审；签名轮换及历史暴露处置；原生iOS构建/真机；最小权限DB、独立HTTPS、公开限流、Auth撤销、跨进程房间一致性/容量/压测；真机网络/后台/方向/音频及Android发布前签名构建。apksigner verify与aapt均exit0，证书CN为Android Debug且manifest含debuggable；使用工作区内Debug身份，未撤销旧身份。本轮APK只作本地Debug验证，大小6,086,043字节、SHA256 04106041c178ec92fd3d77100998477135f1a1c253b935ef8e859e821f2effcc；日志及APK留在ignored目录。新脚本可用 --phase=phase3d --offline 独立输出，验证改用既有yauzl库，无需改变系统PowerShell执行策略；API仅接受项目Android build下APK，限制解包路径/重复项/总大小及签名材料。当前PASS仅证明这一配置的本地功能，不能代替生产迁移或发布授权。


## 2026-10-11 双端牌桌视觉修正

在隔离 Git 基线 c5144d52d51bea10a09319aa83ab16705de70caa 后完成 PC 围桌与底部操作重排、手机横屏精修及竖屏旋转遮罩。最终实际回归为 125 单元、34 Edge、原有 4+2 联机、四浏览器连续两局、37 组隔离 Supabase、56 PNG 与 7 围棋保护检查通过。

[完整报告、前后测量和截图](guandan-layout-final-report.md) 列出未达到的参考图差异及未进行的原生真机验收，不以测试通过替代设计验收。实际提交仍位于 .nobi-isolated/phase3d/commit-worktree 的 feature/nobi-games-v2；本轮 SHA 见 .nobi-isolated/landscape-round3/delivery.json 与最终回复。原仓库 Git 元数据只读，HEAD 保持 Phase 3C；源码改动已在原工作目录完成。
