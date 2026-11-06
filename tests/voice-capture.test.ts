import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceCapture } from '../src/voice-capture';

type Status = { enabled: boolean; listening: boolean; supported: boolean; message: string };
type Result = { isFinal: boolean; length: number; [index: number]: { transcript: string } };
type ResultEvent = { resultIndex: number; results: Result[] };

class Recognition {
  static instances: Recognition[] = [];
  static autoStart = true;
  static startError: Error | null = null;
  lang = ''; continuous = false; interimResults = true; maxAlternatives = 1;
  starts = 0; stops = 0; aborts = 0;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  constructor() { Recognition.instances.push(this); }
  start() {
    this.starts++;
    if (Recognition.startError) { const error = Recognition.startError; Recognition.startError = null; throw error; }
    if (Recognition.autoStart) this.onstart?.();
  }
  stop() { this.stops++; this.onend?.(); }
  abort() { this.aborts++; this.onend?.(); }
  result(transcripts: string[], index = 0, isFinal = true) {
    const result = Object.assign(transcripts.map(transcript => ({ transcript })), { isFinal });
    const results: Result[] = Array.from({ length: index + 1 }, () => Object.assign([{ transcript: '聊天' }], { isFinal: true }));
    results[index] = result;
    this.onresult?.({ resultIndex: index, results });
  }
  error(error: string) { this.onerror?.({ error }); }
  end() { this.onend?.(); }
}

function harness(run: (state: {
  create: (onCapture?: () => void, onStatus?: (status: Status) => void) => VoiceCapture;
  tick: (milliseconds: number) => void;
  statuses: Status[];
  captures: () => number;
  timers: () => number;
}) => void, options: { supported?: boolean; prefixed?: boolean } = {}) {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  const performanceNow = Object.getOwnPropertyDescriptor(performance, 'now');
  const scheduled = new Map<number, { at: number; callback: () => void }>();
  let now = 0, timerId = 0, captureCount = 0;
  Recognition.instances = []; Recognition.autoStart = true; Recognition.startError = null;
  const statuses: Status[] = [];
  replace('SpeechRecognition', options.supported === false || options.prefixed ? undefined : Recognition);
  replace('webkitSpeechRecognition', options.prefixed ? Recognition : undefined);
  replace('isSecureContext', true);
  replace('setTimeout', (callback: () => void, delay = 0) => {
    const id = ++timerId; scheduled.set(id, { at: now + Number(delay), callback }); return id;
  });
  replace('clearTimeout', (id: number) => { scheduled.delete(id); });
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  const players: VoiceCapture[] = [];
  try {
    run({
      create(onCapture, onStatus) {
        const player = new VoiceCapture(onCapture ?? (() => { captureCount++; }), status => { statuses.push(status); onStatus?.(status); });
        players.push(player); return player;
      },
      statuses, captures: () => captureCount, timers: () => scheduled.size,
      tick(milliseconds) {
        const target = now + milliseconds;
        let count = 0;
        while (true) {
          const next = [...scheduled.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          assert.ok(count++ < 100, 'restart callbacks must not spin');
          scheduled.delete(next[0]); now = next[1].at; next[1].callback();
        }
        now = target;
      },
    });
  } finally {
    players.forEach(player => player.dispose());
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (performanceNow) Object.defineProperty(performance, 'now', performanceNow);
    else Reflect.deleteProperty(performance, 'now');
  }
}

test('construction only detects support and never creates or starts a recognizer', () => harness(({ create, statuses }) => {
  create();
  assert.equal(Recognition.instances.length, 0);
  assert.equal(statuses.at(-1)!.enabled, false);
  assert.equal(statuses.at(-1)!.listening, false);
  assert.equal(statuses.at(-1)!.supported, true);
}));

test('explicit start configures final continuous Chinese recognition and is idempotent', () => harness(({ create, statuses }) => {
  const player = create(); player.start(); player.start();
  assert.equal(Recognition.instances.length, 1);
  const recognition = Recognition.instances[0]!;
  assert.equal(recognition.starts, 1);
  assert.equal(recognition.lang, 'zh-CN');
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, false);
  assert.equal(statuses.at(-1)!.enabled, true);
  assert.equal(statuses.at(-1)!.listening, true);
}));

test('webkit-prefixed recognition is supported without touching the microphone at construction', () => harness(({ create, statuses }) => {
  const player = create(); assert.equal(Recognition.instances.length, 0); player.start();
  assert.equal(Recognition.instances.length, 1);
  assert.equal(statuses.at(-1)!.supported, true);
}, { prefixed: true }));

test('unsupported browsers show a manual-save fallback instead of requesting audio', () => harness(({ create, statuses }) => {
  const player = create(); player.start();
  assert.equal(Recognition.instances.length, 0);
  assert.equal(statuses.at(-1)!.supported, false);
  assert.equal(statuses.at(-1)!.enabled, false);
  assert.match(statuses.at(-1)!.message, /不支持/);
  assert.match(statuses.at(-1)!.message, /存画/);
}, { supported: false }));

test('an insecure context shows the HTTPS fallback before creating a recognizer', () => harness(({ create, statuses }) => {
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: false });
  create().start();
  assert.equal(Recognition.instances.length, 0);
  assert.equal(statuses.at(-1)!.enabled, false);
  assert.match(statuses.at(-1)!.message, /HTTPS/);
  assert.match(statuses.at(-1)!.message, /存画/);
}));

test('final Chinese screenshot commands trigger the capture callback', () => harness(({ create, tick, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  ['截图', '请截图。', '帮我截图', '截个图', '请帮我截个图吧！', '截 图'].forEach((text, index) => {
    recognition.result([text], index); assert.equal(captures(), index + 1); tick(2600);
  });
}));

test('interim, unrelated and negated phrases never trigger a capture', () => harness(({ create, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.result(['截图'], 0, false);
  ['不要截图', '别截图', '取消截图', '请不要截个图', '我想讨论截图功能', 'screenshot', '音乐'].forEach((text, index) => recognition.result([text], index + 1));
  recognition.result(['不要截图', '截图'], 20);
  assert.equal(captures(), 0);
}));

test('alternatives and repeated delivery of a final result cannot capture twice', () => harness(({ create, tick, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.result(['截图', '截图', '请截图'], 0);
  assert.equal(captures(), 1);
  tick(3000); recognition.result(['截图'], 0);
  assert.equal(captures(), 1);
}));

test('new result indices can capture the same spoken command again after cooldown', () => harness(({ create, tick, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.result(['截图'], 0); tick(2500); recognition.result(['截图'], 1);
  assert.equal(captures(), 2);
}));

test('the 2.5-second cooldown merges nearby new results without permanently deduplicating text', () => harness(({ create, tick, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.result(['截图'], 0); tick(1000); recognition.result(['截图'], 1);
  assert.equal(captures(), 1);
  tick(1500); recognition.result(['截图'], 2);
  assert.equal(captures(), 2);
}));

test('an interim result may become final at the same index', () => harness(({ create, captures }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.result(['截图'], 0, false); recognition.result(['截图'], 0, true);
  assert.equal(captures(), 1);
}));

test('natural end restarts after a bounded delay and preserves user intent', () => harness(({ create, tick, statuses }) => {
  create().start(); Recognition.instances[0]!.end();
  assert.equal(statuses.at(-1)!.enabled, true);
  assert.equal(statuses.at(-1)!.listening, false);
  tick(249); assert.equal(Recognition.instances.length, 1);
  tick(1); assert.equal(Recognition.instances.length, 2);
  assert.equal(statuses.at(-1)!.listening, true);
}));

test('repeated immediate endings stop after a bounded number of automatic restarts', () => harness(({ create, tick, statuses, timers }) => {
  create().start();
  for (const delay of [250, 500, 1000, 2000, 2000, 2000]) { Recognition.instances.at(-1)!.end(); tick(delay); }
  assert.ok(Recognition.instances.length <= 5);
  assert.equal(statuses.at(-1)!.enabled, false);
  assert.equal(timers(), 0);
  assert.match(statuses.at(-1)!.message, /重新|重试/);
}));

test('ordinary long listening sessions can reconnect without a lifetime restart limit', () => harness(({ create, tick, statuses }) => {
  create().start();
  for (let i = 0; i < 7; i++) { tick(4000); Recognition.instances.at(-1)!.end(); tick(250); }
  assert.equal(Recognition.instances.length, 8);
  assert.equal(statuses.at(-1)!.enabled, true);
}));

test('no-speech is recoverable and remains distinct from permission or network failure', () => harness(({ create, tick, statuses }) => {
  create().start(); const recognition = Recognition.instances[0]!;
  recognition.error('no-speech');
  assert.equal(statuses.at(-1)!.enabled, true);
  assert.match(statuses.at(-1)!.message, /未.*听|没有.*语音/);
  recognition.end(); tick(250);
  assert.equal(Recognition.instances.length, 2);
}));

test('permission, service, network and microphone failures stop instead of retrying forever', () => harness(({ create, tick, statuses, timers }) => {
  for (const [code, expected] of [['not-allowed', /权限/], ['service-not-allowed', /权限|服务/], ['network', /网络|连接/], ['audio-capture', /麦克风/]] as const) {
    const player = create(); player.start(); const recognition = Recognition.instances.at(-1)!;
    const count = Recognition.instances.length; recognition.error(code); recognition.end(); tick(5000);
    assert.equal(Recognition.instances.length, count, code);
    assert.equal(statuses.at(-1)!.enabled, false, code);
    assert.equal(statuses.at(-1)!.listening, false, code);
    assert.match(statuses.at(-1)!.message, expected);
    assert.match(statuses.at(-1)!.message, /存画/);
    assert.equal(timers(), 0);
    player.dispose();
  }
}));

test('native start errors are classified and an explicit retry can succeed', () => harness(({ create, statuses }) => {
  const denied = new Error('denied'); denied.name = 'NotAllowedError'; Recognition.startError = denied;
  const player = create(); assert.doesNotThrow(() => player.start());
  assert.equal(statuses.at(-1)!.enabled, false); assert.match(statuses.at(-1)!.message, /权限/);
  player.start(); assert.equal(statuses.at(-1)!.listening, true);
}));

test('stop cancels pending restarts and aborts the native recognizer', () => harness(({ create, tick, statuses, timers }) => {
  const player = create(); player.start(); const recognition = Recognition.instances[0]!;
  player.stop(); assert.equal(recognition.aborts, 1);
  assert.equal(statuses.at(-1)!.enabled, false);
  player.start(); Recognition.instances[1]!.end(); assert.equal(timers(), 1);
  player.stop(); tick(5000);
  assert.equal(Recognition.instances.length, 2);
  assert.equal(timers(), 0);
}));

test('late callbacks from stopped sessions cannot capture or alter a newer session', () => harness(({ create, captures, statuses, timers }) => {
  const player = create(); player.start(); const recognition = Recognition.instances[0]!;
  const oldStart = recognition.onstart!, oldEnd = recognition.onend!, oldError = recognition.onerror!, oldResult = recognition.onresult!;
  player.stop(); player.start();
  oldStart(); oldEnd(); oldError({ error: 'network' });
  oldResult({ resultIndex: 0, results: [Object.assign([{ transcript: '截图' }], { isFinal: true })] });
  assert.equal(captures(), 0);
  assert.equal(statuses.at(-1)!.enabled, true);
  assert.equal(statuses.at(-1)!.listening, true);
  assert.equal(timers(), 0);
}));

test('dispose prevents future microphone starts and late command callbacks', () => harness(({ create, captures, tick, statuses }) => {
  const player = create(); player.start(); const recognition = Recognition.instances[0]!, oldResult = recognition.onresult!;
  recognition.end(); player.dispose(); tick(5000); player.start();
  oldResult({ resultIndex: 0, results: [Object.assign([{ transcript: '截图' }], { isFinal: true })] });
  assert.equal(Recognition.instances.length, 1);
  assert.equal(captures(), 0);
  assert.equal(statuses.at(-1)!.enabled, false);
}));

test('stop called during a restart status notification leaves no delayed work', () => harness(({ create, timers, tick }) => {
  const player = create(undefined, status => { if (status.enabled && status.message.includes('恢复监听')) player.stop(); });
  player.start(); Recognition.instances[0]!.end();
  assert.equal(timers(), 0);
  tick(5000); assert.equal(Recognition.instances.length, 1);
}));

test('capture callback failures do not break recognition or claim a file was saved', () => harness(({ create, statuses }) => {
  const player = create(() => { throw new Error('download blocked'); }); player.start();
  assert.doesNotThrow(() => Recognition.instances[0]!.result(['截图']));
  assert.match(statuses.at(-1)!.message, /存画/);
  assert.doesNotMatch(statuses.at(-1)!.message, /已保存/);
  assert.equal(statuses.at(-1)!.enabled, true);
}));
