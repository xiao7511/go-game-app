# 头像、房间大厅与云发布

## 用户操作

登录 → 个人中心 → 我的头像：可选 8 个形象、上传照片或恢复默认。照片裁剪为 96×96 JPEG，压缩后最多 6,000 字符，保存到本人 Auth metadata `nobi_avatar`。修改失败保留旧头像，重新登录其他设备会读取账号头像；联机服务从已验证 Auth 身份读取头像，广播给同房间玩家。不会上传原始照片。旧版仅本机头像需要重新选择一次才能同步。

联机入口显示所有已创建房间，可按游戏筛选，每页 50 个，6 秒自动刷新。选择“加入房间”，人数到齐后由房主开始。已满员/进行中房间仅允许原成员返回；列表不包含手牌、引擎、用户 ID 或操作日志。刷新正在玩的页面会恢复当前房间。房间号加入仍可使用。

## 生产部署

网站：推送 `main` 会触发 `.github/workflows/deploy.yml`，构建 `dist/web` 发布 GitHub Pages；生产域名为 `https://game.nobistudio.com`。

联机服务：GitHub Pages 不运行 Node 服务。`server/production.mjs` 用 Node 24 运行单实例权威规则服务，SQLite 保存局面，托管平台提供 HTTPS。不接入生产积分结算。

可在已有服务器运行，也可用根目录 `render.yaml` 创建 Render Blueprint。配置包含收费的 0.5c-512mb 实例和 1GB 持久盘；创建前确认账户和费用。不要使用临时磁盘或多副本。

服务器变量：

- `SUPABASE_URL`、`SUPABASE_ANON_KEY`：与网站相同的公开 Auth 配置，不能用 service-role 密钥。
- `NOBI_ALLOWED_ORIGINS`：允许的网站 HTTPS origin，逗号分隔。
- `NOBI_ROOM_DATABASE`：持久目录中的绝对 SQLite 路径。
- `PORT`：服务监听端口，默认 8080。

生产入口改用香港：`https://api.nobistudio.com/nobi-online`，复用已有 HTTPS 证书。上海试部署的域名被腾讯云备案拦截，外网返回 DNSPod webblock；不能作为正式客户端入口。独立 `nobi-online` 用户运行 systemd 服务，Node 24 存放 `/opt/nobi-online/runtime`，监听 `127.0.0.1:55480`，数据库 `/var/lib/nobi-online/rooms.sqlite`，权限 700。原有 Supabase 服务和数据库不迁移；登录仍验证网站现有 Auth 环境。

部署成功后访问端点下 `/health`，应有 `service: nobi-online-authority-v1`、`persistent: true`。GitHub Pages 工作流默认使用上述香港端点，可用 Actions Variables 的 `NOBI_ONLINE_URL` 覆盖（HTTPS，可带干净路径前缀，无凭据/查询参数）。移动构建与 Codemagic 使用相同变量。数据库包含真实对局私有手牌，备份应保留 WAL 一致性和访问控制。部署脚本及 nginx/systemd 模板见 `infrastructure/production/`；修改 nginx 前会保存配置备份并执行 `nginx -t`。nginx 为压缩头像后的账号令牌允许单个 16KB 请求头，SSE 禁用缓冲。

## Codemagic：Windows 也可构建和签名

1. 在 Codemagic 连接 GitHub 仓库 `xiao7511/go-game-app`，选择根目录 `codemagic.yaml`。
2. YAML 已配置香港 `NOBI_ONLINE_URL`。构建会从生产网站的公开配置端点读取并校验 Auth 配置；也可同时设置 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 覆盖。无需额外建立变量组。
3. 先手动运行 `ios-simulator`，使用云端 macOS/Xcode 26.6，安装 CocoaPods、同步 Capacitor、检查资源后编译无签名模拟器 `.app`。成功构建不等于已完成真机测试。
4. 游戏标识 `cn.obsmd.gogame` 已注册，独立 App Store Connect 应用为“Nobi 游戏”，数字 Apple ID `6821625687`。原“NOBI 动漫”是另一应用，不能作为游戏上传目标。
5. YAML 使用账号中已有的 Apple 连接 `nobi-apple`。复用此连接；如需替换，App Store Connect API key、Issuer ID、`.p8` 只能交给 Codemagic 的凭据表单，禁止提交 Git 或聊天。
6. Codemagic Code signing identities 中生成/上传 Apple Distribution 证书，获取对应 bundle ID 的 App Store provisioning profile。证书和 profile 必须匹配同一团队及私钥。
7. YAML 已配置游戏 `APP_STORE_APPLE_ID`。手动运行 `ios-testflight`：检查项目 → 使用 profile → 查询已有 TestFlight build number 并递增 → 生成签名 IPA → 上传并提交 TestFlight；不会发布正式 App Store。
8. 在 App Store Connect 完成 Beta 描述、联系方式、出口合规与 App Privacy，再将构建分配给测试人员。外部测试可能需要 Beta App Review。iPhone 安装 TestFlight 接受邀请，测试账号头像、房间列表、四人对局、断线恢复、声音和横竖屏。

两个工作流都需手动触发，不因普通 push 自动消费云端构建时间。首次上传可能要求先完成 Apple 协议与应用资料。未连接账号、未生成签名 IPA、未看到 App Store Connect 构建时，不能标记为 TestFlight 已提交。

官方参考：[Capacitor 云构建](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/)、[签名](https://docs.codemagic.io/yaml-code-signing/signing-ios/)、[上传 TestFlight](https://docs.codemagic.io/yaml-publishing/app-store-connect/)。
