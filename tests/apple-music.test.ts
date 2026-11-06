import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/apple-music';
import type { AppleMusicStatus as Status, AppleMusicPlayer as Player } from '../src/apple-music';
class Frame {
  src = ''; title = ''; allow = ''; width = ''; height = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  attributes = new Map<string, string>();
  parent: Container | null = null;
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  remove() {
    if (this.parent) this.parent.frames = this.parent.frames.filter(frame => frame !== this);
    this.parent = null;
  }
}
class Container {
  frames: Frame[] = [];
  created: Frame[] = [];
  ownerDocument = {
    createElement: (tag: string) => {
      assert.equal(tag, 'iframe');
      const frame = new Frame(); this.created.push(frame); return frame;
    },
  };
  appendChild(frame: Frame) { frame.parent = this; this.frames.push(frame); return frame; }
}

function fixture(run: (state: {
  container: Container; statuses: Status[]; player: Player;
  timers: Map<ReturnType<typeof setTimeout>, { delay: number; callback: () => void }>;
}) => void, onStatus?: (status: Status) => void) {
  assert.equal(typeof api.AppleMusicPlayer, 'function', 'AppleMusicPlayer must be implemented');
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map<ReturnType<typeof setTimeout>, { delay: number; callback: () => void }>();
  let timerId = 0;
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    const id = ++timerId as unknown as ReturnType<typeof setTimeout>;
    timers.set(id, { callback, delay }); return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => { timers.delete(id); }) as typeof clearTimeout;
  const container = new Container(); const statuses: Status[] = [];
  const player: Player = new api.AppleMusicPlayer(container as unknown as HTMLElement, (status: Status) => {
    statuses.push(status); onStatus?.(status);
  });
  try { run({ container, statuses, player, timers }); }
  finally { player.dispose(); globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
}

test('four landscape tracks preserve the verified Apple catalog song IDs on the official embed host', () => {
  assert.ok(api.APPLE_MUSIC_TRACKS, 'the scene-to-recording registry must be implemented');
  const expected = {
    mountains: ['平沙落雁', '杨青', '1610963434', '1610963755'],
    waterside: ['春江花月夜', '赵聪 & 刘兴辰', '1848682167', '1848682174'],
    bamboo: ['绿野仙踪', '陈悦', '1874486824', '1874486830'],
    moonlake: ['乱红', '陈悦', '1874486824', '1874486831'],
  };
  for (const [scene, [title, artist, album, song]] of Object.entries(expected)) {
    const track = api.APPLE_MUSIC_TRACKS[scene as keyof typeof expected];
    assert.equal(track.title, title); assert.equal(track.artist, artist);
    const link = new URL(track.url), embed = new URL(track.embedUrl);
    assert.equal(link.hostname, 'music.apple.com');
    assert.equal(embed.hostname, 'embed.music.apple.com');
    assert.equal(embed.protocol, 'https:');
    assert.equal(embed.pathname, link.pathname);
    assert.ok(embed.pathname.startsWith('/cn/album/'));
    assert.ok(embed.pathname.endsWith(`/${album}`));
    assert.equal(embed.searchParams.get('i'), song);
    assert.equal(embed.searchParams.get('autoplay'), null, 'loading never starts a preview automatically');
  }
});

test('construction and idle scene selection make no Apple frame or timer until an explicit load', () => fixture(({ container, statuses, player, timers }) => {
  assert.equal(container.created.length, 0); assert.equal(timers.size, 0);
  assert.equal(statuses.at(-1)!.phase, 'idle');
  player.setScene('moonlake');
  assert.equal(statuses.at(-1)!.track.title, '乱红');
  assert.equal(statuses.at(-1)!.enabled, false);
  assert.equal(container.created.length, 0); assert.equal(timers.size, 0);
}));

test('load creates one accessible official frame and a 20-second loading deadline', () => fixture(({ container, statuses, player, timers }) => {
  player.load();
  assert.equal(container.frames.length, 1);
  const frame = container.frames[0]!;
  assert.equal(frame.src, api.APPLE_MUSIC_TRACKS.waterside.embedUrl);
  assert.match(frame.title, /Apple Music/); assert.match(frame.title, /春江花月夜/); assert.match(frame.title, /赵聪/);
  assert.equal(frame.allow, 'autoplay *; encrypted-media *; fullscreen *');
  assert.equal(statuses.at(-1)!.phase, 'loading'); assert.equal(statuses.at(-1)!.enabled, true);
  assert.equal(timers.size, 1); assert.equal([...timers.values()][0]!.delay, 20_000);
  player.load(); player.setScene('waterside');
  assert.equal(container.created.length, 1, 'repeated selection cannot restart the iframe');
  assert.equal(timers.size, 1);
}));

test('iframe load means ready to use Apple controls and never claims the song is playing', () => fixture(({ container, statuses, player, timers }) => {
  player.load(); container.frames[0]!.onload?.();
  const state = statuses.at(-1)!;
  assert.equal(state.phase, 'ready'); assert.equal(timers.size, 0);
  assert.match(state.message, /点击.*播放/); assert.match(state.message, /订阅/);
  assert.doesNotMatch(state.message, /正在播放|播放中|已开始播放/);
  player.load(); assert.equal(container.created.length, 1);
}));

test('scene switching replaces the old browsing context and isolates its late events', () => fixture(({ container, statuses, player, timers }) => {
  player.load();
  const old = container.frames[0]!, lateLoad = old.onload!, lateError = old.onerror!;
  const lateTimeout = [...timers.values()][0]!.callback;
  player.setScene('bamboo');
  assert.equal(old.parent, null); assert.equal(old.onload, null); assert.equal(old.onerror, null);
  assert.equal(container.frames.length, 1); assert.equal(timers.size, 1);
  assert.equal(container.frames[0]!.src, api.APPLE_MUSIC_TRACKS.bamboo.embedUrl);
  const count = statuses.length;
  lateLoad(); lateError(); lateTimeout();
  assert.equal(statuses.length, count); assert.equal(statuses.at(-1)!.track.title, '绿野仙踪');
  assert.equal(statuses.at(-1)!.phase, 'loading');
  container.frames[0]!.onload?.(); assert.equal(statuses.at(-1)!.phase, 'ready');
}));

test('load timeout removes the failed frame, tells the truth and supports an explicit retry', () => fixture(({ container, statuses, player, timers }) => {
  player.load();
  const old = container.frames[0]!, lateLoad = old.onload!;
  [...timers.values()][0]!.callback();
  assert.equal(statuses.at(-1)!.phase, 'error'); assert.equal(container.frames.length, 0); assert.equal(timers.size, 0);
  assert.match(statuses.at(-1)!.message, /重试/);
  lateLoad(); assert.equal(statuses.at(-1)!.phase, 'error');
  player.load(); assert.equal(container.created.length, 2); assert.equal(statuses.at(-1)!.phase, 'loading');
  assert.equal(container.frames.length, 1); assert.equal(timers.size, 1);
}));

test('iframe errors remove the frame and a late error cannot undo successful readiness', () => fixture(({ container, statuses, player, timers }) => {
  player.load(); container.frames[0]!.onerror?.();
  assert.equal(statuses.at(-1)!.phase, 'error'); assert.equal(container.frames.length, 0); assert.equal(timers.size, 0);
  player.load(); const lateError = container.frames[0]!.onerror!; container.frames[0]!.onload?.();
  lateError(); assert.equal(statuses.at(-1)!.phase, 'ready'); assert.equal(container.frames.length, 1);
}));

test('stop clears the frame and pending work, remembers the scene and can load again', () => fixture(({ container, statuses, player, timers }) => {
  player.setScene('mountains'); player.load();
  const lateLoad = container.frames[0]!.onload!, lateTimeout = [...timers.values()][0]!.callback;
  player.stop();
  assert.equal(statuses.at(-1)!.phase, 'idle'); assert.equal(statuses.at(-1)!.enabled, false);
  assert.equal(container.frames.length, 0); assert.equal(timers.size, 0);
  const count = statuses.length; lateLoad(); lateTimeout(); player.stop();
  assert.equal(statuses.length, count);
  player.load(); assert.equal(container.frames[0]!.src, api.APPLE_MUSIC_TRACKS.mountains.embedUrl);
}));

test('rapid scene changes retain only one frame and dispose is terminal and idempotent', () => fixture(({ container, statuses, player, timers }) => {
  player.load();
  for (const scene of ['mountains', 'bamboo', 'moonlake', 'waterside'] as const) {
    player.setScene(scene); assert.equal(container.frames.length, 1); assert.equal(timers.size, 1);
  }
  const lateLoad = container.frames[0]!.onload!;
  player.dispose(); const count = statuses.length;
  lateLoad(); player.load(); player.setScene('moonlake'); player.stop(); player.dispose();
  assert.equal(container.frames.length, 0); assert.equal(timers.size, 0);
  assert.equal(statuses.length, count); assert.equal(statuses.at(-1)!.enabled, false);
}));

test('a status observer cannot reload a player during its terminal dispose notification', () => {
  let observed: Player | null = null;
  fixture(({ container, statuses, player, timers }) => {
    player.load(); observed = player; player.dispose();
    assert.equal(container.frames.length, 0); assert.equal(timers.size, 0);
    assert.equal(statuses.at(-1)!.enabled, false);
  }, status => { if (status.phase === 'idle') observed?.load(); });
});
