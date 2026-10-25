// Geometría de la rejilla de un casco (módulo o puente): medidas resueltas,
// posiciones de columnas/filas, huecos (fusiones) y zonas de fondo.
import type { Bridge, Carcass, Globals, Merge, Module, Project, Track } from './types';

export interface ResolvedTracks {
  sizes: number[];
  /** Disponible - suma resuelta. 0 = cuadra. */
  mismatch: number;
}

export function resolveTracks(tracks: Track[], available: number): ResolvedTracks {
  const fixedSum = tracks.reduce((s, t) => s + (t.fixed ? t.size : 0), 0);
  const autos = tracks.filter((t) => !t.fixed).length;
  const share = autos > 0 ? (available - fixedSum) / autos : 0;
  const sizes = tracks.map((t) => (t.fixed ? t.size : share));
  const sum = sizes.reduce((s, v) => s + v, 0);
  let mismatch = available - sum;
  if (Math.abs(mismatch) < 1e-6) mismatch = 0;
  return { sizes, mismatch };
}

export interface Span {
  a: number;
  b: number;
}

export interface CarcassLayout {
  carcass: Carcass;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  depth: number;
  sideL: number;
  sideR: number;
  tBase: number;
  tTop: number;
  colW: ResolvedTracks;
  rowH: ResolvedTracks;
  /** Interior de cada columna. */
  cols: Span[];
  rows: Span[];
  /** Divisor i entre columnas i e i+1 (eje X). */
  colSeps: Span[];
  rowSeps: Span[];
  colSepT: number[];
  rowSepT: number[];
  /** Rango Y (distancia a pared) de cada columna. */
  colY: Span[];
  /** structural[cb] para cb=1..C-1: el fondo cambia entre columnas. */
  structural: boolean[];
  hasFloor: boolean;
}

export function sepThickness(c: Carcass, g: Globals, axis: 'col' | 'row', i: number): number {
  const s = axis === 'col' ? c.colSeps[i] : c.rowSeps[i];
  return s?.thickness ?? (axis === 'col' ? g.thickness.divider : g.thickness.shelf);
}

export function findCarcass(p: Project, id: string): Carcass | undefined {
  return p.modules.find((m) => m.id === id) ?? p.bridges.find((b) => b.id === id);
}

export function bridgeSpan(p: Project, b: Bridge): { x0: number; x1: number } {
  const l = p.modules.find((m) => m.id === b.leftId);
  const r = p.modules.find((m) => m.id === b.rightId);
  const x0 = l ? l.x + l.width : 0;
  const x1 = r ? r.x : x0 + 1000;
  return { x0, x1 };
}

export function layoutCarcass(p: Project, c: Carcass): CarcassLayout {
  const g = p.globals;
  let x0: number, x1: number, z0: number, z1: number, sideL: number, sideR: number;
  if (c.kind === 'module') {
    const m = c as Module;
    x0 = m.x;
    x1 = m.x + m.width;
    z0 = 0;
    z1 = m.height;
    sideL = m.sideLeft ?? g.thickness.side;
    sideR = m.sideRight ?? g.thickness.side;
  } else {
    const span = bridgeSpan(p, c);
    x0 = span.x0;
    x1 = span.x1;
    z0 = c.z;
    z1 = c.z + c.height;
    sideL = 0;
    sideR = 0;
  }
  const tBase = g.thickness.topBottom;
  const tTop = g.thickness.topBottom;
  const colSepT = c.cols.slice(1).map((_, i) => sepThickness(c, g, 'col', i));
  const rowSepT = c.rows.slice(1).map((_, i) => sepThickness(c, g, 'row', i));
  const availW = x1 - x0 - sideL - sideR - colSepT.reduce((s, v) => s + v, 0);
  const availH = z1 - z0 - tBase - tTop - rowSepT.reduce((s, v) => s + v, 0);
  const colW = resolveTracks(c.cols, availW);
  const rowH = resolveTracks(c.rows, availH);

  const cols: Span[] = [];
  const colSeps: Span[] = [];
  let x = x0 + sideL;
  colW.sizes.forEach((w, i) => {
    cols.push({ a: x, b: x + w });
    x += w;
    if (i < colSepT.length) {
      colSeps.push({ a: x, b: x + colSepT[i] });
      x += colSepT[i];
    }
  });
  const rows: Span[] = [];
  const rowSeps: Span[] = [];
  let z = z0 + tBase;
  rowH.sizes.forEach((h, i) => {
    rows.push({ a: z, b: z + h });
    z += h;
    if (i < rowSepT.length) {
      rowSeps.push({ a: z, b: z + rowSepT[i] });
      z += rowSepT[i];
    }
  });

  const colY = c.cols.map((col) => {
    const d = col.depth ?? c.depth;
    return col.align === 'front' ? { a: c.depth - d, b: c.depth } : { a: 0, b: d };
  });
  const structural = c.cols.map((_, cb) =>
    cb > 0 ? colY[cb - 1].a !== colY[cb].a || colY[cb - 1].b !== colY[cb].b : false,
  );

  return {
    carcass: c,
    x0,
    x1,
    z0,
    z1,
    depth: c.depth,
    sideL,
    sideR,
    tBase,
    tTop,
    colW,
    rowH,
    cols,
    rows,
    colSeps,
    rowSeps,
    colSepT,
    rowSepT,
    colY,
    structural,
    hasFloor: z0 <= 0,
  };
}

// ------------------------------------------------------------ huecos

export const regionKey = (m: Merge) => `${m.c0}:${m.r0}:${m.c1}:${m.r1}`;

export function parseKey(k: string): Merge {
  const [c0, r0, c1, r1] = k.split(':').map(Number);
  return { c0, r0, c1, r1 };
}

export function rectsIntersect(a: Merge, b: Merge) {
  return a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;
}

export function rectContains(a: Merge, b: Merge) {
  return b.c0 >= a.c0 && b.c1 <= a.c1 && b.r0 >= a.r0 && b.r1 <= a.r1;
}

/** Hueco (rectángulo de celdas) al que pertenece la celda (c, r). */
export function regionAt(c: Carcass, col: number, row: number): Merge {
  const m = c.merges.find((m) => col >= m.c0 && col <= m.c1 && row >= m.r0 && row <= m.r1);
  return m ? { ...m } : { c0: col, r0: row, c1: col, r1: row };
}

/** Lista de todos los huecos del casco. */
export function listRegions(c: Carcass): Merge[] {
  const out: Merge[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < c.rows.length; r++)
    for (let col = 0; col < c.cols.length; col++) {
      const reg = regionAt(c, col, r);
      const k = regionKey(reg);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(reg);
      }
    }
  return out;
}

/** Amplía un rectángulo hasta que no corte ninguna fusión existente. */
export function expandToMerges(c: Carcass, rect: Merge): Merge {
  const r = { ...rect };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of c.merges) {
      if (rectsIntersect(m, r) && !rectContains(r, m)) {
        r.c0 = Math.min(r.c0, m.c0);
        r.c1 = Math.max(r.c1, m.c1);
        r.r0 = Math.min(r.r0, m.r0);
        r.r1 = Math.max(r.r1, m.r1);
        changed = true;
      }
    }
  }
  return r;
}

export function regionBounds(L: CarcassLayout, m: Merge) {
  return {
    x0: L.cols[m.c0].a,
    x1: L.cols[m.c1].b,
    z0: L.rows[m.r0].a,
    z1: L.rows[m.r1].b,
    y: L.colY[m.c0],
  };
}

/** ¿Se puede fusionar el rectángulo? (no cruza cambios de fondo). */
export function canMerge(L: CarcassLayout, m: Merge): boolean {
  for (let cb = m.c0 + 1; cb <= m.c1; cb++) if (L.structural[cb]) return false;
  return true;
}
