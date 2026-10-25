// Entorno (solo visual, fuera del despiece) y ángulo de apertura de la puerta lateral.
import type { Board, Box, Project } from './types';

export interface EnvBox {
  name: string;
  kind: 'wall' | 'floor';
  box: Box;
  /** Hoja de puerta del entorno (se puede ocultar). */
  door?: boolean;
}

/** Hoja girada: bisagra en (hx, hy), dirección de la hoja d, dirección del grosor t. */
export interface EnvLeaf {
  name: string;
  kind: 'wall';
  hx: number;
  hy: number;
  z: number;
  d: [number, number];
  t: [number, number];
  length: number;
  thickness: number;
  height: number;
  angle: number;
}

export interface EnvResult {
  boxes: EnvBox[];
  leaf?: EnvLeaf;
  maxAngle?: number;
}

const ROOM = 1500;

export function leafAt(p: Project, angle: number): EnvLeaf {
  const env = p.environment;
  const door = env.sideWall.door;
  const a = (angle * Math.PI) / 180;
  const left = env.sideWall.side === 'left';
  const hx = left ? env.wallX0 : env.wallX1;
  const s = left ? 1 : -1;
  return {
    name: `Balconera (abierta ${angle.toFixed(0)} grados)`,
    kind: 'wall',
    hx,
    hy: door.distance,
    z: 0,
    d: [s * Math.sin(a), Math.cos(a)],
    t: [-s * Math.cos(a), Math.sin(a)],
    length: door.leaf,
    thickness: door.thickness,
    height: door.height,
    angle,
  };
}

type Pt = [number, number];

function leafPolygon(l: EnvLeaf): Pt[] {
  const { hx, hy, d, t, length: L, thickness: T } = l;
  return [
    [hx, hy],
    [hx + d[0] * L, hy + d[1] * L],
    [hx + d[0] * L + t[0] * T, hy + d[1] * L + t[1] * T],
    [hx + t[0] * T, hy + t[1] * T],
  ];
}

/** Intersección (con interior) entre polígono convexo y rectángulo alineado. */
function polyHitsRect(poly: Pt[], x0: number, y0: number, x1: number, y1: number, eps = 0.05) {
  const rect: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const axes: Pt[] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    axes.push([-(b[1] - a[1]), b[0] - a[0]]);
  }
  for (const ax of axes) {
    const len = Math.hypot(ax[0], ax[1]) || 1;
    const proj = (pts: Pt[]) => pts.map((q) => (q[0] * ax[0] + q[1] * ax[1]) / len);
    const pa = proj(poly);
    const pb = proj(rect);
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
  }
  return true;
}

/** Ángulo máximo (grados) antes de chocar con el mueble o las paredes. */
export function maxDoorAngle(p: Project, boards: Board[]): number {
  const env = p.environment;
  const door = env.sideWall.door;
  const wt = env.wallThickness;
  const obstacles: [number, number, number, number][] = boards
    .filter((b) => b.box.z < door.height)
    .map((b) => [b.box.x, b.box.y, b.box.x + b.box.dx, b.box.y + b.box.dy]);
  obstacles.push([env.wallX0 - wt, -wt, env.wallX1 + wt, 0]);
  const left = env.sideWall.side === 'left';
  const wx = left ? env.wallX0 - wt : env.wallX1;
  obstacles.push([wx, -wt, wx + wt, door.distance]);
  let last = 0;
  for (let i = 1; i <= 1800; i++) {
    const a = i / 10;
    const poly = leafPolygon(leafAt(p, a));
    if (obstacles.some((o) => polyHitsRect(poly, ...o))) break;
    last = a;
  }
  return last;
}

export function computeEnvironment(p: Project, boards: Board[]): EnvResult {
  const env = p.environment;
  const g = p.globals;
  const wt = env.wallThickness;
  const H = g.ceiling;
  const boxes: EnvBox[] = [];
  const openings = [...env.openings].sort((a, b) => a.x - b.x);

  // pared principal con huecos de puerta
  let x = env.wallX0;
  const segs: [number, number][] = [];
  for (const o of openings) {
    if (o.x > x) segs.push([x, o.x]);
    x = Math.max(x, o.x + o.width);
  }
  if (env.wallX1 > x) segs.push([x, env.wallX1]);
  const wallNames = segs.length === 2 ? ['Pared izquierda', 'Pared derecha'] : segs.map((_, i) => `Pared ${i + 1}`);
  segs.forEach(([a, b], i) => {
    boxes.push({ name: wallNames[i], kind: 'wall', box: { x: a, y: -wt, z: 0, dx: b - a, dy: wt, dz: H } });
  });
  openings.forEach((o, i) => {
    const suf = openings.length > 1 ? ` ${i + 1}` : '';
    boxes.push({
      name: `Dintel${suf}`,
      kind: 'wall',
      box: { x: o.x, y: -wt, z: o.height, dx: o.width, dy: wt, dz: H - o.height },
    });
    const n = Math.max(1, o.leaves);
    const hoja = o.width / n - 5;
    for (let k = 0; k < n; k++)
      boxes.push({
        name: `Puerta ${k + 1}${suf}`,
        kind: 'wall',
        door: true,
        box: { x: o.x + 3 + k * (o.width / n - 1), y: -70, z: 0, dx: hoja, dy: 40, dz: o.height - 5 },
      });
  });
  boxes.push({
    name: 'Suelo',
    kind: 'floor',
    box: { x: env.wallX0 - wt - 500, y: -wt, z: -20, dx: env.wallX1 - env.wallX0 + 2 * wt + 1000, dy: ROOM + wt, dz: 20 },
  });
  segs.forEach(([a, b], i) => {
    boxes.push({
      name: segs.length === 2 ? (i === 0 ? 'Rodapie izquierdo' : 'Rodapie derecho') : `Rodapie ${i + 1}`,
      kind: 'floor',
      box: { x: a, y: 0, z: 0, dx: b - a, dy: g.plinth.skirtingThickness, dz: g.plinth.skirtingHeight },
    });
  });

  // pared perpendicular con balconera
  let leaf: EnvLeaf | undefined;
  let maxAngle: number | undefined;
  const sw = env.sideWall;
  if (sw.enabled) {
    const wx = sw.side === 'left' ? env.wallX0 - wt : env.wallX1;
    const d = sw.door;
    if (d.enabled) {
      const y0 = d.distance;
      const y1 = d.distance + d.leaf;
      boxes.push({ name: 'Pared lateral (junto a estanteria)', kind: 'wall', box: { x: wx, y: -wt, z: 0, dx: wt, dy: y0 + wt, dz: H } });
      boxes.push({ name: 'Pared lateral (resto)', kind: 'wall', box: { x: wx, y: y1, z: 0, dx: wt, dy: ROOM - y1, dz: H } });
      boxes.push({ name: 'Dintel balconera', kind: 'wall', box: { x: wx, y: y0, z: d.height, dx: wt, dy: d.leaf, dz: H - d.height } });
      maxAngle = maxDoorAngle(p, boards);
      leaf = leafAt(p, maxAngle);
    } else {
      boxes.push({ name: 'Pared lateral', kind: 'wall', box: { x: wx, y: -wt, z: 0, dx: wt, dy: ROOM + wt, dz: H } });
    }
  }
  return { boxes, leaf, maxAngle };
}
