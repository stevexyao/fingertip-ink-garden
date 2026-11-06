export type LandscapeType = 'mountains' | 'waterside' | 'bamboo' | 'moonlake';

export const LANDSCAPES: { type: LandscapeType; name: string; note: string }[] = [
  { type: 'mountains', name: '云山远岫', note: '山色入空濛' },
  { type: 'waterside', name: '江南水乡', note: '一水绕人家' },
  { type: 'bamboo', name: '竹林听风', note: '清风过疏影' },
  { type: 'moonlake', name: '荷塘月色', note: '月落一池香' },
];

const TAU = Math.PI * 2;
type Point = readonly [number, number];

function randomSource(seed: number): () => number {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
}

function stroke(c: CanvasRenderingContext2D, points: Point[], color: string, width = 1): void {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

function mountain(c: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, span: number, rise: number, alpha: number, seed: number): void {
  const rand = randomSource(seed);
  const path = new Path2D();
  path.moveTo(x - span * .54, y + rise * .22);
  path.bezierCurveTo(x - span * .35, y + rise * .04, x - span * .25, y - rise * .23, x - span * .15, y - rise * .58);
  path.bezierCurveTo(x - span * .1, y - rise * .84, x - span * .035, y - rise, x + span * .035, y - rise * .78);
  path.bezierCurveTo(x + span * .13, y - rise * .57, x + span * .22, y - rise * .65, x + span * .28, y - rise * .27);
  path.bezierCurveTo(x + span * .36, y - rise * .04, x + span * .45, y + rise * .03, x + span * .58, y + rise * .17);
  path.lineTo(x + span * .58, Math.min(h * 1.04, y + rise * .35));
  path.lineTo(x - span * .54, Math.min(h * 1.04, y + rise * .35));
  path.closePath();
  const wash = c.createLinearGradient(0, y - rise, 0, y + rise * .25);
  wash.addColorStop(0, `rgba(70,92,88,${alpha})`);
  wash.addColorStop(.6, `rgba(90,111,103,${alpha * .56})`);
  wash.addColorStop(1, 'rgba(111,127,113,0)');
  c.fillStyle = wash;
  c.fill(path);
  c.save();
  c.clip(path);
  for (let i = 0; i < 24; i++) {
    const xx = x + (rand() - .5) * span * .75;
    const yy = y - rand() * rise * .81;
    stroke(c, [[xx, yy], [xx - span * (.014 + rand() * .026), yy + rise * .16], [xx - span * .04, yy + rise * .29]], `rgba(53,73,68,${alpha * .24})`, .45 + rand() * .7);
  }
  c.restore();
}

function water(c: CanvasRenderingContext2D, w: number, h: number, seed: number, start = .81): void {
  const rand = randomSource(seed);
  for (let i = 0; i < 54; i++) {
    const x = rand() * w;
    const y = h * (start + rand() * (1 - start));
    const length = w * (.014 + rand() * .1);
    c.strokeStyle = `rgba(72,103,100,${.035 + rand() * .045})`;
    c.lineWidth = .45 + rand() * .5;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + length * .5, y + h * .0015, x + length, y);
    c.stroke();
  }
}

function birds(c: CanvasRenderingContext2D, w: number, h: number, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const xx = w * x + i * w * .018;
    const yy = h * y + (i % 2) * h * .011;
    c.beginPath();
    c.moveTo(xx - w * .006, yy + h * .003);
    c.quadraticCurveTo(xx - w * .002, yy - h * .003, xx, yy);
    c.quadraticCurveTo(xx + w * .003, yy - h * .004, xx + w * .007, yy + h * .001);
    c.strokeStyle = 'rgba(53,72,67,.24)';
    c.lineWidth = .75;
    c.stroke();
  }
}

function house(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  c.fillStyle = 'rgba(239,235,220,.8)';
  c.fillRect(x, y - height, width, height);
  c.strokeStyle = 'rgba(61,72,65,.24)';
  c.lineWidth = .7;
  c.strokeRect(x, y - height, width, height);
  const roof = new Path2D();
  roof.moveTo(x - width * .12, y - height);
  roof.lineTo(x + width * .45, y - height * 1.5);
  roof.lineTo(x + width * 1.12, y - height);
  roof.lineTo(x + width * .94, y - height * .92);
  roof.lineTo(x + width * .44, y - height * 1.3);
  roof.lineTo(x + width * .06, y - height * .92);
  roof.closePath();
  c.fillStyle = 'rgba(47,66,62,.48)';
  c.fill(roof);
  c.fillStyle = 'rgba(68,76,67,.32)';
  c.fillRect(x + width * .65, y - height * .56, width * .14, height * .56);
  c.fillRect(x + width * .18, y - height * .65, width * .17, height * .25);
}

function bambooLeaf(c: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, alpha: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(length * .22, -length * .11, length * .72, -length * .11, length, 0);
  c.bezierCurveTo(length * .64, length * .05, length * .24, length * .075, 0, 0);
  c.fillStyle = `rgba(45,75,59,${alpha})`;
  c.fill();
  c.restore();
}

function bambooStalk(c: CanvasRenderingContext2D, w: number, h: number, x: number, lean: number, alpha: number, seed: number): void {
  const rand = randomSource(seed);
  const base = h * 1.04;
  const step = h * .12;
  const width = Math.max(2.1, w * .0053);
  for (let i = 0; i < 8; i++) {
    const y = base - i * step;
    const xx = x + lean * i / 8;
    const nextX = x + lean * (i + 1) / 8;
    stroke(c, [[xx, y], [nextX, y - step * .94]], `rgba(54,85,63,${alpha})`, width * (1 - i * .035));
    stroke(c, [[xx - width * .7, y - step * .96], [xx + width * .76, y - step * .96]], `rgba(35,62,45,${alpha * 1.25})`, .9);
    stroke(c, [[xx - width * .22, y - step * .07], [nextX - width * .22, y - step * .83]], 'rgba(243,241,222,.34)', .8);
    if (i < 2 || i > 6) continue;
    const side = rand() > .45 ? 1 : -1;
    const bx = nextX + side * w * (.025 + rand() * .04);
    const by = y - step * (1.1 + rand() * .25);
    stroke(c, [[nextX, y - step * .96], [bx, by], [bx + side * w * .035, by - h * .025]], `rgba(46,77,53,${alpha * .85})`, .65);
    for (let j = 0; j < 6; j++) {
      const t = j / 7;
      bambooLeaf(c, nextX + (bx - nextX) * t, y - step * .96 + (by - y + step * .96) * t, Math.min(w * .07, h * .095) * (.7 + rand() * .5), side > 0 ? -.65 + (j % 2) * 1.3 : Math.PI + .65 - (j % 2) * 1.3, alpha * (.75 + rand() * .25));
    }
  }
}

function lotusPad(c: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  c.save();
  c.translate(x, y);
  const path = new Path2D();
  path.moveTo(0, 0);
  path.ellipse(0, 0, r, r * .32, -.1, -.5, TAU - .8);
  path.closePath();
  c.fillStyle = `rgba(56,87,72,${alpha})`;
  c.fill(path);
  for (let i = 0; i < 9; i++) {
    const angle = i * TAU / 9;
    stroke(c, [[0, 0], [Math.cos(angle) * r * .85, Math.sin(angle) * r * .25]], `rgba(228,228,204,${alpha * 1.1})`, .5);
  }
  c.restore();
}

/** Static, deterministic scenery. The caller caches the result with its paper;
 * no video frame or user-interface element enters the painting.
 */
export function paintLandscape(c: CanvasRenderingContext2D, w: number, h: number, type: LandscapeType): void {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (type === 'mountains') {
    mountain(c, w, h, w * .12, h * .95, w * .48, h * .25, .14, 1101);
    mountain(c, w, h, w * .9, h * .96, w * .5, h * .32, .13, 1207);
    mountain(c, w, h, w * .48, h * 1.01, w * .81, h * .17, .075, 1311);
    water(c, w, h, 1317, .91);
    birds(c, w, h, .75, .23);
  } else if (type === 'waterside') {
    mountain(c, w, h, w * .15, h * .92, w * .49, h * .19, .09, 2101);
    mountain(c, w, h, w * .86, h * .88, w * .49, h * .18, .07, 2117);
    water(c, w, h, 2209, .8);
    const baseY = h * .858;
    house(c, w * .74, baseY, w * .062, h * .042);
    house(c, w * .807, baseY + h * .005, w * .07, h * .057);
    house(c, w * .883, baseY, w * .043, h * .038);
    stroke(c, [[w * .716, baseY + h * .009], [w * .943, baseY + h * .009]], 'rgba(59,75,65,.23)', 1.1);
    // A low arched bridge and a small dark skiff anchor the waterline.
    c.beginPath();
    c.moveTo(w * .565, h * .895);
    c.bezierCurveTo(w * .606, h * .833, w * .654, h * .833, w * .697, h * .895);
    c.strokeStyle = 'rgba(61,80,70,.28)';
    c.lineWidth = Math.max(2, h * .009);
    c.stroke();
    stroke(c, [[w * .57, h * .893], [w * .695, h * .893]], 'rgba(91,106,88,.18)', 1);
    c.beginPath();
    c.moveTo(w * .17, h * .911);
    c.quadraticCurveTo(w * .207, h * .935, w * .244, h * .908);
    c.closePath();
    c.fillStyle = 'rgba(52,70,62,.35)';
    c.fill();
    stroke(c, [[w * .202, h * .911], [w * .201, h * .872], [w * .223, h * .91]], 'rgba(60,77,66,.24)', .8);
    birds(c, w, h, .8, .27);
  } else if (type === 'bamboo') {
    mountain(c, w, h, w * .85, h, w * .53, h * .16, .05, 3107);
    bambooStalk(c, w, h, w * .038, w * .03, .32, 3203);
    bambooStalk(c, w, h, w * .104, -w * .035, .23, 3217);
    bambooStalk(c, w, h, -w * .014, w * .13, .16, 3229);
    bambooStalk(c, w, h, w * .989, -w * .045, .18, 3301);
    bambooStalk(c, w, h, w * 1.055, -w * .12, .105, 3313);
    stroke(c, [[0, h * .98], [w * .15, h * .96], [w * .25, h * 1.01]], 'rgba(63,84,65,.11)', 2);
  } else if (type === 'moonlake') {
    const moonX = w * .805;
    const moonY = h * .19;
    const moonR = Math.min(w, h) * .067;
    const halo = c.createRadialGradient(moonX, moonY, moonR * .8, moonX, moonY, moonR * 2.5);
    halo.addColorStop(0, 'rgba(217,215,182,.13)');
    halo.addColorStop(1, 'rgba(219,219,194,0)');
    c.fillStyle = halo;
    c.fillRect(moonX - moonR * 2.5, moonY - moonR * 2.5, moonR * 5, moonR * 5);
    c.beginPath();
    c.arc(moonX, moonY, moonR, 0, TAU);
    c.fillStyle = 'rgba(229,224,191,.36)';
    c.fill();
    c.strokeStyle = 'rgba(143,151,130,.1)';
    c.lineWidth = .8;
    c.stroke();
    mountain(c, w, h, w * .12, h * .95, w * .59, h * .16, .07, 4109);
    water(c, w, h, 4201, .8);
    const leaves = [[.12, .9, .065, .21], [.25, .965, .08, .15], [.76, .94, .073, .16], [.91, .88, .081, .2], [1.01, .97, .12, .17]];
    for (const [x, y, r, alpha] of leaves) lotusPad(c, w * x!, h * y!, w * r!, alpha!);
    stroke(c, [[w * .87, h * 1.03], [w * .856, h * .94], [w * .864, h * .83]], 'rgba(54,83,65,.28)', 1);
    c.save();
    c.translate(w * .864, h * .823);
    for (let i = -2; i <= 2; i++) {
      c.save();
      c.rotate(i * .35);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * .012, -h * .014, -w * .013, -h * .032, 0, -h * .05);
      c.bezierCurveTo(w * .012, -h * .028, w * .011, -h * .01, 0, 0);
      c.fillStyle = 'rgba(159,92,108,.18)';
      c.fill();
      c.restore();
    }
    c.restore();
    for (let i = 0; i < 7; i++) {
      const halfWidth = w * (.009 + i * .004);
      stroke(c, [[moonX - halfWidth, h * (.842 + i * .017)], [moonX + halfWidth, h * (.842 + i * .017)]], 'rgba(187,184,143,.18)', 1.1);
    }
  }
  c.restore();
}
