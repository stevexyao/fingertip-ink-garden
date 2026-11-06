import type { LandscapeType } from './landscape';

export interface AppleMusicTrack {
  readonly title: string;
  readonly artist: string;
  readonly url: string;
  readonly embedUrl: string;
}

function track(title: string, artist: string, url: string): AppleMusicTrack {
  // Apple's official player preserves the catalog path and song query parameter.
  // https://artists.apple.com/support/1117-apple-music-marketing-tools
  const embed = new URL(url);
  embed.hostname = 'embed.music.apple.com';
  return Object.freeze({ title, artist, url, embedUrl: embed.href });
}

export const APPLE_MUSIC_TRACKS: Readonly<Record<LandscapeType, AppleMusicTrack>> = Object.freeze({
  mountains: track('平沙落雁', '杨青', 'https://music.apple.com/cn/album/%E5%B9%B3%E6%B2%99%E8%90%BD%E9%9B%81/1610963434?i=1610963755'),
  waterside: track('春江花月夜', '赵聪 & 刘兴辰', 'https://music.apple.com/cn/album/%E6%98%A5%E6%B1%9F%E8%8A%B1%E6%9C%88%E5%A4%9C/1848682167?i=1848682174'),
  bamboo: track('绿野仙踪', '陈悦', 'https://music.apple.com/cn/album/%E7%BB%BF%E9%87%8E%E4%BB%99%E8%B8%AA/1874486824?i=1874486830'),
  moonlake: track('乱红', '陈悦', 'https://music.apple.com/cn/album/%E4%B9%B1%E7%BA%A2/1874486824?i=1874486831'),
});

export interface AppleMusicStatus {
  enabled: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  track: AppleMusicTrack;
  message: string;
}

/** A visible official player. Playback and sign-in stay in Apple's own controls. */
export class AppleMusicPlayer {
  private scene: LandscapeType = 'waterside';
  private enabled = false;
  private phase: AppleMusicStatus['phase'] = 'idle';
  private message = '点击载入 Apple Music，再在官方播放器中播放。';
  private frame: HTMLIFrameElement | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private container: HTMLElement, private onStatus: (status: AppleMusicStatus) => void) {
    this.emit();
  }

  setScene(scene: LandscapeType): void {
    if (this.disposed || scene === this.scene) return;
    this.scene = scene;
    if (this.enabled) this.mount();
    else {
      this.message = `已选《${APPLE_MUSIC_TRACKS[scene].title}》，点击载入 Apple Music。`;
      this.emit();
    }
  }

  load(): void {
    if (this.disposed || (this.frame && (this.phase === 'loading' || this.phase === 'ready'))) return;
    this.enabled = true;
    this.mount();
  }

  stop(): void {
    if (this.disposed || (!this.enabled && this.phase === 'idle')) return;
    this.releaseFrame();
    this.enabled = false;
    this.phase = 'idle';
    this.message = 'Apple Music 已停止，点击载入可重新打开。';
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    const notify = this.enabled || this.phase !== 'idle';
    // Mark terminal before notifying observers, which may themselves call load().
    this.disposed = true;
    this.releaseFrame();
    this.enabled = false;
    this.phase = 'idle';
    this.message = 'Apple Music 已停止，点击载入可重新打开。';
    if (notify) this.emit();
  }

  private mount(): void {
    this.releaseFrame();
    const generation = this.generation;
    const selected = APPLE_MUSIC_TRACKS[this.scene];
    this.phase = 'loading';
    this.message = `正在载入 Apple Music《${selected.title}》…`;
    try {
      const frame = this.container.ownerDocument.createElement('iframe');
      this.frame = frame;
      frame.title = `Apple Music：${selected.artist}《${selected.title}》`;
      frame.allow = 'autoplay *; encrypted-media *; fullscreen *';
      frame.width = '100%';
      frame.height = '175';
      frame.setAttribute('frameborder', '0');
      const current = () => !this.disposed && this.enabled && this.generation === generation && this.frame === frame && this.phase === 'loading';
      frame.onload = () => {
        if (!current()) return;
        this.clearDeadline();
        frame.onload = null;
        frame.onerror = null;
        this.phase = 'ready';
        // A cross-origin iframe load cannot report playback, authentication or entitlement.
        this.message = `已载入《${selected.title}》，请在 Apple 播放器中点击播放；完整收听需 Apple Music 登录与有效订阅。`;
        this.emit();
      };
      frame.onerror = () => {
        if (current()) this.fail('Apple Music 播放器未能载入，请重试或在 Apple Music 中打开。');
      };
      this.timeout = setTimeout(() => {
        if (current()) this.fail('Apple Music 载入超时，请重试或在 Apple Music 中打开。');
      }, 20_000);
      frame.src = selected.embedUrl;
      this.container.appendChild(frame);
    } catch {
      this.fail('Apple Music 播放器未能载入，请重试或在 Apple Music 中打开。');
      return;
    }
    this.emit();
  }

  private fail(message: string): void {
    this.releaseFrame();
    this.phase = 'error';
    this.message = message;
    this.emit();
  }

  private clearDeadline(): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private releaseFrame(): void {
    this.generation++;
    this.clearDeadline();
    if (this.frame) {
      this.frame.onload = null;
      this.frame.onerror = null;
      // Removing the browsing context also stops any music playing inside it.
      this.frame.remove();
      this.frame = null;
    }
  }

  private emit(): void {
    this.onStatus({ enabled: this.enabled, phase: this.phase, track: APPLE_MUSIC_TRACKS[this.scene], message: this.message });
  }
}
