import type { HandObservation, Handedness } from './types';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

export type CameraPhase = 'idle' | 'loading' | 'running' | 'error';
export interface CameraStatus { phase: CameraPhase; message: string; fps?: number }

export class HandCamera {
  private stream: MediaStream | null = null;
  private model: HandLandmarker | null = null;
  private generation = 0;
  private frame = 0;
  private lastVideoTime = -1;
  private lastInference = 0;
  private interval = 50;
  private lastSample = 0;
  private samples = 0;
  private phase: CameraPhase = 'idle';

  constructor(
    private video: HTMLVideoElement,
    private onResults: (hands: HandObservation[], time: number) => void,
    private onStatus: (status: CameraStatus) => void,
  ) {}

  async start(): Promise<void> {
    if (this.phase === 'loading' || this.phase === 'running') return;
    const generation = ++this.generation;
    this.setStatus('loading', '正在准备笔墨与摄像头…');
    try {
      if (!window.isSecureContext) throw new Error('请通过 HTTPS 链接或本机 localhost 打开，才能使用摄像头。');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器无法调用摄像头，请用 Safari 或 Chrome 打开。');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.setStatus('loading', '摄像头已就绪，正在加载手部识别…');
      const { FilesetResolver, HandLandmarker: Model } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(new URL('wasm/', document.baseURI).href);
      if (generation !== this.generation) return;
      const options = {
        // WASM CPU avoids slow software-WebGL startup on unsupported GPUs.
        baseOptions: { modelAssetPath: new URL('models/hand_landmarker.task', document.baseURI).href, delegate: 'CPU' as const },
        runningMode: 'VIDEO' as const,
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      };
      const model: HandLandmarker = await Model.createFromOptions(vision, options);
      if (generation !== this.generation) { model.close(); return; }
      this.model = model;
      this.lastVideoTime = -1;
      this.lastInference = 0;
      this.lastSample = performance.now();
      this.samples = 0;
      this.setStatus('running', '请将一只或两只手放入画面');
      this.frame = requestAnimationFrame(this.detect);
    } catch (error) {
      if (generation !== this.generation) return;
      this.release();
      this.setStatus('error', cameraError(error));
    }
  }

  stop(): void {
    ++this.generation;
    this.release();
    this.onResults([], performance.now());
    this.setStatus('idle', '摄像头已关闭');
  }

  private release(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.model?.close();
    this.model = null;
    this.interval = 50;
  }

  private setStatus(phase: CameraPhase, message: string): void {
    this.phase = phase;
    this.onStatus({ phase, message });
  }

  private detect = (now: number): void => {
    if (this.phase !== 'running' || !this.model) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && now - this.lastInference >= this.interval) {
      this.lastVideoTime = this.video.currentTime;
      this.lastInference = now;
      try {
        const start = performance.now();
        const result = this.model.detectForVideo(this.video, now);
        if (performance.now() - start > 65) this.interval = 100;
        const hands: HandObservation[] = result.landmarks.map((landmarks, i) => {
          const category = result.handedness[i]?.[0];
          const name = category?.categoryName;
          const handedness: Handedness = name === 'Left' || name === 'Right' ? name : 'Unknown';
          return { landmarks, worldLandmarks: result.worldLandmarks[i], handedness,
            confidence: category?.score ?? 0, imageAspect: this.video.videoWidth / this.video.videoHeight };
        });
        // A slow inference must still be fresh when its result reaches the UI.
        this.onResults(hands, performance.now());
        this.samples++;
        if (now - this.lastSample >= 1200) {
          this.onStatus({ phase: 'running', message: hands.length ? '手部追踪中' : '请将手掌放入画面', fps: Math.round(this.samples * 1000 / (now - this.lastSample)) });
          this.samples = 0;
          this.lastSample = now;
        }
      } catch (error) {
        this.release();
        this.onResults([], now);
        this.setStatus('error', '识别暂时中断，请重新开启摄像头。' + (error instanceof Error && error.message.includes('fetch') ? '请检查网络。' : ''));
        return;
      }
    }
    this.frame = requestAnimationFrame(this.detect);
  };
}

export function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return '摄像头权限未开启。请在浏览器地址栏允许摄像头，再点重试。';
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return '没有找到摄像头。请连接摄像头，或用带前置摄像头的手机打开。';
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') return '摄像头暂时无法使用。请关闭其他占用摄像头的应用后重试。';
    if (error.name === 'OverconstrainedError') return '摄像头不支持当前设置，请换一个摄像头或浏览器重试。';
  }
  if (error instanceof Error && /HTTPS|当前浏览器/.test(error.message)) return error.message;
  return '手部识别资源未能加载。请检查网络后重试，或先使用赏花体验。';
}
