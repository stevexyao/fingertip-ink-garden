# 指尖花开 · 中国国画互动花园

以手为笔，让花开在指尖。通过摄像头识别一只或两只手，每只手对应一朵国画花卉；手指张合控制花苞到盛放，靠近镜头放大花朵，转腕带动花头；指尖停留选花，搭配四时山水。音乐默认使用 Apple Music 官方嵌入播放器，也可切回本机原创互动配乐。开启声控后，说“截图”即可截取当前国画。

**[在线入口](https://fingertip-ink-garden-1105-7fa6.netlify.app)** · [完整使用说明](./使用说明.md) · [验收记录](./验收记录.md)

![指尖花开国画界面](./docs/preview.png)

## 互动方式

- 一手一花，双手两花；每只手识别 21 个关键点，花心跟随食指指尖。
- 收拢成苞、舒掌盛放；把编号光标移到画布底部花牌，停留约 0.8 秒选花，进度环走满即完成。
- 双手独立停留、各选各的花；点击或触摸花牌时，先选“第一朵／第二朵”。持续停留不会重复触发，手动选择优先。
- 掌近花大、远离缩小；首次舒掌停稳半秒建立基准，缩放范围0.65–1.8倍，保持开合与距离独立。
- 花头随转腕旋转，枝叶轻摆；动作带出淡墨水纹，花心仍紧随食指。
- 牡丹、荷花、梅花、菊花、兰花搭配云山远岫、江南水乡、竹林听风、荷塘月色四种国画风景。
- 默认选择 Apple Music：载入官方播放器后，点击其中的 Play 收听四景对应曲目。应用按钮只负责载入／停止，不把“已载入”显示成“正在播放”；音量在 Apple 播放器或系统中调整。切景更换对应曲目后需再次点 Play，花型与手势不会改变录音的音色。
- 可切换“互动配乐”，使用本机原创五声音阶器乐：四景分别为56／68／74／50 BPM，江南水乡采用6/8拍。风景决定长句主旋律与配器，花型决定独立应答音色；切花保持风景长句继续，支持暂停、静音与独立音量。切换音源先停止旧音源，不叠加播放。
- 每朵花可独立选择花型；支持赏花体验、沉浸显示和 PNG 存画。截取后显示缩略图及“下载 PNG”，浏览器未自动保存时可点击重试。
- 声控默认关闭；点击“开启声控”并授权麦克风后，可说“截图”“请截图”“帮我截图”或“截个图”。普通／沉浸开关同步，否定指令不截图，连续有效指令有2.5秒冷却。
- 手部识别在浏览器本机计算，不上传摄像头画面；音乐无需麦克风。Apple Music 由第三方官方播放器联网提供，互动配乐在本机合成。声控由浏览器提供，可能使用在线识别服务，本应用不录制或保存语音。离开可见页面会停止声控和摄像头，并停止当前音源；返回后手动重新开启。

## 本地运行

需要 Node.js 22.12 或以上的受支持版本，以及 npm。

```sh
git clone https://github.com/stevexyao/fingertip-ink-garden.git
cd fingertip-ink-garden
npm ci
npm run dev
```

浏览器打开终端显示的 `http://127.0.0.1:5186/`，点击“开启摄像头”并授权。手机请使用上面的 HTTPS 网页；普通局域网 HTTP 地址不能用于手机摄像头访问。

仓库包含对应版本的模型、WASM 和字体，可直接启动。重新安装或升级 MediaPipe 后执行 `npm run assets` 同步运行资源；此命令仅在模型缺失时从 Google 官方源下载模型。

## 检查与构建

```sh
npm test
npm run build
```

生产成品位于 `dist/`。Mac 已安装 Python 3 时，构建后可双击 `启动指尖花开.command`，无需保持 Vite 开发服务器运行。`dist/` 由构建生成，不纳入 Git。

Netlify 的构建命令为 `npm run build`，发布目录为 `dist`，配置见 `netlify.toml`。GitHub 仓库用于源码版本管理。本文记录当前源码与本地验收，本次改动的部署状态另行确认。

## 实现结构

| 文件 | 职责 |
| --- | --- |
| `src/camera.ts` | 摄像头权限、生命周期、MediaPipe VIDEO 推理与频率控制 |
| `src/gestures.ts` | 手指张合、双手身份关联、位置平滑与花型记忆 |
| `src/hand-pose.ts` | 每手独立远近基准、旋转、动作强度与异常保护 |
| `src/apple-music.ts` | 官方单 iframe 载入／停止、四景曲目、超时与迟到回调隔离 |
| `src/music.ts` | 本机互动配乐：四景长句主旋律、花型应答双轨、平滑切换、手势装饰和音量 |
| `src/voice-capture.ts` | 显式开启的中文语音指令、去重冷却、错误分类与监听生命周期 |
| `src/landscape.ts` | 四景程序绘制，与宣纸一起缓存 |
| `src/dwell-selector.ts` | 每手独立的 800ms 停留、进度、防误触与取消 |
| `src/hand-slots.ts` | 将两个控制槽固定绑定到手的身份 |
| `src/ink-renderer.ts` | 宣纸、枝叶、五类花朵及花瓣开合 |
| `src/main.ts`、`src/style.css` | 响应式工作台、预览、音源切换、官方播放器挂载与交互 |
| `public/models`、`public/wasm` | 与站点同源提供的手部识别资源 |

## 已知边界

当前122项单元测试、生产构建、23项Apple页面检查、22项互动配乐及18项声控回归通过。在应用内真实官方iframe中验证了匿名试听播放时钟持续前进；5项横屏截图专项检查确认下载入口可点击且不重建播放器。完整原始记录保存在内部开发目录，结果与边界见[验收记录](./验收记录.md)。[Apple Music 播放说明](./docs/apple-music-player.md) · [互动配乐与姿态实现说明](./docs/landscape-music-pose.md) · [声控存画说明](./docs/voice-capture.md) · [停留选花说明](./docs/dwell-selection.md)

自动模拟验证不等于真人摄像头实测，真实 iPhone／Android 摄像头尚未逐台验收。请观察画面中“一／二”光标的位置，将光标移到花牌上；保持手掌完整入镜，避免遮挡或高速交叉。识别间隔超过400ms时会重新计时，可随时点击或触摸选花。远近为视觉相对估计，严重侧掌或遮挡时保持上一有效姿态。

声控尚无真人麦克风实测，实际支持与识别结果取决于浏览器、系统权限及识别服务。互动配乐已检查乐谱结构、声音信号与切换链路，真人扬声器听感仍需试听；这些检查不证明主观音色或演奏自然度。Apple Music 尚无已登录且具有效订阅的真人完整播放实测；预览／完整播放由 Apple 按账号、地区与服务状态决定，应用无法读取跨域播放器的真实播放进度。

## 运行资源

- 手部识别：[Google MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)，运行库固定为 `@mediapipe/tasks-vision@1.2.2`。
- 模型：[Google 官方 Hand Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)。
- 中文标题字体：Noto Serif SC 本地子集，[SIL Open Font License 1.1](./public/fonts/OFL.txt)。
- 花朵、宣纸、四景、水纹与印章均由程序绘制；“互动配乐”为本机原创程序化作曲与合成，并非乐器实录。
- [Apple Music 四景曲目](./docs/apple-music-shortlist.md)通过官方播放器嵌入，由 Apple 提供音频与账号流程；本项目不下载、托管录音，也不循环拼接试听片段。官方嵌入无需配置本项目的 MusicKit developer key；使用条件见[播放器说明](./docs/apple-music-player.md)。
