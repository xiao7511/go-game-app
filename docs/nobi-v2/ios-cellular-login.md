# iOS 移动网络登录修复（2026-10-16）

## 问题与证据

用户确认：iOS TestFlight 1.0 (4)，中国移动 5G 登录失败，已允许蜂窝数据，同一手机 Wi-Fi 登录正常。尚未取得失败错误原文及蜂窝网络抓包，因此不能断言运营商封禁或 IPv6 是根因。

原登录 HTTP 服务为 `https://kogjjfccyncdszuuwlun.supabase.co/auth/v1/`。新增自有双栈 HTTPS 入口 `https://api.nobistudio.com/nobi-online/auth/`，由香港 Nginx 转发到同一个 Cloud Auth 项目。保留 SDK 项目 URL、项目会话存储键、JWT issuer 及现有账号。其他项目、本地开发环境、REST、Storage 和 Realtime 地址不改。

部署验证额外发现：API 域名的 `supabase-config-api` Worker 影响鉴权头和跨域响应。同一公开匿名密钥访问香港源站健康接口返回 200，经原通配 Worker 返回 401 Invalid API key；增加更具体的 `api.nobistudio.com/nobi-online/auth/*` 路由（Worker：无）后恢复。原 `api.nobistudio.com/*` 和 `game.nobistudio.com/api/*` 路由保留。

## 实现

- 仅上述生产项目的 Auth HTTP 请求使用新入口，保持方法、查询参数、请求体及 apikey/Authorization。错误鉴权与服务错误原样返回，不自动重发密码。
- 连接与响应读取均设 12 秒超时，并传递调用方取消信号。登录状态核查失败后可重试；未验证已有会话时不替换账号。
- 登录/注册页新增“检测登录网络”，只读健康接口，不发送账号密码或用户会话。失败信息不再打印整个 SDK 错误对象。
- Nginx 保持上游 TLS 证书校验、SNI、原有认证与跨域策略；无缓存、无自动上游重试。日志仅含时间、方法、路径、状态和耗时，不含查询、请求体或鉴权头。
- Apple Distribution、描述文件、签名集成、版本号和构建号脚本均未修改。

## 部署与验证

将 `infrastructure/production/` 下三个 auth 专用配置文件上传同一临时目录后，执行 `sudo bash deploy-auth-gateway.sh`。脚本只允许现有 API 虚拟主机，先检查布局与 Nginx，再备份、安装、检查、平滑重载；失败恢复备份。独立登录路由不重启联机服务或变更数据库。

Cloudflare → nobistudio.com → Workers 路由：添加 `api.nobistudio.com/nobi-online/auth/*`，Worker 选“无”。回滚时删除这条新路由并恢复部署脚本打印的 Nginx 备份。不要删除原通配路由或关闭 TLS/WAF。

只读检查命令：`node scripts/check-auth-gateway.mjs`。使用网站已验证的公开匿名配置，不使用账号凭据；确认原项目和代理健康一致、缺少 apikey 返回 401、无效 JWT 与原服务同样被拒绝（当前 403）、三个 Web/iOS origin 的预检及联机健康通过。桌面网络检测可能需要使用本机已有网络代理，这不改变 App 的网络设置，也不能替代真机 5G 验收。

自动化覆盖：Auth 请求转发隔离、密码/刷新请求与 Request 对象保真、401/403/429/5xx 无自动重试、超时和取消、原存储键保留；浏览器模拟原域名不可达仍可登录、会话验证中断后的恢复、无凭据网络诊断。Web 和 mobile 构建必须通过资源验证。

## 真机与 TestFlight 验收

1. 先在同一 iPhone 关闭 Wi-Fi，用移动 5G 打开 `https://game.nobistudio.com/login.html`。点击“检测登录网络”，再用现有账号登录；密码只在页面输入。核对是否进入大厅及联机房间。
2. 网页验证通过后，由人工在 Codemagic 选择合并后的 `main` 最新提交及 `ios-testflight-release` 工作流重新构建。保留已有签名。营销版本保持 1.0，构建号由原脚本自动选择高于已上传版本的值，不手动复用 4。
3. 按既有人工流程在 App Store Connect 处理构建并分配测试组；本次不自动触发云构建或分发测试版本。
4. 真机更新后分别验证首次登录、已登录启动、Wi-Fi/5G 切换、登出后重新登录、联机建房。记录网络检测及页面错误文字即可，不发送密码/令牌。

**旧包 1.0 (4) 内嵌旧脚本，不能依靠网页发布自动获得修复。当前完成的是代码与生产入口修复，5G 真机成功仍需用户验收。**
