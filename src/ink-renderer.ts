import type { FlowerState, FlowerType } from './types';
import { LANDSCAPES, paintLandscape } from './landscape';
import type { LandscapeType } from './landscape';

/** A deterministic, paper-and-pigment painter. All positions are in CSS pixels. */
type RGB = readonly [number, number, number];
type Point = readonly [number, number];
interface Anatomy { values: Float32Array; seed: number }
interface InkRipple { id: string; born: number; life: number; strength: number; phase: number }

const INK: RGB = [37, 46, 38];
const LEAF: RGB = [47, 72, 51];
const PEONY: RGB = [157, 42, 66];
const LOTUS: RGB = [188, 73, 93];
const PLUM: RGB = [166, 43, 37];
const OCHRE: RGB = [164, 113, 27];
const ORCHID: RGB = [104, 91, 132];
const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
const rgba = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(phase: number, type: FlowerType): number {
  let seed = (Math.round((Number.isFinite(phase) ? phase : 0) * 100003) ^ 0x5891a7) >>> 0;
  for (let i = 0; i < type.length; i++) seed = Math.imul(seed ^ type.charCodeAt(i), 16777619);
  return seed >>> 0;
}

function grain(a: Anatomy, index: number): number {
  return a.values[((index % a.values.length) + a.values.length) % a.values.length]!;
}

/**
 * The canvas contains only the painting; camera pixels never enter this renderer.
 * Paper and its fibres are rasterized on resize, while petals remain live paths.
 */
export class InkGardenRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paper: HTMLCanvasElement;
  private readonly bristles: HTMLCanvasElement;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private readonly anatomies = new Map<number, Anatomy>();
  private landscape: LandscapeType | 'none';
  private paperReady = false;
  private headRotation = 0;
  private branchSway = 0;
  private ripples: InkRipple[] = [];
  private readonly rippleEmissions = new Map<string, number>();
  private lastRenderTime = -Infinity;

  constructor(canvas: HTMLCanvasElement, scene: LandscapeType | 'none' = 'mountains') {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('此浏览器无法创建画布，请尝试更新浏览器。');
    this.canvas = canvas;
    this.ctx = context;
    this.paper = document.createElement('canvas');
    this.bristles = this.makeBristles();
    this.landscape = scene === 'none' || LANDSCAPES.some(candidate => candidate.type === scene) ? scene : 'mountains';
  }

  setLandscape(type: LandscapeType): void {
    if (!LANDSCAPES.some(candidate => candidate.type === type) || type === this.landscape) return;
    this.landscape = type;
    if (this.paperReady) this.paintPaper();
  }

  getLandscape(): LandscapeType | 'none' { return this.landscape; }

  resize(width: number, height: number, dpr: number): void {
    const nextWidth = Math.max(1, Number.isFinite(width) ? width : 1);
    const nextHeight = Math.max(1, Number.isFinite(height) ? height : 1);
    const nextDpr = clamp(Number.isFinite(dpr) ? dpr : 1, .5, 2.5);
    if (this.paperReady && nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.paintPaper();
  }

  render(flowers: FlowerState[], time: number): void {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.paper, 0, 0, this.width, this.height);
    const radius = clamp(Math.min(this.width * 0.155, this.height * 0.163), 48, 114);
    const visible = flowers.slice(0, 2).filter(flower => Number.isFinite(flower.x) && Number.isFinite(flower.y) && flower.opacity > .005);
    const now = Number.isFinite(time) ? time : 0;
    this.paintRipples(visible, now, radius);
    for (const flower of visible) {
      if (!Number.isFinite(flower.x) || !Number.isFinite(flower.y)) continue;
      const opacity = clamp(flower.opacity);
      if (opacity < 0.005) continue;
      const openness = clamp(flower.openness);
      const anatomy = this.getAnatomy(flower.phase, flower.flower);
      c.save();
      c.globalAlpha = opacity;
      c.translate(clamp(flower.x) * this.width, clamp(flower.y) * this.height);
      const motion = clamp(Number.isFinite(flower.motion) ? flower.motion! : 0);
      const rotation = Number.isFinite(flower.rotation) ? flower.rotation! : 0;
      this.headRotation = Math.atan2(Math.sin(rotation), Math.cos(rotation));
      this.branchSway = Math.sin(now * .0014 + anatomy.seed % 97) * (.012 + motion * .02) + Math.sin(now * .0021 + anatomy.seed % 43) * motion * .01;
      // Every pose transform pivots at (0,0), exactly on the tracked fingertip.
      // Bound enlargement by the viewport as well as the requested 0.65–1.8x.
      const scale = clamp(Number.isFinite(flower.scale) ? flower.scale! : 1, .65, 1.8);
      const r = Math.min(radius * scale, this.width * .27, this.height * .31, 196) * (flower.flower === 'orchid' ? 0.87 : 1);
      switch (flower.flower) {
        case 'peony': this.peony(r, openness, anatomy); break;
        case 'lotus': this.lotus(r, openness, anatomy); break;
        case 'plum': this.plum(r, openness, anatomy); break;
        case 'chrysanthemum': this.chrysanthemum(r, openness, anatomy); break;
        case 'orchid': this.orchid(r, openness, anatomy); break;
      }
      c.restore();
    }
  }

  exportPng(): string { return this.canvas.toDataURL('image/png'); }

  private paintRipples(flowers: FlowerState[], time: number, radius: number): void {
    if (time < this.lastRenderTime) { this.ripples = []; this.rippleEmissions.clear(); }
    this.lastRenderTime = time;
    const current = new Map(flowers.map(flower => [flower.id, flower]));
    this.ripples = this.ripples.filter(ripple => current.has(ripple.id) && time - ripple.born < ripple.life);
    for (const id of this.rippleEmissions.keys()) if (!current.has(id)) this.rippleEmissions.delete(id);
    for (const flower of flowers) {
      const motion = clamp(Number.isFinite(flower.motion) ? flower.motion! : 0);
      if (motion < .075) continue;
      const previous = this.rippleEmissions.get(flower.id) ?? -Infinity;
      if (time - previous < mix(540, 170, motion)) continue;
      this.rippleEmissions.set(flower.id, time);
      this.ripples.push({ id: flower.id, born: time, life: mix(1250, 1900, motion), strength: motion, phase: flower.phase % TAU });
    }
    this.ripples = this.ripples.slice(-24);
    const c = this.ctx;
    c.save();
    for (const ripple of this.ripples) {
      const flower = current.get(ripple.id)!;
      const age = clamp((time - ripple.born) / ripple.life);
      const fade = Math.sin(age * Math.PI) * (1 - age) * clamp(flower.opacity);
      const size = Math.min(radius * clamp(Number.isFinite(flower.scale) ? flower.scale! : 1, .65, 1.8), this.width * .27, this.height * .31, 196);
      // Rings always follow the current hand. No old fingertip positions or
      // persistent paint strokes are retained in the animation state.
      const x = clamp(flower.x) * this.width;
      const y = clamp(flower.y) * this.height + size * .24;
      for (let ring = 0; ring < 3; ring++) {
        const rr = size * (.42 + age * (1.5 + ripple.strength * .65) + ring * .16);
        c.beginPath();
        c.ellipse(x, y + ring * size * .024, rr, rr * .29, -.025, ripple.phase + ring * .35, ripple.phase + ring * .35 + TAU * .91);
        c.strokeStyle = `rgba(60,92,85,${fade * (.17 - ring * .035) * (.48 + ripple.strength * .52)})`;
        c.lineWidth = .65 + ripple.strength * .7;
        c.stroke();
      }
    }
    c.restore();
  }

  private getAnatomy(phase: number, type: FlowerType): Anatomy {
    const seed = seedFor(phase, type);
    const cached = this.anatomies.get(seed);
    if (cached) return cached;
    const rand = randomSource(seed);
    const values = Float32Array.from({ length: 768 }, () => rand());
    const anatomy = { values, seed };
    // Seeds are fixed by the tracker; a small bound also covers long demo sessions.
    if (this.anatomies.size > 32) this.anatomies.delete(this.anatomies.keys().next().value!);
    this.anatomies.set(seed, anatomy);
    return anatomy;
  }

  private makeBristles(): HTMLCanvasElement {
    const texture = document.createElement('canvas');
    texture.width = 72;
    texture.height = 160;
    const c = texture.getContext('2d')!;
    const rand = randomSource(0x187a36);
    // A reusable dry-brush mask. It is stretched with every living petal/leaf.
    for (let i = 0; i < 190; i++) {
      const x = rand() * 72;
      const y = rand() * 160;
      c.strokeStyle = `rgba(249,246,234,${0.1 + rand() * 0.3})`;
      c.lineWidth = 0.25 + rand() * 0.7;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rand() - 0.5) * 0.7, y + 0.4 + rand() * 9);
      c.stroke();
    }
    return texture;
  }

  private paintPaper(): void {
    const p = this.paper;
    p.width = this.canvas.width;
    p.height = this.canvas.height;
    const c = p.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = this.width;
    const h = this.height;
    c.fillStyle = '#f8f5eb';
    c.fillRect(0, 0, w, h);
    const wash = c.createRadialGradient(w * 0.47, h * 0.36, 1, w * 0.47, h * 0.36, Math.max(w, h) * 0.78);
    wash.addColorStop(0, 'rgba(255,254,247,.56)');
    wash.addColorStop(0.65, 'rgba(239,230,207,.08)');
    wash.addColorStop(1, 'rgba(194,176,135,.13)');
    c.fillStyle = wash;
    c.fillRect(0, 0, w, h);
    const rand = randomSource(0x792a51);
    const count = Math.min(19000, Math.round(w * h / 59));
    // Short, directional fibres give xuan paper its material character, once only.
    c.lineWidth = 0.45;
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const length = 0.6 + rand() * 4.4;
      c.strokeStyle = rand() < 0.42 ? 'rgba(255,255,248,.38)' : 'rgba(122,105,73,.044)';
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + length * 0.42, y - rand() * 0.8, x + length, y + (rand() - 0.5) * 1.5);
      c.stroke();
    }
    if (this.landscape !== 'none') paintLandscape(c, w, h, this.landscape);
    this.paintSeal(c, w, h);
    this.paperReady = true;
  }

  private paintSeal(c: CanvasRenderingContext2D, w: number, h: number): void {
    const size = w < 480 ? 25 : 31;
    const x = Math.max(18, w * 0.038);
    const y = h - size - Math.max(20, h * 0.045);
    c.save();
    c.translate(x, y);
    c.rotate(-0.035);
    c.strokeStyle = 'rgba(160,49,35,.64)';
    c.lineWidth = 1.5;
    c.strokeRect(0, 0, size, size);
    c.lineWidth = 0.5;
    c.strokeRect(2.3, 2.1, size - 4.6, size - 4.4);
    c.fillStyle = 'rgba(154,43,33,.73)';
    c.font = `${size * 0.7}px "Songti SC", "STSong", "Noto Serif CJK SC", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('生', size * 0.5, size * 0.52);
    // Missing pigment at the edge is part of the engraved seal, not flat UI chrome.
    c.fillStyle = '#f8f5eb';
    const rand = randomSource(1873);
    for (let i = 0; i < 23; i++) {
      const px = rand() * size;
      const py = rand() < 0.5 ? rand() * 2 : size - rand() * 2;
      c.fillRect(px, py, 0.5 + rand() * 1.8, 0.4 + rand());
    }
    c.restore();
  }

  /** One tapered ink stroke, with split bristles laid along its centre line. */
  private stalk(points: Point[], width: number, alpha = 0.67, pigment: RGB = INK): void {
    const c = this.ctx;
    if (points.length < 2) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const next = points[i]!;
      c.beginPath();
      c.moveTo(prev[0], prev[1]);
      c.lineTo(next[0], next[1]);
      c.lineWidth = width * (0.77 + (i / points.length) * 0.4 + (i % 2) * 0.17);
      c.strokeStyle = rgba(pigment, alpha * (0.85 + (i % 3) * 0.07));
      c.stroke();
    }
    c.lineWidth = Math.max(0.35, width * 0.14);
    c.strokeStyle = 'rgba(246,242,225,.31)';
    c.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i === 0) c.moveTo(p[0] - width * 0.19, p[1]);
      else c.lineTo(p[0] - width * 0.19, p[1]);
    }
    c.stroke();
    c.lineWidth = width * 0.2;
    c.strokeStyle = rgba(pigment, alpha * 0.72);
    for (let i = 1; i < points.length; i += 2) {
      const p = points[i]!;
      const previous = points[i - 1]!;
      c.beginPath();
      c.moveTo(p[0] + width * 0.24, p[1]);
      c.lineTo(mix(p[0], previous[0], 0.34) + width * 0.24, mix(p[1], previous[1], 0.34));
      c.stroke();
    }
    c.restore();
  }

  private curvedStalk(endX: number, endY: number, r: number, alpha = 0.63): void {
    const c = this.ctx;
    c.save();
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, r * 0.08);
    c.bezierCurveTo(-r * 0.22, r * 0.7, endX + r * 0.15, endY * 0.75, endX, endY);
    c.strokeStyle = rgba(LEAF, alpha);
    c.lineWidth = Math.max(1.2, r * 0.026);
    c.stroke();
    c.translate(r * 0.009, 0);
    c.lineWidth = 0.55;
    c.strokeStyle = 'rgba(246,242,225,.46)';
    c.stroke();
    c.restore();
  }

  private leaf(x: number, y: number, length: number, width: number, angle: number, a: Anatomy, index: number, lobed = false, alpha = 0.64): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const path = new Path2D();
    path.moveTo(0, 0);
    if (lobed) {
      path.bezierCurveTo(-width * 0.5, -length * 0.13, -width * 0.75, -length * 0.29, -width * 0.68, -length * 0.39);
      path.lineTo(-width * 0.25, -length * 0.4);
      path.lineTo(-width * 0.55, -length * 0.65);
      path.lineTo(-width * 0.18, -length * 0.62);
      path.quadraticCurveTo(-width * 0.24, -length * 0.86, width * 0.07, -length);
      path.quadraticCurveTo(width * 0.28, -length * 0.8, width * 0.21, -length * 0.66);
      path.lineTo(width * 0.57, -length * 0.72);
      path.lineTo(width * 0.36, -length * 0.43);
      path.lineTo(width * 0.72, -length * 0.48);
      path.bezierCurveTo(width * 0.72, -length * 0.19, width * 0.28, -length * 0.1, 0, 0);
    } else {
      path.bezierCurveTo(-width * 0.58, -length * 0.23, -width * (0.52 + grain(a, index) * 0.15), -length * 0.73, 0, -length);
      path.bezierCurveTo(width * 0.42, -length * 0.7, width * 0.66, -length * 0.27, 0, 0);
    }
    const paint = c.createLinearGradient(-width * 0.4, 0, width * 0.5, -length);
    paint.addColorStop(0, rgba(INK, Math.min(0.93, alpha * 1.2)));
    paint.addColorStop(0.45, rgba(LEAF, alpha * 0.96));
    paint.addColorStop(1, rgba([80, 103, 62], alpha * 0.39));
    c.fillStyle = paint;
    c.fill(path);
    c.lineWidth = 0.45;
    c.strokeStyle = rgba(INK, alpha * 0.14);
    c.stroke(path);
    c.lineWidth = Math.max(0.4, width * 0.018);
    c.strokeStyle = 'rgba(239,234,207,.48)';
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(width * 0.06, -length * 0.47, 0, -length * 0.91);
    c.stroke();
    c.strokeStyle = rgba(INK, alpha * 0.43);
    c.lineWidth = 0.45;
    for (let i = 1; i <= 4; i++) {
      const yy = -length * (0.15 + i * 0.14);
      const extent = width * (i === 4 ? 0.17 : 0.39);
      c.beginPath();
      c.moveTo(0, yy + length * 0.07);
      c.quadraticCurveTo(-extent * 0.6, yy, -extent, yy - length * 0.06);
      c.moveTo(0, yy + length * 0.07);
      c.quadraticCurveTo(extent * 0.6, yy, extent, yy - length * 0.07);
      c.stroke();
    }
    // Broken, light bristle traces expose the paper beneath the wash.
    c.save();
    c.clip(path);
    c.drawImage(this.bristles, -width * 0.6, -length, width * 1.2, length);
    c.strokeStyle = rgba(INK, alpha * 0.22);
    c.lineWidth = width * 0.08;
    c.beginPath();
    c.moveTo(-width * 0.12, -length * 0.14);
    c.quadraticCurveTo(-width * 0.26, -length * 0.43, -width * 0.08, -length * 0.65);
    c.stroke();
    c.strokeStyle = 'rgba(248,245,233,.22)';
    c.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const xx = (grain(a, index + i + 11) - 0.5) * width * 0.8;
      c.beginPath();
      c.moveTo(xx, -length * 0.08);
      c.quadraticCurveTo(xx * 1.5, -length * 0.5, xx * 0.4, -length * (0.66 + grain(a, index + i + 21) * 0.25));
      c.stroke();
    }
    c.restore();
    c.restore();
  }

  private petal(x: number, y: number, length: number, width: number, angle: number, color: RGB, a: Anatomy, index: number, pointed = false, alpha = 0.65, curl = 0, underpaint = 0.08): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    const skew = (grain(a, index) - 0.5) * width * 0.27 + curl * width;
    const left = width * (0.45 + grain(a, index + 1) * 0.13);
    const right = width * (0.43 + grain(a, index + 2) * 0.12);
    const path = new Path2D();
    path.moveTo(0, 0);
    if (pointed) {
      path.bezierCurveTo(-left * 0.65, -length * 0.22, -left, -length * 0.7, skew, -length);
      path.bezierCurveTo(right * 0.95 + skew, -length * 0.67, right * 0.7, -length * 0.17, 0, 0);
    } else {
      path.bezierCurveTo(-left * 0.57, -length * 0.17, -left * 1.12, -length * 0.61, -left * 0.67 + skew, -length * 0.89);
      path.bezierCurveTo(-left * 0.56 + skew, -length * (1.03 + grain(a, index + 3) * 0.06), -width * 0.22 + skew, -length * 1.02, -width * 0.19 + skew, -length * 0.96);
      path.quadraticCurveTo(-width * 0.08 + skew, -length * (1.055 + grain(a, index + 5) * 0.05), width * 0.015 + skew, -length * 0.99);
      path.quadraticCurveTo(width * 0.13 + skew, -length * (1.04 + grain(a, index + 6) * 0.04), width * 0.22 + skew, -length * 0.94);
      path.bezierCurveTo(right * 0.65 + skew, -length * 1.03, right * 1.03 + skew, -length * 0.96, right * 0.9 + skew, -length * 0.78);
      path.bezierCurveTo(right * 1.15, -length * 0.52, right * 0.53, -length * 0.15, 0, 0);
    }
    c.fillStyle = `rgba(250,245,233,${underpaint})`;
    c.fill(path);
    const wash = c.createLinearGradient(width * 0.12, length * 0.03, skew, -length);
    wash.addColorStop(0, rgba(color, alpha * 0.93));
    wash.addColorStop(0.3, rgba(color, alpha * 0.6));
    wash.addColorStop(0.72, rgba(color, alpha * 0.24));
    wash.addColorStop(1, rgba(color, alpha * 0.46));
    c.fillStyle = wash;
    c.fill(path);
    c.lineWidth = 0.5 + grain(a, index + 4) * 0.5;
    c.strokeStyle = rgba(color, alpha * 0.22);
    c.stroke(path);
    c.save();
    c.clip(path);
    c.drawImage(this.bristles, -width * 0.63, -length * 1.08, width * 1.26, length * 1.12);
    // A pale wash across one shoulder prevents the petals reading as flat icons.
    const bloom = c.createRadialGradient(-width * 0.15, -length * 0.66, 0, 0, -length * 0.63, length * 0.53);
    bloom.addColorStop(0, 'rgba(255,251,240,.28)');
    bloom.addColorStop(1, 'rgba(255,251,240,0)');
    c.fillStyle = bloom;
    c.fillRect(-width, -length * 1.2, width * 2, length * 1.3);
    c.strokeStyle = rgba(color, alpha * 0.29);
    c.lineWidth = Math.max(0.35, width * 0.013);
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * width * 0.21;
      c.beginPath();
      c.moveTo(spread * 0.12, -length * 0.07);
      c.bezierCurveTo(spread * 0.7, -length * 0.32, spread + skew * 0.6, -length * 0.62, spread * 0.75 + skew, -length * (0.78 + grain(a, index + 8 + i) * 0.14));
      c.stroke();
    }
    c.strokeStyle = 'rgba(250,246,232,.21)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(-width * 0.2, -length * 0.3);
    c.quadraticCurveTo(-width * 0.3 + skew, -length * 0.65, skew - width * 0.11, -length * 0.89);
    c.stroke();
    c.restore();
    c.restore();
  }

  private calyx(r: number, openness: number, a: Anatomy): void {
    const scale = mix(0.4, 0.72, openness);
    for (let i = 0; i < 3; i++) {
      this.leaf((i - 1) * r * 0.055, r * 0.17, r * 0.35 * scale, r * 0.13, (i - 1) * 0.88 + Math.PI, a, 610 + i, false, 0.68);
    }
  }

  private stamens(r: number, count: number, a: Anatomy, alpha = 1, color: RGB = [178, 132, 48]): void {
    const c = this.ctx;
    c.save();
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + grain(a, 690 + i) * 0.3;
      const spread = Math.sqrt((i + 1) / count) * r;
      const x = Math.sin(angle) * spread;
      const y = Math.cos(angle) * spread * 0.62;
      c.beginPath();
      c.moveTo(x * 0.2, r * 0.2);
      c.quadraticCurveTo(x * 0.6, y - r * 0.08, x, y);
      c.lineWidth = Math.max(0.5, r * 0.035);
      c.strokeStyle = rgba([118, 80, 42], 0.48 * alpha);
      c.stroke();
      c.fillStyle = rgba(color, (0.7 + grain(a, i + 130) * 0.25) * alpha);
      c.beginPath();
      c.ellipse(x, y, Math.max(0.7, r * 0.07), Math.max(0.55, r * 0.044), angle, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  private peony(r: number, o: number, a: Anatomy): void {
    const c = this.ctx;
    const side = grain(a, 0) > 0.5 ? 1 : -1;
    c.save();
    c.rotate(this.branchSway);
    this.curvedStalk(r * 0.17 * side, r * 2.15, r, 0.7);
    this.stalk([[r * 0.04, r * 1.15], [-r * 0.4 * side, r * 0.94], [-r * 0.79 * side, r * 0.82]], r * 0.018, 0.58);
    this.stalk([[r * 0.1, r * 1.68], [r * 0.65 * side, r * 1.48]], r * 0.015, 0.6);
    this.leaf(-r * 0.36 * side, r * 0.97, r * 0.76, r * 0.4, -1.0 * side, a, 30, true);
    this.leaf(-r * 0.65 * side, r * 0.87, r * 0.62, r * 0.31, -1.87 * side, a, 40, true, 0.54);
    this.leaf(r * 0.49 * side, r * 1.53, r * 0.68, r * 0.37, 1.1 * side, a, 50, true, 0.7);
    this.leaf(r * 0.26 * side, r * 1.63, r * 0.57, r * 0.29, 0.45 * side, a, 60, true, 0.5);
    c.restore();
    c.save();
    c.rotate(this.headRotation);
    this.calyx(r, o, a);
    const size = r * mix(0.32, 1, o);
    const rotation = (grain(a, 3) - 0.5) * 0.55;
    c.save();
    c.scale(1.04, 0.9);
    // Outer petals carry broad, dilute ink; the heart is denser broken rouge.
    const rings = [
      { n: 9, base: 0.12, len: 0.91, width: 0.82, alpha: 0.53 },
      { n: 10, base: 0.1, len: 0.7, width: 0.66, alpha: 0.67 },
      { n: 11, base: 0.05, len: 0.49, width: 0.49, alpha: 0.79 },
      { n: 8, base: 0.01, len: 0.29, width: 0.31, alpha: 0.77 },
    ];
    let index = 90;
    for (let layer = 0; layer < rings.length; layer++) {
      const ring = rings[layer]!;
      for (let i = 0; i < ring.n; i++) {
        const phi = i / ring.n * TAU + rotation + layer * 0.53 + (grain(a, index) - 0.5) * 0.44;
        const posture = phi + (1 - o) * Math.sin(phi) * 0.55;
        const bx = Math.sin(phi) * size * ring.base * mix(0.4, 1, o) + (grain(a, index + 4) - 0.5) * size * 0.12;
        const by = -Math.cos(phi) * size * ring.base - (1 - o) * size * 0.12 + (grain(a, index + 5) - 0.5) * size * 0.1;
        const length = size * ring.len * (0.76 + grain(a, index + 1) * 0.4) * (1 + Math.sin(phi + 0.7) * 0.1);
        this.petal(bx, by, length, size * ring.width * mix(0.49, 1, o) * (0.88 + grain(a, index + 6) * 0.23), posture, PEONY, a, index, false, ring.alpha * (0.82 + grain(a, index + 7) * 0.29), (grain(a, index + 2) - 0.5) * 0.54, 0.45);
        index += 11;
      }
    }
    if (o > 0.45) {
      c.save();
      c.globalAlpha *= clamp((o - 0.45) * 2.3);
      this.stamens(size * 0.14, 19, a, 0.92);
      c.restore();
    }
    c.restore();
    c.restore();
  }

  private lotusLeaf(x: number, y: number, r: number, a: Anatomy): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(-0.14);
    const path = new Path2D();
    const segments = 16;
    const coords: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = -Math.PI / 2 + (i / segments) * TAU;
      const edge = r * (0.87 + grain(a, 310 + i) * 0.18);
      coords.push([Math.cos(angle) * edge, Math.sin(angle) * edge * 0.38]);
    }
    path.moveTo(0, -r * 0.02);
    path.lineTo(coords[0]![0] - r * 0.16, coords[0]![1]);
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]!;
      const cur = coords[i]!;
      path.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    }
    path.quadraticCurveTo(coords[15]![0], coords[15]![1], r * 0.15, coords[0]![1]);
    path.closePath();
    const wash = c.createRadialGradient(-r * 0.16, -r * 0.02, 0, 0, 0, r);
    wash.addColorStop(0, 'rgba(35,57,43,.7)');
    wash.addColorStop(0.65, 'rgba(65,90,62,.57)');
    wash.addColorStop(1, 'rgba(76,102,70,.3)');
    c.fillStyle = wash;
    c.fill(path);
    c.save();
    c.clip(path);
    for (let i = 0; i < segments; i++) {
      const edge = coords[i]!;
      c.beginPath();
      c.moveTo(0, r * 0.03);
      c.quadraticCurveTo(edge[0] * 0.39, edge[1] * 0.76, edge[0], edge[1]);
      c.strokeStyle = 'rgba(234,231,198,.37)';
      c.lineWidth = 0.65;
      c.stroke();
      c.beginPath();
      c.moveTo(edge[0] * 0.47, edge[1] * 0.5);
      c.quadraticCurveTo(edge[0] * 0.67 + r * 0.05, edge[1] * 0.75 - r * 0.02, edge[0] * 0.84, edge[1] * 0.85);
      c.strokeStyle = 'rgba(24,47,34,.16)';
      c.lineWidth = 0.55;
      c.stroke();
    }
    c.restore();
    c.restore();
  }

  private lotus(r: number, o: number, a: Anatomy): void {
    const c = this.ctx;
    const side = grain(a, 4) > 0.5 ? 1 : -1;
    c.save();
    c.rotate(this.branchSway);
    this.curvedStalk(r * 0.14 * side, r * 2.45, r, 0.63);
    this.stalk([[r * 0.82 * side, r * 1.56], [r * 0.65 * side, r * 2.12], [r * 0.36 * side, r * 2.48]], r * 0.02, 0.46, LEAF);
    this.lotusLeaf(r * 0.9 * side, r * 1.48, r * 0.98, a);
    c.restore();
    c.save();
    c.rotate(this.headRotation);
    const size = r * mix(0.43, 1, o);
    this.calyx(size, o, a);
    const spread = mix(0.13, 1, o);
    // Rear spears and side petals open out of the same live geometry.
    const back = [-0.95, -0.52, 0, 0.49, 0.93];
    for (let i = 0; i < back.length; i++) {
      const angle = back[i]! * spread + (grain(a, 410 + i) - 0.5) * 0.08;
      this.petal(Math.sin(angle) * size * 0.1, size * 0.1, size * (1.08 - Math.abs(back[i]!) * 0.1), size * (0.4 + o * 0.16), angle, LOTUS, a, 420 + i * 12, true, 0.48);
    }
    this.petal(-size * 0.1, size * 0.1, size * 0.99, size * mix(0.2, 0.61, o), -1.24 * spread, LOTUS, a, 490, true, 0.57);
    this.petal(size * 0.1, size * 0.1, size * 0.95, size * mix(0.2, 0.6, o), 1.24 * spread, LOTUS, a, 502, true, 0.57);
    if (o > 0.32) {
      const c = this.ctx;
      c.save();
      c.globalAlpha *= clamp((o - 0.32) * 2.4);
      this.stamens(size * 0.2, 27, a, 0.87, [186, 137, 43]);
      c.fillStyle = 'rgba(140,136,61,.75)';
      c.beginPath();
      c.ellipse(0, 0, size * 0.105, size * 0.055, 0, 0, TAU);
      c.fill();
      c.restore();
    }
    for (let i = 0; i < 3; i++) {
      const angle = (i - 1) * mix(0.15, 0.68, o);
      this.petal((i - 1) * size * 0.12 * o, size * 0.22, size * mix(0.71, 0.62, o), size * mix(0.24, 0.61, o), angle, LOTUS, a, 550 + i * 12, true, 0.7, (i - 1) * 0.08);
    }
    c.restore();
  }

  private plumBlossom(x: number, y: number, r: number, o: number, a: Anatomy, offset: number): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    const size = r * mix(0.33, 1, o);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * TAU + 0.15 + grain(a, offset) * 0.3;
      this.petal(Math.sin(angle) * size * 0.02, -Math.cos(angle) * size * 0.02, size * 0.93, size * mix(0.57, 0.97, o), angle + (1 - o) * Math.sin(angle) * 0.24, PLUM, a, offset + i * 13, false, 0.7, (grain(a, offset + 1 + i) - 0.5) * 0.18);
    }
    c.fillStyle = 'rgba(89,47,33,.75)';
    c.beginPath();
    c.ellipse(0, 0, size * 0.12, size * 0.1, 0, 0, TAU);
    c.fill();
    this.stamens(size * 0.31, 17, a, mix(0.35, 1, o), [195, 150, 63]);
    c.restore();
  }

  private plum(r: number, o: number, a: Anatomy): void {
    const c = this.ctx;
    const side = grain(a, 3) > 0.5 ? 1 : -1;
    c.save();
    c.rotate(this.branchSway);
    const branch: Point[] = [[0, r * 0.15], [r * 0.13 * side, r * 0.42], [r * 0.39 * side, r * 0.84], [r * 0.33 * side, r * 1.19], [r * 0.74 * side, r * 1.75], [r * 0.88 * side, r * 2.35]];
    this.stalk(branch, r * 0.063, 0.81, [54, 48, 39]);
    this.stalk([[r * 0.34 * side, r * 1.22], [-r * 0.03 * side, r * 1.12], [-r * 0.34 * side, r * 0.92], [-r * 0.57 * side, r * 0.98]], r * 0.032, 0.72, [57, 49, 40]);
    this.stalk([[r * 0.67 * side, r * 1.68], [r * 1.02 * side, r * 1.32], [r * 1.1 * side, r * 0.94]], r * 0.022, 0.67, [57, 49, 40]);
    // Knots and discontinuous bark marks turn a smooth line into a woody plum twig.
    c.save();
    for (let i = 0; i < 17; i++) {
      const t = (i + 0.5) / 17;
      const x = (0.15 + t * 0.68) * r * side + (grain(a, 80 + i) - 0.5) * r * 0.05;
      const y = (0.43 + t * 1.7) * r;
      c.beginPath();
      c.ellipse(x, y, r * (0.014 + grain(a, i) * 0.012), r * 0.007, -0.4 * side, 0, TAU);
      c.fillStyle = 'rgba(28,29,25,.4)';
      c.fill();
    }
    c.restore();
    this.plumBlossom(-r * 0.53 * side, r * 0.94, r * 0.25, 0.74, a, 170);
    this.plumBlossom(r * 1.1 * side, r * 0.94, r * 0.16, 0.16, a, 260);
    c.restore();
    // The single main flower is centred exactly on the fingertip.
    c.save();
    c.rotate(this.headRotation);
    this.plumBlossom(0, 0, r * 0.78, o, a, 330);
    c.restore();
  }

  private chrysPetal(r: number, width: number, angle: number, curl: number, a: Anatomy, index: number, alpha: number): void {
    const c = this.ctx;
    c.save();
    c.rotate(angle);
    const kink = (grain(a, index) - 0.5) * r * 0.16;
    const tipX = curl * r * 0.2;
    const path = new Path2D();
    path.moveTo(-width * 0.15, 0);
    path.bezierCurveTo(-width * 0.5 + kink * 0.3, -r * 0.35, -width * 0.55 + kink, -r * 0.82, tipX - width * 0.25, -r);
    path.quadraticCurveTo(tipX + width * 0.6, -r * 1.08, tipX + width * 0.57, -r * 0.92);
    path.bezierCurveTo(width * 0.6 + kink, -r * 0.7, width * 0.62, -r * 0.25, width * 0.15, 0);
    path.closePath();
    const wash = c.createLinearGradient(0, 0, tipX, -r);
    wash.addColorStop(0, rgba([138, 90, 24], alpha * 0.83));
    wash.addColorStop(0.5, rgba(OCHRE, alpha * 0.53));
    wash.addColorStop(1, rgba([191, 149, 51], alpha * 0.71));
    c.fillStyle = wash;
    c.fill(path);
    c.strokeStyle = rgba([132, 94, 29], alpha * 0.32);
    c.lineWidth = 0.5;
    c.stroke(path);
    c.beginPath();
    c.moveTo(0, -r * 0.12);
    c.bezierCurveTo(kink * 0.3, -r * 0.4, kink, -r * 0.78, tipX, -r * 0.96);
    c.strokeStyle = 'rgba(248,239,210,.43)';
    c.lineWidth = 0.6;
    c.stroke();
    c.restore();
  }

  private chrysanthemum(r: number, o: number, a: Anatomy): void {
    const c = this.ctx;
    c.save();
    c.rotate(this.branchSway);
    this.stalk([[0, r * 0.15], [-r * 0.1, r * 0.63], [r * 0.09, r * 1.12], [-r * 0.03, r * 1.57], [r * 0.2, r * 2.19]], r * 0.026, 0.72, LEAF);
    this.stalk([[r * 0.07, r * 1.12], [r * 0.5, r * 1.04]], r * 0.016, 0.59);
    this.leaf(r * 0.44, r * 1.04, r * 0.75, r * 0.43, 1.17, a, 30, true, 0.67);
    this.leaf(-r * 0.05, r * 1.57, r * 0.82, r * 0.47, -1.15, a, 50, true, 0.68);
    this.leaf(r * 0.06, r * 1.88, r * 0.52, r * 0.31, 0.88, a, 70, true, 0.5);
    c.restore();
    c.save();
    c.rotate(this.headRotation);
    this.calyx(r * 0.7, o, a);
    const size = r * mix(0.29, 1, o);
    const rings = [{ n: 29, len: 1, width: 0.082, alpha: 0.7 }, { n: 27, len: 0.79, width: 0.095, alpha: 0.77 }, { n: 21, len: 0.55, width: 0.106, alpha: 0.83 }, { n: 15, len: 0.3, width: 0.11, alpha: 0.86 }];
    let index = 120;
    for (let layer = 0; layer < rings.length; layer++) {
      const ring = rings[layer]!;
      for (let i = 0; i < ring.n; i++) {
        const phi = (i / ring.n) * TAU + layer * 0.23 + (grain(a, index) - 0.5) * 0.1;
        const posture = phi + (1 - o) * Math.sin(phi) * 0.38;
        this.chrysPetal(size * ring.len * (0.88 + grain(a, index + 1) * 0.23), size * ring.width * mix(0.54, 1, o), posture, (grain(a, index + 2) - 0.5) * (1.3 + o), a, index, ring.alpha);
        index += 6;
      }
    }
    this.stamens(size * 0.12, 21, a, 0.86, [140, 104, 37]);
    c.restore();
  }

  private orchidBlade(baseX: number, baseY: number, tipX: number, tipY: number, bend: number, width: number, alpha: number): void {
    const c = this.ctx;
    const dx = tipX - baseX;
    const dy = tipY - baseY;
    const path = new Path2D();
    path.moveTo(baseX, baseY);
    path.bezierCurveTo(baseX + dx * 0.1 + bend, baseY + dy * 0.5, tipX - dx * 0.23, tipY + dy * 0.1, tipX, tipY);
    path.bezierCurveTo(tipX - dx * 0.2 + width * 0.15, tipY + dy * 0.09, baseX + dx * 0.16 + bend + width, baseY + dy * 0.48, baseX + width * 0.35, baseY);
    path.closePath();
    const wash = c.createLinearGradient(baseX, baseY, tipX, tipY);
    wash.addColorStop(0, rgba([29, 45, 34], alpha));
    wash.addColorStop(0.5, rgba([43, 65, 47], alpha * 0.86));
    wash.addColorStop(1, rgba([62, 83, 55], alpha * 0.44));
    c.fillStyle = wash;
    c.fill(path);
    c.beginPath();
    c.moveTo(baseX + width * 0.15, baseY);
    c.bezierCurveTo(baseX + dx * 0.1 + bend + width * 0.4, baseY + dy * 0.5, tipX - dx * 0.23, tipY + dy * 0.1, tipX, tipY);
    c.lineWidth = 0.65;
    c.strokeStyle = 'rgba(242,239,218,.29)';
    c.stroke();
  }

  private orchid(r: number, o: number, a: Anatomy): void {
    const c = this.ctx;
    c.save();
    c.rotate(this.branchSway);
    const baseY = r * 2.26;
    const side = grain(a, 8) > 0.5 ? 1 : -1;
    // Chinese ink orchids are recognized by their long, crossing, tapered leaves.
    this.orchidBlade(r * 0.05, baseY, -r * 1.54 * side, r * 0.32, -r * 0.18 * side, r * 0.1, 0.7);
    this.orchidBlade(r * 0.04, baseY, r * 1.63 * side, r * 0.88, r * 0.64 * side, r * 0.11, 0.72);
    this.orchidBlade(-r * 0.02, baseY, -r * 0.67 * side, r * 0.14, r * 0.3 * side, r * 0.072, 0.57);
    this.orchidBlade(0, baseY, r * 0.8 * side, -r * 0.24, r * 0.41 * side, r * 0.074, 0.7);
    this.orchidBlade(-r * 0.02, baseY, -r * 1.43 * side, r * 1.39, -r * 0.45 * side, r * 0.085, 0.54);
    this.curvedStalk(r * 0.04, baseY, r, 0.66);
    this.stalk([[r * 0.02, r * 0.95], [r * 0.41 * side, r * 0.62], [r * 0.5 * side, r * 0.37]], r * 0.012, 0.54, LEAF);
    this.petal(r * 0.5 * side, r * 0.39, r * 0.26, r * 0.11, side * 0.3, ORCHID, a, 80, true, 0.58);
    c.restore();
    c.save();
    c.rotate(this.headRotation);
    const size = r * mix(0.33, 0.91, o);
    const spread = mix(0.21, 1, o);
    // Three long sepals, two softer petals, and a small freckled lip.
    this.petal(0, 0, size * 1.09, size * 0.27, -0.07, ORCHID, a, 100, true, 0.48);
    this.petal(-size * 0.03, size * 0.03, size * 0.98, size * 0.25, -2.06 * spread, ORCHID, a, 115, true, 0.48, -0.18);
    this.petal(size * 0.03, size * 0.02, size * 0.97, size * 0.24, 2.03 * spread, ORCHID, a, 130, true, 0.46, 0.15);
    this.petal(-size * 0.02, -size * 0.015, size * 0.81, size * mix(0.22, 0.44, o), -0.89 * spread, ORCHID, a, 145, false, 0.55, -0.08);
    this.petal(size * 0.02, -size * 0.015, size * 0.79, size * mix(0.21, 0.43, o), 0.9 * spread, ORCHID, a, 160, false, 0.56, 0.1);
    this.petal(0, size * 0.015, size * 0.48, size * mix(0.24, 0.4, o), Math.PI - 0.12, [119, 76, 106], a, 180, false, 0.53, 0.13);
    c.save();
    c.strokeStyle = 'rgba(73,47,73,.72)';
    c.lineWidth = Math.max(0.6, size * 0.018);
    for (let i = 0; i < 7; i++) {
      const x = (grain(a, 210 + i) - 0.5) * size * 0.19;
      const y = size * (0.07 + grain(a, 230 + i) * 0.22);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + size * 0.012, y + size * (0.03 + grain(a, i) * 0.035));
      c.stroke();
    }
    c.fillStyle = 'rgba(183,145,57,.82)';
    c.beginPath();
    c.ellipse(0, 0, size * 0.05, size * 0.075, 0, 0, TAU);
    c.fill();
    c.restore();
    c.restore();
  }
}
