> 此文件记录初始版本。当前交互已改为[指尖停留选花](./dwell-selection.md)，不再通过挥手切花。

# 指尖花开 Implementation Plan

**Goal:** 交付电脑与手机可用的中国国画风双手花朵互动网页，以及本地启动和HTTPS分享入口。

**Architecture:** TypeScript + Vite 静态网页，MediaPipe本机识别21点，独立双手状态机驱动Canvas 2D宣纸与写意花卉。识别模型、WASM同源部署，无服务端API。

## Global Constraints
- 一手一花、双手双花；食指尖为花中心；张合控制大小及展开；左右挥手仅切对应花型。
- 中国国画风：宣纸、笔墨、淡彩、留白、朱印；五种花为牡丹、荷花、梅花、菊花、兰花。
- 摄像头由用户点击启用，不请求音频；停止与离页释放轨道；移动端HTTPS。
- 真机识别与模拟测试分别报告，不虚报手机摄像头验收。

## Task 1: 双手手势状态机
- [x] 先写有区分力的开放度、挥手防误触、顺序变化、交叉、丢手/重入单元测试，运行观察失败。
- [x] 实现src/gestures.ts：HandGestureTracker.update(observations,time)、getHands(time)、setFlower(id,type)、cycleFlower(id,direction)、clear()；纯函数computeOpenness()。
- [x] 使用掌心/handedness关联各自状态；镜像后判断挥动；冷却900ms与稳定200ms；交叉/重入清轨迹。
- [x] 跑测试与类型检查；报告实际结果。

## Task 2: 国画绘制器
- [x] 实现src/ink-renderer.ts：InkGardenRenderer(canvas)、resize(width,height,dpr)、render(FlowerState[],time)、exportPng()。
- [x] 缓存宣纸及确定性笔触，绘制五种具有不同花形/枝叶的写意花，随openness舒展；最多两花。
- [x] 浏览器逐种花检查，保证花苞到盛放、移动端比例和导出均可用。

## Task 3: 页面、摄像头与交付
- [x] 创建响应式工作台：画布、21点预览、双花状态、花型选择、全屏、保存PNG、操作说明和体验模式。
- [x] 使用MediaPipe VIDEO numHands=2，处理新视频帧；WASM CPU优先，慢设备降低识别频率；模型/WASM随构建部署。GPU软件模拟首帧曾耗33.7秒，CPU对照0.313秒，因此默认CPU。
- [x] 测试无权限/无摄像头/加载失败/关闭重开/横竖屏；Playwright本机及窄屏检查并截图。
- [x] 交付源码、dist、双击启动入口、中文说明；内部磁盘留副本，再复制到课程目录。
- [x] HTTPS发布，检查线上模型与页面资源；凭据确实受阻时交付全部本地成品并明确最后发布条件。
