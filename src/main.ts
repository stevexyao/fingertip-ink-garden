import './style.css';
import { FLOWERS, type FlowerState, type FlowerType, type HandObservation, type TrackedHand } from './types';
import { InkGardenRenderer } from './ink-renderer';
import { HandGestureTracker } from './gestures';
import { HandSlots } from './hand-slots';
import { synchronizeFlowerSelection } from './flower-selection';
import { HandCamera, type CameraStatus } from './camera';
import { DwellFlowerSelector, type DwellTarget } from './dwell-selector';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    chevron: '<path d="m8 4 8 8-8 8"/>',
    hand: '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3L3 12a1.5 1.5 0 0 1 2-2Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    leaf: '<path d="M20 3C5 2 1 11 7 17s15 0 13-14ZM5 21 16 9"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="atelier">
    <header class="masthead">
      <a class="brand" href="./" aria-label="指尖花开首页"><span class="brand-seal">花<br>开</span><span><strong>指尖花开</strong><small>FINGERTIP · INK GARDEN</small></span></a>
      <p class="masthead-poem">以手为笔<span>·</span>让万物生花</p>
      <span class="edition"><i></i>国画手势体验</span>
    </header>

    <section class="workspace" aria-label="指尖作画工作台">
      <div class="painting-column">
        <div class="painting-head"><span class="eyebrow">一 方 宣 纸 · 两 手 春 色</span><span class="live-state" id="live-state"><i></i>赏花预览</span></div>
        <div class="painting" id="painting">
          <canvas id="art-canvas" aria-label="国画花卉互动画布"></canvas>
          <div class="painting-inscription" id="inscription"><span>指间</span><span>便是春天</span><small>一张一合，花自开</small></div>
          <div class="painting-corner"><span id="canvas-mode">写意 · 赏花</span><span id="canvas-caption">牡丹与荷 · 浓淡相宜</span></div>
          <div class="no-hands" id="no-hands" hidden><span>${icon('hand')}</span><p>让手掌，走进画面</p><small>一只手一朵花 · 两只手两朵花</small></div>
          <div class="camera-preview" id="camera-preview" hidden>
            <div class="preview-heading"><span id="preview-label">摄像头预览</span><button id="preview-collapse" aria-label="收起摄像头预览" title="收起摄像头预览">−</button></div>
            <div class="preview-image"><video id="webcam" playsinline muted autoplay></video><canvas id="skeleton" aria-label="21个手部关键点"></canvas><span class="preview-badge">21 点 · 镜像</span></div>
          </div>
          <button class="preview-reopen" id="preview-reopen" hidden title="展开摄像头预览" aria-label="展开摄像头预览">${icon('camera')}</button>
          <div class="dwell-toolbar" id="dwell-toolbar" hidden aria-label="指尖停留选花">
            <div class="dwell-heading"><span>指尖停留 <b>0.8 秒</b>，选一枝花</span><small id="dwell-click-target">点按为第一朵选花</small></div>
            <div class="dwell-options">${FLOWERS.map(flower => `<button class="dwell-flower" data-dwell-flower="${flower.type}" data-flower="${flower.type}" aria-pressed="false"><span class="dwell-petal" style="--petal-color:${flower.color}" aria-hidden="true">✿</span><span>${flower.name}</span></button>`).join('')}</div>
          </div>
          <div class="hand-pointers" id="hand-pointers" hidden aria-hidden="true">${[0, 1].map(i => `<div class="hand-pointer pointer-${i}" data-hand-pointer="${i}" hidden><svg viewBox="0 0 44 44"><circle class="pointer-track" cx="22" cy="22" r="18"/><circle class="pointer-progress" cx="22" cy="22" r="18" pathLength="100"/></svg><span>${i === 0 ? '一' : '二'}</span></div>`).join('')}</div>
          <button class="exit-immersive" id="exit-immersive" hidden>${icon('close')}退出沉浸</button>
        </div>
        <div class="canvas-tools">
          <p id="canvas-help">移指随行，张合开花；指向底部花牌，停留 0.8 秒选花。</p>
          <div><button class="text-tool" id="fullscreen">${icon('expand')}<span>沉浸</span></button><button class="text-tool" id="save-art">${icon('download')}<span>存画</span></button></div>
        </div>
      </div>

      <aside class="studio-panel">
        <div class="panel-intro"><span class="eyebrow">以 手 入 画</span><h1>让花开在<br>你的指尖。</h1><p>无需画笔，伸出手掌。<br>在一开一合间，遇见东方花事。</p></div>
        <div class="camera-actions"><button class="primary-button" id="start-camera">${icon('camera')}<span>开启摄像头</span></button><button class="secondary-button" id="demo-button">先体验一下 <span>↗</span></button></div>
        <div class="camera-status" id="camera-status" role="status" aria-live="polite">画面在你的设备上识别，仅使用摄像头。</div>
        <div class="hand-monitor" aria-label="双手识别状态">
          <div class="section-label"><span>花随手生</span><span id="hand-count">0 / 2 只手</span></div>
          <div class="hand-slots"><button class="hand-slot selected" data-slot="0" aria-pressed="true"><span class="slot-dot"></span><span><b>第一朵</b><small id="slot-name-0">牡丹 · 预览</small></span><span class="slot-meter"><i id="slot-meter-0"></i></span></button><button class="hand-slot" data-slot="1" aria-pressed="false"><span class="slot-dot"></span><span><b>第二朵</b><small id="slot-name-1">荷花 · 预览</small></span><span class="slot-meter"><i id="slot-meter-1"></i></span></button></div>
        </div>
        <div class="demo-controls" id="demo-controls" hidden><label for="bloom-range">花开几分 <output id="bloom-value">80%</output></label><input id="bloom-range" type="range" min="0" max="100" value="80"/><small>拖动画布移动花朵，滑动调节开合。</small></div>
        <div class="gesture-guide"><div class="section-label"><span>三式入门</span><span>随手，即成画</span></div><ol><li><span class="gesture-number">一</span><div><b>移指 · 花随指行</b><p>食指所至，花朵相随</p></div></li><li><span class="gesture-number">二</span><div><b>张合 · 花开有度</b><p>收拢成苞，舒掌盛放</p></div></li><li><span class="gesture-number">三</span><div><b>停留 · 择花入画</b><p>指向画布底部花牌，停留 0.8 秒</p></div></li></ol></div>
      </aside>
    </section>

    <section class="flower-library" aria-label="花型选择">
      <div class="library-label"><span class="eyebrow">四 时 花 事</span><p>择一枝，入画。</p><small id="palette-target">为第一朵选花</small></div>
      <div class="flower-options">${FLOWERS.map((flower, i) => `<button class="flower-option ${i === 0 ? 'active' : ''}" data-flower="${flower.type}" aria-pressed="${i === 0}"><canvas class="flower-thumb" data-thumb="${flower.type}" width="180" height="160" aria-hidden="true"></canvas><span class="flower-name">${flower.name}</span><small>${flower.note}</small><span class="flower-index">0${i + 1}</span></button>`).join('')}</div>
    </section>
    <footer class="footer"><span>一花一世界，一叶一春秋。</span><span>光线明亮 · 手掌完整入镜 · 横屏更开阔</span></footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const painting = $('#painting');
const art = $<HTMLCanvasElement>('#art-canvas');
const video = $<HTMLVideoElement>('#webcam');
const skeleton = $<HTMLCanvasElement>('#skeleton');
const renderer = new InkGardenRenderer(art);
const tracker = new HandGestureTracker();
const handSlots = new HandSlots();
const dwell = new DwellFlowerSelector();
let dwellFrame: ReturnType<DwellFlowerSelector['update']> = { progress: [], selections: [] };
let pointerHands: TrackedHand[] = [];
let mode: 'gallery' | 'demo' | 'camera' = 'gallery';
let cameraPhase: CameraStatus['phase'] = 'idle';
let selectedSlot = 0;
let previewCollapsed = false;
let showSkeleton = true;
let toastTimer = 0;
let lastUiUpdate = 0;
let latestObservations: HandObservation[] = [];
let latestDetectionAt = 0;
let immersive = false;
const demoFlowers: FlowerState[] = [
  { id: 'demo-1', x: 0.39, y: 0.43, openness: 0.8, flower: 'peony', opacity: 1, phase: 3.14 },
  { id: 'demo-2', x: 0.72, y: 0.48, openness: 0.9, flower: 'lotus', opacity: 1, phase: 6.2 },
];
const flowerMemory = new Map<string, FlowerType>();
const displayedFlowers: (FlowerType | null)[] = [null, null];
const pendingFlowers: (FlowerType | null)[] = [null, null];

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('visible'), 2800);
}

function setMode(next: typeof mode) {
  if (next !== mode) resetDwell();
  mode = next;
  painting.classList.toggle('is-demo', next === 'demo');
  painting.classList.toggle('is-camera', next === 'camera');
  $('#dwell-toolbar').hidden = next !== 'camera';
  $('#hand-pointers').hidden = next !== 'camera';
  $('#demo-controls').hidden = next !== 'demo';
  $('#demo-button').textContent = next === 'demo' ? '正在赏花体验' : next === 'camera' ? '切换到赏花体验 ↗' : '先体验一下 ↗';
  $('#live-state').innerHTML = `<i></i>${cameraPhase === 'loading' ? '正在准备' : next === 'camera' ? '手势入画' : next === 'demo' ? '赏花体验' : '赏花预览'}`;
  $('#live-state').classList.toggle('is-live', next === 'camera');
}

function currentFlowers(now = performance.now()): FlowerState[] {
  return currentSlots(now).filter((flower): flower is FlowerState => Boolean(flower));
}

function currentSlots(now = performance.now()): (FlowerState | undefined)[] {
  if (mode !== 'camera') return demoFlowers;
  const hands = tracker.getHands(now);
  return handSlots.ids.map(id => hands.find(hand => hand.id === id));
}

function resize() {
  const { width, height } = painting.getBoundingClientRect();
  renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
  resetDwell();
}
new ResizeObserver(resize).observe(painting);

function resetDwell() {
  dwell.clear();
  dwellFrame = { progress: [], selections: [] };
  pointerHands = [];
  drawDwellPointers(performance.now());
}

function dwellTargets(): DwellTarget[] {
  if ($('#dwell-toolbar').hidden) return [];
  const canvas = art.getBoundingClientRect();
  if (!canvas.width || !canvas.height) return [];
  return [...document.querySelectorAll<HTMLButtonElement>('[data-dwell-flower]')].map(button => {
    const box = button.getBoundingClientRect();
    return { flower: button.dataset.dwellFlower as FlowerType,
      left: (box.left - canvas.left) / canvas.width, right: (box.right - canvas.left) / canvas.width,
      top: (box.top - canvas.top) / canvas.height, bottom: (box.bottom - canvas.top) / canvas.height };
  });
}

function drawDwellPointers(now: number) {
  const fresh = mode === 'camera' && now - latestDetectionAt <= 400;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-dwell-flower]')) {
    button.classList.remove('hover-one', 'hover-two');
  }
  document.querySelectorAll<HTMLElement>('[data-hand-pointer]').forEach((element, index) => {
    const hand = pointerHands.find(h => h.id === handSlots.ids[index]);
    element.hidden = !fresh || !hand;
    if (!fresh || !hand) return;
    const state = dwellFrame.progress.find(p => p.id === hand.id);
    element.style.left = `${hand.x * 100}%`;
    element.style.top = `${hand.y * 100}%`;
    element.style.setProperty('--progress', String((state?.progress ?? 0) * 100));
    element.dataset.dwellProgress = String(state?.progress ?? 0);
    element.classList.toggle('on-target', Boolean(state?.target));
    if (state?.target) document.querySelector(`[data-dwell-flower="${state.target}"]`)?.classList.add(index === 0 ? 'hover-one' : 'hover-two');
  });
}

function updateUi(now: number) {
  const flowers = currentSlots(now);
  const tracked = mode === 'camera' ? flowers.filter(Boolean) as TrackedHand[] : [];
  const visible = tracked.filter(h => now - h.lastSeen < 220);
  $('#hand-count').textContent = mode === 'camera' ? `${visible.length} / 2 只手` : mode === 'demo' ? '赏花体验' : '0 / 2 只手';
  $('#no-hands').hidden = mode !== 'camera' || cameraPhase !== 'running' || visible.length > 0;
  $('#inscription').classList.toggle('quiet', mode === 'camera');
  $('#canvas-mode').textContent = mode === 'camera' ? '写意 · 手势入画' : mode === 'demo' ? '写意 · 赏花体验' : '写意 · 赏花';
  $('#canvas-caption').textContent = mode === 'camera' ? (visible.length ? visible.map(h => FLOWERS.find(f => f.type === h.flower)!.name).join(' · ') : '静候花开') : mode === 'demo' ? '拖动画布 · 调节花开几分' : demoFlowers.map(f => FLOWERS.find(entry => entry.type === f.flower)!.name).join('与') + ' · 浓淡相宜';
  $('#canvas-help').textContent = mode === 'demo' ? '拖动画布移动选中的花，用右侧滑杆调节开合。' : '移指随行，张合开花；指向底部花牌，停留 0.8 秒选花。';
  const slots = document.querySelectorAll<HTMLButtonElement>('.hand-slot');
  const changedFlowers: string[] = [];
  slots.forEach((button, index) => {
    const hand = flowers[index];
    const present = mode !== 'camera' || Boolean(hand && (hand as TrackedHand).lastSeen > now - 220);
    button.classList.toggle('tracking', mode === 'camera' && present);
    button.classList.toggle('selected', selectedSlot === index);
    button.setAttribute('aria-pressed', String(selectedSlot === index));
    $(`#slot-name-${index}`).textContent = hand ? `${FLOWERS.find(f => f.type === hand.flower)!.name} · ${mode === 'camera' ? present ? '追踪中' : '暂离' : '预览'}` : '等待手掌入镜';
    $(`#slot-meter-${index}`).style.width = `${hand ? Math.round(hand.openness * 100) : 0}%`;
    if (mode === 'camera' && hand) {
      const previous = flowerMemory.get(hand.id);
      if (previous && previous !== hand.flower) changedFlowers.push(`第${index === 0 ? '一' : '二'}朵已换为${FLOWERS.find(f => f.type === hand.flower)!.name}`);
      flowerMemory.set(hand.id, hand.flower);
    }
  });
  if (changedFlowers.length) toast(changedFlowers.join('，'));
  const chosen = flowers[selectedSlot]?.flower ?? pendingFlowers[selectedSlot] ?? displayedFlowers[selectedSlot] ?? 'peony';
  document.querySelectorAll<HTMLButtonElement>('[data-flower]').forEach(button => {
    const active = button.dataset.flower === chosen;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#palette-target').textContent = `为第${selectedSlot === 0 ? '一' : '二'}朵选花`;
  $('#dwell-click-target').textContent = `点按为第${selectedSlot === 0 ? '一' : '二'}朵选花`;
}

const camera = new HandCamera(video, (observations, capturedAt, receivedAt) => {
  latestObservations = observations;
  latestDetectionAt = receivedAt;
  const hands = tracker.update(observations, capturedAt, receivedAt);
  for (const hand of hands) {
    const slot = handSlots.indexOf(hand.id);
    if (slot >= 0 && pendingFlowers[slot]) dwell.cancel(hand.id);
  }
  synchronizeFlowerSelection(tracker, handSlots, hands, pendingFlowers, displayedFlowers);
  // Retained fading hands are not observations and cannot advance selection.
  pointerHands = hands.filter(hand => hand.lastSeen === receivedAt);
  if (cameraPhase === 'running') {
    dwellFrame = dwell.update(pointerHands, dwellTargets(), capturedAt, receivedAt);
    for (const selection of dwellFrame.selections) {
      tracker.setFlower(selection.id, selection.flower, receivedAt);
      const hand = hands.find(candidate => candidate.id === selection.id);
      if (hand) hand.flower = selection.flower;
      const slot = handSlots.indexOf(selection.id);
      if (slot >= 0) displayedFlowers[slot] = selection.flower;
    }
  } else resetDwell();
  hands.forEach(hand => {
    if (!flowerMemory.has(hand.id)) flowerMemory.set(hand.id, hand.flower);
  });
  drawDwellPointers(receivedAt);
}, status => {
  cameraPhase = status.phase;
  const startButton = $<HTMLButtonElement>('#start-camera');
  startButton.innerHTML = `${icon(status.phase === 'running' || status.phase === 'loading' ? 'close' : 'camera')}<span>${status.phase === 'loading' ? '取消开启' : status.phase === 'running' ? '关闭摄像头' : status.phase === 'error' ? '重试摄像头' : '开启摄像头'}</span>`;
  startButton.classList.toggle('is-running', status.phase === 'running');
  $('#camera-status').textContent = status.message;
  $('#camera-status').classList.toggle('is-error', status.phase === 'error');
  $('#live-state').innerHTML = `<i></i>${status.phase === 'running' ? '手势入画' : status.phase === 'loading' ? '正在准备' : mode === 'demo' ? '赏花体验' : '赏花预览'}`;
  $('#live-state').classList.toggle('is-live', status.phase === 'running');
  if (status.phase === 'running') {
    setMode('camera');
  }
  if (status.phase === 'error') {
    setMode('gallery');
    $('#camera-preview').hidden = true;
    $('#preview-reopen').hidden = true;
  } else {
    const showPreview = status.phase === 'running' || (status.phase === 'loading' && Boolean(video.srcObject));
    $('#camera-preview').hidden = !showPreview || previewCollapsed;
    $('#preview-reopen').hidden = !showPreview || !previewCollapsed;
  }
  if (status.phase === 'idle' || status.phase === 'error') resetDwell();
  if (status.fps) $('#preview-label').textContent = `手部追踪 · ${status.fps} 帧/秒`;
  updateUi(performance.now());
});

$('#start-camera').addEventListener('click', () => {
  if (cameraPhase === 'running' || cameraPhase === 'loading') {
    camera.stop();
    tracker.clear();
    handSlots.clear();
    setMode('gallery');
    updateUi(performance.now());
  } else {
    tracker.clear();
    handSlots.clear();
    flowerMemory.clear();
    setMode('gallery');
    void camera.start();
  }
});

$('#demo-button').addEventListener('click', () => {
  if (cameraPhase === 'running' || cameraPhase === 'loading') camera.stop();
  tracker.clear();
  handSlots.clear();
  setMode('demo');
  $('#camera-preview').hidden = true;
  $('#preview-reopen').hidden = true;
  $('#camera-status').textContent = '赏花体验 · 未开启摄像头。拖动画布，也能移花入画。';
  $('#camera-status').classList.remove('is-error');
  $('#live-state').innerHTML = '<i></i>赏花体验';
  $('#demo-button').textContent = '正在赏花体验';
  $<HTMLInputElement>('#bloom-range').value = String(Math.round(demoFlowers[selectedSlot].openness * 100));
  $('#bloom-value').textContent = `${Math.round(demoFlowers[selectedSlot].openness * 100)}%`;
  updateUi(performance.now());
  toast('拖动画布移动花朵，用滑杆让花绽放');
});

document.querySelectorAll<HTMLButtonElement>('.hand-slot').forEach(button => button.addEventListener('click', () => {
  selectedSlot = Number(button.dataset.slot);
  if (mode !== 'camera') {
    $<HTMLInputElement>('#bloom-range').value = String(Math.round(demoFlowers[selectedSlot].openness * 100));
    $('#bloom-value').textContent = `${Math.round(demoFlowers[selectedSlot].openness * 100)}%`;
  }
  updateUi(performance.now());
}));

document.querySelectorAll<HTMLButtonElement>('[data-flower]').forEach(button => button.addEventListener('click', () => {
  const flower = button.dataset.flower as FlowerType;
  if (mode === 'camera') {
    const hand = currentSlots(performance.now())[selectedSlot];
    if (hand) { dwell.cancel(hand.id); tracker.setFlower(hand.id, flower, performance.now()); }
    else {
      pendingFlowers[selectedSlot] = flower;
      const retainedId = handSlots.ids[selectedSlot];
      if (retainedId) { dwell.cancel(retainedId); tracker.setFlower(retainedId, flower, performance.now()); }
    }
    displayedFlowers[selectedSlot] = flower;
    if (!hand) toast('已选好花型，手掌入镜后即可绽放');
  } else demoFlowers[selectedSlot].flower = flower;
  updateUi(performance.now());
}));

$<HTMLInputElement>('#bloom-range').addEventListener('input', event => {
  const value = Number((event.target as HTMLInputElement).value);
  demoFlowers[selectedSlot].openness = value / 100;
  $('#bloom-value').textContent = `${value}%`;
});

let dragging = false;
function moveFlower(event: PointerEvent) {
  if (mode !== 'demo' || !dragging) return;
  const bounds = art.getBoundingClientRect();
  demoFlowers[selectedSlot].x = Math.max(0.07, Math.min(0.93, (event.clientX - bounds.left) / bounds.width));
  demoFlowers[selectedSlot].y = Math.max(0.14, Math.min(0.74, (event.clientY - bounds.top) / bounds.height));
}
art.addEventListener('pointerdown', event => {
  if (mode !== 'demo') return;
  dragging = true;
  art.setPointerCapture(event.pointerId);
  moveFlower(event);
});
art.addEventListener('pointermove', moveFlower);
art.addEventListener('pointerup', () => { dragging = false; });
art.addEventListener('pointercancel', () => { dragging = false; });

$('#preview-collapse').addEventListener('click', () => {
  previewCollapsed = true;
  $('#camera-preview').hidden = true;
  $('#preview-reopen').hidden = false;
});
$('#preview-reopen').addEventListener('click', () => {
  previewCollapsed = false;
  $('#camera-preview').hidden = false;
  $('#preview-reopen').hidden = true;
});

// A preview-only toggle keeps a clean camera view without changing hand tracking.
const skeletonToggle = document.createElement('button');
skeletonToggle.className = 'skeleton-toggle';
skeletonToggle.textContent = '隐藏关键点';
skeletonToggle.setAttribute('aria-pressed', 'true');
skeletonToggle.addEventListener('click', () => {
  showSkeleton = !showSkeleton;
  skeletonToggle.textContent = showSkeleton ? '隐藏关键点' : '显示关键点';
  skeletonToggle.setAttribute('aria-pressed', String(showSkeleton));
});
$('.preview-heading').insertBefore(skeletonToggle, $('#preview-collapse'));

async function leaveImmersive() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  immersive = false;
  painting.classList.remove('immersive');
  $('#exit-immersive').hidden = true;
  resize();
}
$('#fullscreen').addEventListener('click', async () => {
  immersive = true;
  painting.classList.add('immersive');
  $('#exit-immersive').hidden = false;
  if (painting.requestFullscreen) await painting.requestFullscreen().catch(() => {});
  resize();
});
$('#exit-immersive').addEventListener('click', () => { void leaveImmersive(); });
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && immersive) void leaveImmersive();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && immersive) void leaveImmersive(); });

$('#save-art').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `指尖花开_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = renderer.exportPng();
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('已保存这一刻的花开');
});

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawPreview(now: number) {
  if ($('#camera-preview').hidden || video.readyState < 2) return;
  const bounds = $('.preview-image').getBoundingClientRect();
  const width = Math.round(bounds.width * 2), height = Math.round(bounds.height * 2);
  if (skeleton.width !== width || skeleton.height !== height) { skeleton.width = width; skeleton.height = height; }
  const ctx = skeleton.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  if (!showSkeleton || now - latestDetectionAt > 220) return;
  const aspect = video.videoWidth / video.videoHeight;
  const drawnWidth = Math.min(width, height * aspect), drawnHeight = drawnWidth / aspect;
  const offsetX = (width - drawnWidth) / 2, offsetY = (height - drawnHeight) / 2;
  latestObservations.forEach((hand, index) => {
    const point = (i: number) => ({ x: offsetX + (1 - hand.landmarks[i].x) * drawnWidth, y: offsetY + hand.landmarks[i].y * drawnHeight });
    ctx.strokeStyle = index === 0 ? '#ecd18c' : '#afe6cd';
    ctx.lineWidth = 2;
    connections.forEach(([a, b]) => { const p = point(a), q = point(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); });
    hand.landmarks.forEach((_, i) => {
      const p = point(i);
      ctx.fillStyle = i === 8 ? '#fff7e1' : '#d88773';
      ctx.beginPath(); ctx.arc(p.x, p.y, i === 8 ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    });
  });
}

let destroyed = false;
let animationFrame = 0;
let lastPaintAt = -Infinity;
function animate(now: number) {
  if (destroyed) return;
  if (now - lastPaintAt >= (mode === 'gallery' ? 1000 / 15 : 1000 / 30)) {
    renderer.render(currentFlowers(now), now);
    drawPreview(now);
    drawDwellPointers(now);
    lastPaintAt = now;
  }
  if (now - lastUiUpdate > 120) { updateUi(now); lastUiUpdate = now; }
  animationFrame = requestAnimationFrame(animate);
}

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-thumb]')) {
  const thumbnail = new InkGardenRenderer(canvas);
  thumbnail.resize(180, 160, 1);
  thumbnail.render([{ id: 'thumb', x: 0.5, y: 0.42, openness: 0.95, flower: canvas.dataset.thumb as FlowerType, opacity: 1, phase: 3.14 }], 0);
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
}

window.addEventListener('pagehide', () => { camera.stop(); destroyed = true; cancelAnimationFrame(animationFrame); });
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    destroyed = false; setMode('gallery'); tracker.clear(); handSlots.clear();
    animationFrame = requestAnimationFrame(animate);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (cameraPhase === 'running' || cameraPhase === 'loading')) {
    camera.stop(); setMode('gallery'); tracker.clear(); handSlots.clear();
    $('#camera-status').textContent = '离开页面后摄像头已关闭，回来时可重新开启。';
  }
});
resize();
updateUi(performance.now());
animationFrame = requestAnimationFrame(animate);
