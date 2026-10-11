/* PC-only adapter: legacy protocol/download implementation, not shipped in App. */
(() => {
'use strict';
if (!window.NobiPlatform.canUsePCGames()) return;
window.NobiPC = {
cardHTML: "          <div class=\"app-game-item\" data-id=\"cs16\">\r\n            <div style=\"font-size: 50px; margin-bottom: 12px;\">🔫</div>\r\n            <h4 style=\"margin: 0; font-size: 18px; color: #ffffff;\">CS 1.6</h4>\r\n            <span style=\"font-size: 11px; color: #f59e0b; display:block; margin-top:6px; font-weight:bold;\">免密 VBS 唤醒版</span>\r\n           <!-- 统一风格的下载与初始化按钮组 -->\r\n            <div style=\"margin-top: 10px; display: flex; flex-direction: column; gap: 8px;\">\r\n              <div style=\"padding: 4px; background: rgba(0,0,0,0.2); border-radius: 8px;\">\r\n                <a href=\"https://game-pkg.nobistudio.com/cs16_green.zip\" download \r\n                   style=\"color: #3b82f6; font-size: 11px; text-decoration: underline; font-weight: bold; display: block;\" \r\n                   onclick=\"event.stopPropagation();\">\r\n                   📥 下载清洁安装包（解压到 d:\\Cs1.6）\r\n                </a>\r\n              </div>\r\n              \r\n              <div style=\"padding: 4px; background: rgba(0,0,0,0.2); border-radius: 8px;\">\r\n                <a href=\"https://game-pkg.nobistudio.com/一键初始化.bat\" download \r\n                   style=\"color: #3b82f6; font-size: 11px; text-decoration: underline; font-weight: bold; display: block;\" \r\n                   onclick=\"event.stopPropagation();\">\r\n                   ⚙️ 一键初始化环境（首次执行）\r\n                </a>\r\n              </div>\r\n            </div>\r\n          </div>\n",
launch(mode) {
    if (window.NobiPlatform.canUsePCGames()) {
      const apiMode = (mode === 'SINGLE') ? 'single' : 'multiplayer';
      console.log(`[CS1.6 调度器] 正在走免密 VBS 路由拉起游戏, 模式: ${apiMode}`);

      if (apiMode === 'single') {
        // 单机版直接通过本地 VBS 唤起
        window.location.href = "cs16://";
      } else {
        // 🚀【核心升级】联机版：先获取当前登录用户的昵称，再请求 Worker 联机 IP
        const supabase = window.getSupabaseClient && window.getSupabaseClient();

        // 1. 尝试从 Supabase Auth 或用户表获取当前玩家昵称
        let userNickname = "Player";

        (async () => {
          try {
            if (supabase) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                let profile = null;

                // 1. 尝试从 profiles 表中获取昵称
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('nickname')
                  .eq('id', user.id)
                  .maybeSingle();

                if (profileData && profileData.nickname) {
                  userNickname = profileData.nickname;
                } else {
                  // 2. 如果 profiles 里没有，尝试去你的 custom users 表中查一下（或者用邮箱前缀兜底）
                  const { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                  if (userData && userData.email) {
                    // 用邮箱@前面的部分当做临时昵称
                    userNickname = userData.email.split('@')[0];
                  } else if (user.user_metadata && user.user_metadata.nickname) {
                    // 3. 兜底：尝试从 auth 的 metadata 获取
                    userNickname = user.user_metadata.nickname;
                  } else {
                    // 4. 终极兜底：生成一个默认玩家名
                    userNickname = "玩家_" + user.id.slice(0, 6);
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[CS1.6 昵称获取提示] 使用默认昵称", e);
          }

          // 2. 请求 Cloudflare Workers 边缘网关获取联机房主的 IP 与端口
          fetch(`/api/games/cs16/launch-config?mode=${apiMode}`)
            .then(response => {
              if (!response.ok) throw new Error("Backend return non-200 status");
              return response.json();
            })
            .then(data => {
              console.log("Worker返回完整数据:", data);
              if (data && data.launchUrl) {
                // data.launchUrl 假设后端返回的是形如：cs16://connect/47.100.x.x:27015
                // 我们在这里把动态查到的昵称用 /name/ 拼接到协议后面
                let finalUrl = data.launchUrl;

                // 如果后端返回的协议没带昵称，我们在后面追加
                if (!finalUrl.includes('name/')) {
                  // 去除末尾斜杠
                  if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
                  finalUrl = `${finalUrl}/name/${encodeURIComponent(userNickname)}`;
                }

                console.log('[CS1.6 调度器] 成功获取带昵称的公网对战协议:', finalUrl);
                window.location.href = finalUrl;
              } else {
                // 兜底：无 IP 时降级拉起单机客户端并带上昵称
                window.location.href = `cs16://name/${encodeURIComponent(userNickname)}`;
              }
            })
            .catch(error => {
              console.error('[CS1.6 启动异常]', error);
              alert("无法连接到大厅联机后端，已为你自动降级拉起带有你昵称的本地单机版客户端！");
              window.location.href = `cs16://name/${encodeURIComponent(userNickname)}`;
            });
        })();
      }
      return; // 🔥 强力熔断
    }


}
};
window.initEnvironment = function() {
  // 巧妙通过 cmd 执行单条命令：自动建文件夹 -> 静默下载 start.vbs -> 调起 start.vbs
  const regContent = `Windows Registry Editor Version 5.00

[-HKEY_CURRENT_USER\\Software\\Classes\\cs16]

[HKEY_CURRENT_USER\\Software\\Classes\\cs16]
@="URL:CS16 Protocol"
"URL Protocol"=""

[HKEY_CURRENT_USER\\Software\\Classes\\cs16\\shell]

[HKEY_CURRENT_USER\\Software\\Classes\\cs16\\shell\\open]

[HKEY_CURRENT_USER\\Software\\Classes\\cs16\\shell\\open\\command]
@="cmd.exe /c if not exist \\"D:\\\\Cs1.6\\" mkdir \\"D:\\\\Cs1.6\\" && powershell -WindowStyle Hidden -Command \\"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://game-pkg.nobistudio.com/start.vbs', 'D:\\\\Cs1.6\\\\start.vbs')\\" && wscript.exe \\"D:\\\\Cs1.6\\\\start.vbs\\" \\"%1\\""`;

  const blob = new Blob([regContent], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "一键初始化环境.reg";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  alert("环境修复文件【一键初始化环境.reg】已成功下载！\n\n请在浏览器右侧下载列表中双击运行该文件，点击“是”导入即可完成初始化。");
};

})();
