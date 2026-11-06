export interface VoiceCaptureStatus {
  enabled: boolean;
  listening: boolean;
  message: string;
  supported: boolean;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string } | undefined;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult | undefined };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
type RecognitionConstructor = new () => Recognition;

const COOLDOWN_MS = 2500;
const MAX_SHORT_RESTARTS = 4;
const HEALTHY_SESSION_MS = 1500;
const UNSUPPORTED = '当前浏览器不支持语音识别，仍可点击“存画”保存画面。';
const OFF = '声控已关闭，仍可点击“存画”保存画面。';
const normalize = (text: string): string => text.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').replaceAll('圖', '图');

function isCaptureCommand(result: RecognitionResult): boolean {
  const transcripts: string[] = [];
  for (let i = 0; i < result.length; i++) {
    const transcript = result[i]?.transcript;
    if (typeof transcript === 'string') transcripts.push(normalize(transcript));
  }
  // Do not let a lower-ranked positive alternative override a negative command.
  if (transcripts.some(text => /不要|别|取消|不用|不必|不许|不想|不需要|禁止|停止|请勿|勿/.test(text))) return false;
  return transcripts.some(text => /^(?:(?:请)?帮我|请)?(?:截图|截个图)(?:一下|吧|谢谢)?$/.test(text));
}

function recognitionConstructor(): RecognitionConstructor | null {
  const browser = globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  if (typeof browser.SpeechRecognition === 'function') return browser.SpeechRecognition;
  return typeof browser.webkitSpeechRecognition === 'function' ? browser.webkitSpeechRecognition : null;
}

function failureMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
      return '麦克风权限未开启，请在浏览器允许麦克风后重新开启声控；仍可点击“存画”。';
    case 'service-not-allowed':
      return '浏览器未允许当前语音识别服务，请检查权限或改用支持的浏览器；仍可点击“存画”。';
    case 'network':
      return '语音识别服务连接失败，请检查网络后手动重试；仍可点击“存画”。';
    case 'audio-capture':
      return '麦克风暂时无法使用，请检查设备或其他应用占用后重试；仍可点击“存画”。';
    case 'language-not-supported':
      return '当前语音服务不支持中文识别，请更换浏览器或点击“存画”。';
    case 'aborted':
      return '语音监听已中断，可点击重新开启声控；仍可点击“存画”。';
    default:
      return '声控暂时无法开启，请重新尝试；仍可点击“存画”保存画面。';
  }
}

function startFailureCode(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed';
  if (name === 'NotFoundError' || name === 'NotReadableError') return 'audio-capture';
  if (name === 'NetworkError') return 'network';
  if (name === 'AbortError') return 'aborted';
  return 'unknown';
}

/** Explicitly enabled browser recognition. This module does not record audio,
 * save transcripts, or choose a speech service; the browser owns recognition.
 */
export class VoiceCapture {
  private readonly Constructor = recognitionConstructor();
  private recognition: Recognition | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private listening = false;
  private disposed = false;
  private generation = 0;
  private shortRestarts = 0;
  private lastCaptureAt = -Infinity;

  constructor(private onCapture: () => void, private onStatus: (status: VoiceCaptureStatus) => void) {
    this.emit(this.Constructor ? '声控未开启，点击后可说“截图”保存画面。' : UNSUPPORTED);
  }

  start(): void {
    if (this.disposed || this.enabled) return;
    if (!this.Constructor) { this.emit(UNSUPPORTED); return; }
    if (globalThis.isSecureContext === false) {
      this.emit('请通过 HTTPS 或本机地址打开页面后再开启声控；仍可点击“存画”。');
      return;
    }
    this.enabled = true;
    this.shortRestarts = 0;
    this.openSession();
  }

  stop(): void {
    this.enabled = false;
    this.listening = false;
    ++this.generation;
    this.cancelRestart();
    this.closeRecognition();
    this.emit(this.Constructor ? OFF : UNSUPPORTED);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  private openSession(): void {
    if (!this.enabled || this.disposed || !this.Constructor) return;
    const generation = ++this.generation;
    let recognition: Recognition;
    try { recognition = new this.Constructor(); }
    catch (error) { this.fail(failureMessage(startFailureCode(error))); return; }
    this.recognition = recognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const processedFinals = new Set<number>();
    let sessionStartedAt = performance.now();
    let hadSpeech = false;
    let quiet = false;
    const active = () => this.enabled && !this.disposed && generation === this.generation && this.recognition === recognition;

    recognition.onstart = () => {
      if (!active()) return;
      sessionStartedAt = performance.now();
      this.listening = true;
      this.emit('声控已开启，说“截图”即可存画。');
    };
    recognition.onresult = event => {
      if (!active() || !event.results || !Number.isInteger(event.resultIndex)) return;
      for (let index = Math.max(0, event.resultIndex); index < event.results.length && active(); index++) {
        const result = event.results[index];
        if (!result?.isFinal || processedFinals.has(index)) continue;
        processedFinals.add(index);
        for (let alternative = 0; alternative < result.length; alternative++) {
          if (typeof result[alternative]?.transcript === 'string' && result[alternative]!.transcript.trim()) hadSpeech = true;
        }
        if (!isCaptureCommand(result)) continue;
        const now = performance.now();
        if (now - this.lastCaptureAt < COOLDOWN_MS) continue;
        this.lastCaptureAt = now;
        try {
          this.onCapture();
          if (active()) this.emit('已识别截图指令，声控继续监听。');
        } catch {
          if (active()) this.emit('已识别截图指令，请点击“存画”完成保存。');
        }
      }
    };
    recognition.onerror = event => {
      if (!active()) return;
      this.listening = false;
      if (event.error === 'no-speech') {
        quiet = true;
        this.emit('暂未听到语音，将继续等待“截图”指令。');
      } else this.fail(failureMessage(event.error));
    };
    recognition.onend = () => {
      if (!active()) return;
      this.listening = false;
      this.detach(recognition);
      this.recognition = null;
      const healthy = hadSpeech || performance.now() - sessionStartedAt >= HEALTHY_SESSION_MS;
      this.shortRestarts = healthy ? 0 : this.shortRestarts + 1;
      if (this.shortRestarts > MAX_SHORT_RESTARTS) {
        this.fail('声控多次中断，请点击重新开启；仍可点击“存画”。');
        return;
      }
      const delay = Math.min(2000, 250 * 2 ** Math.max(0, this.shortRestarts - 1));
      this.emit(quiet ? '暂未听到语音，正在恢复监听；也可点击“存画”。' : '声控正在恢复监听；仍可点击“存画”。');
      if (!this.enabled || this.disposed || generation !== this.generation) return;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (this.enabled && !this.disposed && generation === this.generation) this.openSession();
      }, delay);
    };
    this.listening = false;
    this.emit('正在开启声控，请允许浏览器使用麦克风。');
    if (!active()) return;
    try { recognition.start(); }
    catch (error) { if (active()) this.fail(failureMessage(startFailureCode(error))); }
  }

  private fail(message: string): void {
    this.enabled = false;
    this.listening = false;
    ++this.generation;
    this.cancelRestart();
    this.closeRecognition();
    this.emit(message);
  }

  private closeRecognition(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    this.detach(recognition);
    try { if (recognition.abort) recognition.abort(); else recognition.stop(); }
    catch { /* Already ended or never started. */ }
  }

  private detach(recognition: Recognition): void {
    recognition.onstart = null; recognition.onend = null; recognition.onresult = null; recognition.onerror = null;
  }

  private cancelRestart(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private emit(message: string): void {
    this.onStatus({ enabled: this.enabled, listening: this.listening, message, supported: Boolean(this.Constructor) });
  }
}
