# 音频资源、许可与接入契约

2026-10-11 更新：掼蛋现已提供三首舒缓古典钢琴录音、真实爆炸录音及原创倒计时提示，详见 [音频来源与许可](guandan-audio-provenance.md)。下面保留 Phase 1 的历史缺省状态；当前资源与构建行为以新记录和 `ui/audio-manifest.js` 为准。

2026-10-10，Phase 1。所有路径相对 `game.html`，Web/mobile/Android/iOS copy 后保持同名原字节。

| 已有资源 | AudioManager 事件 / 音量域 |
| --- | --- |
| assets/sounds/button-25.mp3 | click / pass，effects |
| assets/sounds/button-22.mp3 | placeStone，effects |
| assets/sounds/button-21.mp3 | capture，effects |
| assets/sounds/button-12.mp3 | invalidMove，effects |
| assets/sounds/button-3.mp3 | yourTurn，prompt |

这些是原仓库音效，本轮不替换、不增加商业曲目；构建验证与源码逐字节比较。现有来源/许可证明尚需所有者补档，不能把“原仓库已有”当成商业发行授权证明。

## 背景音乐缺省状态

`ui/audio-manifest.js` 的 `lobby`、`guandan`、`go`、`result` 全部为 null：**没有授权 BGM 文件**。开关与音量真实保存，但缺曲目时不创建音乐 Audio、不播放音效冒充 BGM、不宣称有主题曲。UI 清楚显示暂无授权音乐。

未来曲目条目须提供 `{src, license}`；本地路径仅接受 `assets/sounds/` 或 `assets/music/` 下 MP3/OGG/WAV，拒绝远程 URL、目录穿越和缺许可字段。`license` 是来源记录的引用，不自动证明法律授权；人工审核原创/授权者、来源、归属、商用/改编/平台范围、期限及文件 SHA-256。新增 music 文件还需显式扩展构建白名单与产物测试，本轮未发布空想的音轨。

## 接口

- `NobiAudio.getSettings()/setSettings(patch)`：musicEnabled/musicVolume、effectsEnabled/effectsVolume、promptEnabled/promptVolume；数值 0..1。
- `setScene('lobby'|'guandan'|'go'|'result')`：可用曲目 450ms 渐变，缺曲目渐停旧音轨；测试使用 FakeAudio/虚拟时钟，没有把夹具路径当产品资源。
- `unlock()` / `playEffect(name)`：真实指针/键盘交互后播放；play() 拒绝报告 autoplay，恢复按钮重试。
- `suspend()/resume()`：绑定 visibility/pagehide/pageshow，取消音乐/音效迟到 Promise；media pause 标记 interrupted，提供交互恢复。真实电话/耳机/OS 事件仍需设备验证，未装新 Capacitor 插件。
- `getStatus()/subscribe()`：场景、资源可用、解锁、暂停、播放、受限状态；不暴露 Auth。

新持久化键 `nobi.audio.v1` 不替换既有 Auth/用户名键，登出不清全局 storage；写入受限时退为本次会话偏好。实际 MP3 请求和 play 接受在 Edge PASS；是否从扬声器听到正确声音、Safari/原生 WebView 自动播放及真实 BGM 听感 NOT RUN。
