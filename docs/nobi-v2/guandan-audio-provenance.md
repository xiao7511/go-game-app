# 掼蛋古典音乐与真实爆炸录音

2026-10-11。默认背景音乐改为《月光奏鸣曲》第一乐章。大厅“音乐与音效”和牌桌“设置”可选择三首舒缓钢琴录音，选择、开关及音量保存于本设备。切换使用 450 ms 淡入淡出，连续切换会停止被替换的音轨。保留默认 35% 音量与已有偏好；离开牌桌或进入后台停止播放，大厅音乐页支持主动试听。

## 音乐来源

以下来源页提供的是录音本身的许可声明。MP3 存于本项目，播放不依赖外部音频服务。

| 本地文件 | 曲目与录音归属 | 来源与许可 |
| --- | --- | --- |
| assets/music/guandan-moonlight.mp3 | 贝多芬《月光奏鸣曲》第一乐章，Paul Pitman / Musopen，约 5:36 | [Commons 录音页](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_'moonlight',_op._27_no._2_-_i._adagio_sostenuto.ogg)，公有领域录音，VRT 2008012110017088；使用站点 MP3 转码 |
| assets/music/guandan-nocturne.mp3 | 肖邦《降 E 大调夜曲》Op.9 No.2，Musopen，约 4:37 | [Commons 录音页](https://commons.wikimedia.org/wiki/File:Nocturne_Op._9_no._2_in_E_flat_major.mp3)，CC0；原始 MP3。该页没有具体演奏者署名 |
| assets/music/guandan-dreaming.mp3 | 舒曼《梦幻曲》Op.15 No.7，Donald Betts / Musopen，约 3:23 | [Commons 录音页](https://commons.wikimedia.org/wiki/File:Robert_Schumann_-_scenes_from_childhood,_op._15_-_vii._dreaming.ogg)，公有领域录音，VRT 2008012110017088；使用站点 MP3 转码 |

## 爆炸与倒计时

- [Explosive.flac，qubodup / Freesound](https://freesound.org/people/qubodup/sounds/189778/)：CC0。作者描述为真实简易爆炸装置引爆，声音提取自美国政府机构公开影片。保留匿名公开 HQ MP3 预览为 `assets/sounds/guandan-bomb-recording.mp3`（约 8.478 秒），没有使用需要登录的原始文件下载。
- `assets/sounds/guandan-bomb.wav` 使用该真实录音的 0–1.8 秒片段，转为 44100 Hz、单声道、16 bit PCM，峰值归一至 0.85，4 ms 起音、120 ms 尾部淡出；没有合成爆炸声音。由合法炸弹出牌触发，遵循游戏音效开关与音量，设置中可试听。
- `assets/sounds/guandan-countdown.wav` 仍为项目原创合成的 0.16 秒提示音，己方最后 10 秒每秒一次，遵循提示音开关。仅此文件由 `scripts/generate-guandan-audio.mjs` 生成。
- 原 19.2 秒合成背景音乐已移除。

## 导入与复验

执行 `powershell -File scripts/import-guandan-recordings.ps1` 导入上述公开录音，再执行 `node scripts/prepare-guandan-bomb.mjs`，用本机 Edge 的 OfflineAudioContext 解码、裁剪爆炸录音。导入不会在构建时自动联网；远程文件若变化应重新核对许可与哈希。脚本在仓库目录写入已知资产路径。

Web/mobile 构建复制本地音乐与音效并逐字节校验。浏览器验证实际解码三首 MP3 和 1.8 秒爆炸 WAV，覆盖切换播放、刷新保存、大厅试听、静音及退出牌桌。自动测试拦截线上请求，使用本机夹具。

本轮验证：142 项单元测试、9 项 5178 专项浏览器测试通过。既有回归首轮 36/37 通过，667×375 横屏按钮尺寸检查首轮失败，单独复验通过（该布局代码本轮未改动）。Web/mobile 构建均通过，各校验 3 个背景音轨、8 个声音文件。手机音乐页已截图检查。运行中的 5178 保留线上登录配置，仅同步前端及音频。

## SHA-256

```text
a0702c6db4ff22ff5a0bf7a76e443079e7cf2ad2fdf5d445c3b7ea8d60d0994b  assets/music/guandan-moonlight.mp3
d6a289cd51123f0033fb6e4014277495340c6d3afa3a4e42e7cd89bcf634d917  assets/music/guandan-nocturne.mp3
e6bc9e39c1c84050dad417bd8338371ce2dc77bd0fac780432d921b8ee964041  assets/music/guandan-dreaming.mp3
378d052950f473a9522083ee89797eb49a5bd40a1f78149a6c0e9a0aae556f24  assets/sounds/guandan-bomb-recording.mp3
bf2642df49a41aff657e79561e7da38545138576f7abae66ad9ad34acdb284cc  assets/sounds/guandan-bomb.wav
```
