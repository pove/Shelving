// Optimización de cortes: empaquetado guillotina (heurísticas de Jylänki) con grosor de sierra,
// refilado y veta. Se prueban varias combinaciones y se queda la que usa menos planchas.
import type { SheetFormat } from './types';

export interface NestItem {
  /** Número de referencia en el despiece. */
  ref: number;
  id: string;
  /** Largo: va en el sentido de la veta (largo de la plancha) si no se puede girar. */
  length: number;
  width: number;
  rotatable: boolean;
  label: string;
}

export interface Placed {
  item: NestItem;
  x: number;
  y: number;
  /** Medidas colocadas: w a lo largo de la plancha, h a lo ancho. */
  w: number;
  h: number;
  rotated: boolean;
}

export interface SheetLayout {
  placed: Placed[];
  usedArea: number;
}

export interface NestResult {
  sheet: SheetFormat;
  sheets: SheetLayout[];
  unplaced: NestItem[];
  /** Aprovechamiento global (área piezas / área planchas). */
  utilization: number;
  heuristic: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Fit = 'baf' | 'bssf' | 'blsf';
type Split = 'sas' | 'las' | 'slas' | 'llas' | 'maxas' | 'minas';
type Sort = 'area' | 'long' | 'perim' | 'width';

const SORTS: Record<Sort, (a: NestItem, b: NestItem) => number> = {
  area: (a, b) => b.length * b.width - a.length * a.width,
  long: (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width) || b.width - a.width,
  perim: (a, b) => b.length + b.width - (a.length + a.width),
  width: (a, b) => b.width - a.width || b.length - a.length,
};

function score(fit: Fit, fr: Rect, w: number, h: number) {
  const dw = fr.w - w;
  const dh = fr.h - h;
  if (fit === 'baf') return fr.w * fr.h - w * h + Math.min(dw, dh) * 1e-6;
  if (fit === 'bssf') return Math.min(dw, dh) + Math.max(dw, dh) * 1e-6;
  return Math.max(dw, dh) + Math.min(dw, dh) * 1e-6;
}

class Bin {
  free: Rect[];
  placed: Placed[] = [];
  constructor(
    public W: number,
    public H: number,
    private kerf: number,
  ) {
    this.free = [{ x: 0, y: 0, w: W, h: H }];
  }

  find(it: NestItem, fit: Fit) {
    let best: { i: number; w: number; h: number; s: number; rot: boolean } | null = null;
    const opts: [number, number, boolean][] = [[it.length, it.width, false]];
    if (it.rotatable && it.length !== it.width) opts.push([it.width, it.length, true]);
    this.free.forEach((fr, i) => {
      for (const [w, h, rot] of opts) {
        if (w <= fr.w + 1e-9 && h <= fr.h + 1e-9) {
          const s = score(fit, fr, w, h);
          if (!best || s < best.s) best = { i, w, h, s, rot };
        }
      }
    });
    return best as { i: number; w: number; h: number; s: number; rot: boolean } | null;
  }

  place(it: NestItem, f: { i: number; w: number; h: number; rot: boolean }, split: Split) {
    const fr = this.free[f.i];
    this.free.splice(f.i, 1);
    this.placed.push({ item: it, x: fr.x, y: fr.y, w: f.w, h: f.h, rotated: f.rot });
    const k = this.kerf;
    const rw = fr.w - f.w - k; // sobrante a la derecha
    const rh = fr.h - f.h - k; // sobrante debajo
    let horizontal: boolean; // corte horizontal: el sobrante inferior ocupa todo el ancho
    switch (split) {
      case 'sas':
        horizontal = fr.w < fr.h;
        break;
      case 'las':
        horizontal = fr.w >= fr.h;
        break;
      case 'slas':
        horizontal = rw <= rh;
        break;
      case 'llas':
        horizontal = rw > rh;
        break;
      case 'maxas':
        horizontal = f.w * rh > rw * f.h;
        break;
      default:
        horizontal = f.w * rh <= rw * f.h;
    }
    const add = (r: Rect) => r.w > 1 && r.h > 1 && this.free.push(r);
    if (horizontal) {
      add({ x: fr.x + f.w + k, y: fr.y, w: rw, h: f.h });
      add({ x: fr.x, y: fr.y + f.h + k, w: fr.w, h: rh });
    } else {
      add({ x: fr.x + f.w + k, y: fr.y, w: rw, h: fr.h });
      add({ x: fr.x, y: fr.y + f.h + k, w: f.w, h: rh });
    }
    this.mergeFree();
  }

  /** Une rectángulos libres adyacentes del mismo tamaño (mejora la guillotina). */
  private mergeFree() {
    const k = this.kerf;
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < this.free.length; i++)
        for (let j = i + 1; j < this.free.length; j++) {
          const a = this.free[i];
          const b = this.free[j];
          if (a.y === b.y && a.h === b.h && (Math.abs(a.x + a.w + k - b.x) < 1e-6 || Math.abs(b.x + b.w + k - a.x) < 1e-6)) {
            a.x = Math.min(a.x, b.x);
            a.w += b.w + k;
          } else if (a.x === b.x && a.w === b.w && (Math.abs(a.y + a.h + k - b.y) < 1e-6 || Math.abs(b.y + b.h + k - a.y) < 1e-6)) {
            a.y = Math.min(a.y, b.y);
            a.h += b.h + k;
          } else continue;
          this.free.splice(j, 1);
          merged = true;
          break outer;
        }
    }
  }
}

function run(items: NestItem[], W: number, H: number, kerf: number, fit: Fit, split: Split): { bins: Bin[]; unplaced: NestItem[] } {
  const bins: Bin[] = [];
  const unplaced: NestItem[] = [];
  for (const it of items) {
    let bestBin: Bin | null = null;
    let best: ReturnType<Bin['find']> = null;
    for (const b of bins) {
      const f = b.find(it, fit);
      if (f && (!best || f.s < best.s)) {
        best = f;
        bestBin = b;
      }
    }
    if (!bestBin) {
      const b = new Bin(W, H, kerf);
      const f = b.find(it, fit);
      if (!f) {
        unplaced.push(it);
        continue;
      }
      bins.push(b);
      bestBin = b;
      best = f;
    }
    bestBin.place(it, best!, split);
  }
  return { bins, unplaced };
}

export function nest(items: NestItem[], sheet: SheetFormat, kerf: number, trim: number): NestResult {
  const W = sheet.length - 2 * trim;
  const H = sheet.width - 2 * trim;
  let best: { bins: Bin[]; unplaced: NestItem[]; h: string; key: number[] } | null = null;
  for (const so of Object.keys(SORTS) as Sort[]) {
    const sorted = [...items].sort(SORTS[so]);
    for (const fit of ['baf', 'bssf', 'blsf'] as Fit[])
      for (const split of ['sas', 'las', 'slas', 'llas', 'maxas', 'minas'] as Split[]) {
        const r = run(sorted, W, H, kerf, fit, split);
        // menos planchas; después, la última plancha lo más vacía posible
        const last = r.bins.length ? r.bins[r.bins.length - 1].placed.reduce((s, p) => s + p.w * p.h, 0) : 0;
        const key = [r.unplaced.length, r.bins.length, last];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2]))))
          best = { ...r, h: `${so}/${fit}/${split}`, key };
      }
  }
  const sheets = best!.bins
    .map((b) => ({
      placed: b.placed.map((pl) => ({ ...pl, x: pl.x + trim, y: pl.y + trim })),
      usedArea: b.placed.reduce((s, p) => s + p.w * p.h, 0),
    }))
    .sort((a, b) => b.usedArea - a.usedArea);
  const used = sheets.reduce((s, x) => s + x.usedArea, 0);
  return {
    sheet,
    sheets,
    unplaced: best!.unplaced,
    utilization: sheets.length ? used / (sheets.length * sheet.length * sheet.width) : 0,
    heuristic: best!.h,
  };
}
