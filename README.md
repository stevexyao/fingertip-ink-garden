# 指尖花开 · 中国国画互动花园

以手为笔，让花开在指尖。通过摄像头识别一只或两只手，每只手对应一朵国画花卉；手指张合控制花苞到盛放，靠近镜头放大花朵，转腕带动花头；指尖停留选花，伴随原创国风器乐与四时山水。

**[在线体验](https://fingertip-ink-garden-1105-7fa6.netlify.app)** · [完整使用说明](./使用说明.md) · [验收记录](./验收记录.md)

![指尖花开国画界面](./docs/preview.png)

## 互动方式

- 一手一花，双手两花；每只手识别 21 个关键点，花心跟随食指指尖。
- 收拢成苞、舒掌盛放；把编号光标移到画布底部花牌，停留约 0.8 秒选花，进度环走满即完成。
- 双手独立停留、各选各的花；点击或触摸花牌时，先选“第一朵／第二朵”。持续停留不会重复触发，手动选择优先。
- 掌近花大、远离缩小；首次舒掌停稳半秒建立基准，缩放范围0.65–1.8倍，保持开合与距离独立。
- 花头随转腕旋转，枝叶轻摆；动作带出淡墨水纹，花心仍紧随食指。
- 牡丹、荷花、梅花、菊花、兰花搭配云山远岫、江南水乡、竹林听风、荷塘月色四种国画风景。
- 点击“开启音乐”播放原创68BPM五声音阶器乐，摆动增添节拍内拨弦；支持播放／暂停、静音与独立音量，沉浸模式也可调节。
- 每朵花可独立选择花型；支持赏花体验、沉浸显示和 PNG 存画。
- 摄像头在浏览器本机识别，不上传视频、不请求麦克风；关闭摄像头或离开页面后释放媒体轨道。

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

Netlify 的构建命令为 `npm run build`，发布目录为 `dist`，配置见 `netlify.toml`。GitHub 仓库用于源码版本管理；现有线上站点已独立发布。

## 实现结构

| 文件 | 职责 |
| --- | --- |
| `src/camera.ts` | 摄像头权限、生命周期、MediaPipe VIDEO 推理与频率控制 |
| `src/gestures.ts` | 手指张合、双手身份关联、位置平滑与花型记忆 |
| `src/hand-pose.ts` | 每手独立远近基准、旋转、动作强度与异常保护 |
| `src/music.ts` | 本机原创五声旋律、拨弦／箫笛感音色、手势装饰和音量 |
| `src/landscape.ts` | 四景程序绘制，与宣纸一起缓存 |
| `src/dwell-selector.ts` | 每手独立的 800ms 停留、进度、防误触与取消 |
| `src/hand-slots.ts` | 将两个控制槽固定绑定到手的身份 |
| `src/ink-renderer.ts` | 宣纸、枝叶、五类花朵及花瓣开合 |
| `src/main.ts`、`src/style.css` | 响应式工作台、预览与交互 |
| `public/models`、`public/wasm` | 与站点同源提供的手部识别资源 |

## 已知边界

自动验证涵盖手部关联、停留、远近、转腕、音乐调度和音量。页面检查使用真实Web Audio输出与官方手图检测出的21点受控输入，真实模型另对缩放、旋转后的图片推理。[山水与音乐交互说明](./docs/landscape-music-pose.md) · [停留选花说明](./docs/dwell-selection.md)

自动模拟验证不等于真人摄像头实测，真实 iPhone／Android 摄像头尚未逐台验收。请观察画面中“一／二”光标的位置，将光标移到花牌上；保持手掌完整入镜，避免遮挡或高速交叉。识别间隔超过400ms时会重新计时，可随时点击或触摸选花。远近为视觉相对估计，严重侧掌或遮挡时保持上一有效姿态。

## 运行资源

- 手部识别：[Google MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)，运行库固定为 `@mediapipe/tasks-vision@1.2.2`。
- 模型：[Google 官方 Hand Landmarker float16 v1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)。
- 中文标题字体：Noto Serif SC 本地子集，[SIL Open Font License 1.1](./public/fonts/OFL.txt)。
- 花朵、宣纸、四景、水纹与印章均由程序绘制；音乐是本机原创程序化作曲与合成，并非乐器实录或外部曲库。
