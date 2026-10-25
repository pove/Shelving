// Avisos de diseño: descuadres, huecos pequeños, flecha de baldas, piezas mayores que la plancha…
import type { EnvResult } from './environment';
import { listRegions, parseKey, regionBounds, regionKey, type CarcassLayout } from './grid';
import type { Board, Merge, Project, SheetFormat } from './types';

export interface Warning {
  level: 'error' | 'warn' | 'info';
  msg: string;
  carcassId?: string;
  boardId?: string;
  cells?: Merge;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

export function maxSpan(p: Project, t: number) {
  return p.settings.maxSpan19 * Math.pow(t / 19, 0.75);
}

export function sheetFor(p: Project, t: number): SheetFormat | undefined {
  return p.settings.sheets.find((s) => Math.abs(s.thickness - t) < 0.01);
}

export function fitsSheet(b: { length: number; width: number; rotatable: boolean }, s: SheetFormat, trim: number) {
  const L = s.length - 2 * trim;
  const W = s.width - 2 * trim;
  if (b.length <= L && b.width <= W) return true;
  return b.rotatable && b.length <= W && b.width <= L;
}

function boxOverlap(a: Board, b: Board) {
  const A = a.box, B = b.box;
  return (
    Math.min(A.x + A.dx, B.x + B.dx) - Math.max(A.x, B.x) > 0.01 &&
    Math.min(A.y + A.dy, B.y + B.dy) - Math.max(A.y, B.y) > 0.01 &&
    Math.min(A.z + A.dz, B.z + B.dz) - Math.max(A.z, B.z) > 0.01
  );
}

/** Tramos sin apoyo de un tablero horizontal. */
export function unsupportedSpans(h: Board, boards: Board[]): number[] {
  const E = 0.5;
  const hb = h.box;
  const supports: [number, number][] = [];
  for (const v of boards) {
    if (v === h || v.normal !== 'x') continue;
    const vb = v.box;
    if (Math.min(vb.y + vb.dy, hb.y + hb.dy) - Math.max(vb.y, hb.y) < 1) continue;
    const touchesFace = Math.abs(vb.z + vb.dz - hb.z) < E || Math.abs(vb.z - (hb.z + hb.dz)) < E;
    const zOverlap = Math.min(vb.z + vb.dz, hb.z + hb.dz) - Math.max(vb.z, hb.z) > E;
    if (touchesFace && vb.x >= hb.x - E && vb.x + vb.dx <= hb.x + hb.dx + E) supports.push([vb.x, vb.x + vb.dx]);
    else if (zOverlap && (Math.abs(vb.x + vb.dx - hb.x) < E || Math.abs(vb.x - (hb.x + hb.dx)) < E)) supports.push([vb.x, vb.x + vb.dx]);
  }
  supports.sort((a, b) => a[0] - b[0]);
  const spans: number[] = [];
  let cur = hb.x;
  let first = true;
  for (const [a, b] of supports) {
    if (a > cur + E) spans.push(a - cur);
    else if (first && a > hb.x + E) spans.push(a - hb.x);
    cur = Math.max(cur, b);
    first = false;
  }
  if (cur < hb.x + hb.dx - E) spans.push(hb.x + hb.dx - cur);
  return spans;
}

export function computeWarnings(p: Project, boards: Board[], layouts: Map<string, CarcassLayout>, env: EnvResult): Warning[] {
  const out: Warning[] = [];
  const s = p.settings;

  for (const L of layouts.values()) {
    const c = L.carcass;
    const kind = c.kind === 'module' ? 'Módulo' : 'Puente';
    if (L.colW.mismatch !== 0)
      out.push({
        level: 'error',
        carcassId: c.id,
        msg: `${kind} «${c.name}»: las columnas no cuadran con el ancho (${L.colW.mismatch > 0 ? 'sobran' : 'faltan'} ${f1(Math.abs(L.colW.mismatch))} mm).`,
      });
    if (L.rowH.mismatch !== 0)
      out.push({
        level: 'error',
        carcassId: c.id,
        msg: `${kind} «${c.name}»: las filas no cuadran con el alto (${L.rowH.mismatch > 0 ? 'sobran' : 'faltan'} ${f1(Math.abs(L.rowH.mismatch))} mm).`,
      });
    L.colW.sizes.forEach((w, i) => w <= 0 && out.push({ level: 'error', carcassId: c.id, msg: `«${c.name}»: la columna C${i + 1} queda sin espacio.` }));
    L.rowH.sizes.forEach((h, i) => h <= 0 && out.push({ level: 'error', carcassId: c.id, msg: `«${c.name}»: la fila F${i + 1} queda sin espacio.` }));
    if (c.kind === 'module' && c.height > p.globals.ceiling - p.globals.ceilingGap + 0.01)
      out.push({ level: 'warn', carcassId: c.id, msg: `«${c.name}» (${f1(c.height)} mm) no respeta la holgura al techo.` });
    if (c.kind === 'bridge') {
      if (!p.modules.some((m) => m.id === c.leftId) || !p.modules.some((m) => m.id === c.rightId))
        out.push({ level: 'error', carcassId: c.id, msg: `Puente «${c.name}»: falta alguno de los módulos que une.` });
      if (L.x1 <= L.x0) out.push({ level: 'error', carcassId: c.id, msg: `Puente «${c.name}»: los módulos están solapados o en orden inverso.` });
    }

    // huecos pequeños
    for (const reg of listRegions(c)) {
      const rb = regionBounds(L, reg);
      const props = c.regions[regionKey(reg)];
      const W = rb.x1 - rb.x0;
      const H = rb.z1 - rb.z0;
      const name = props?.name ?? `F${reg.r0 + 1} C${reg.c0 + 1}`;
      const cells: { w: number; h: number }[] = [];
      const hs = (props?.inserts ?? []).filter((i) => i.dir === 'h').sort((a, b) => a.offset - b.offset);
      const vs = (props?.inserts ?? []).filter((i) => i.dir === 'v').sort((a, b) => a.offset - b.offset);
      const hCuts = [0];
      for (const i of hs) {
        const t = i.thickness ?? p.globals.thickness.shelf;
        if (i.offset < 0 || i.offset + t > H) out.push({ level: 'error', carcassId: c.id, cells: reg, msg: `«${c.name}» ${name}: hay una balda fuera del hueco.` });
        hCuts.push(i.offset, i.offset + t);
      }
      hCuts.push(H);
      const vCuts = [0];
      for (const i of vs) {
        const t = i.thickness ?? p.globals.thickness.divider;
        if (i.offset < 0 || i.offset + t > W) out.push({ level: 'error', carcassId: c.id, cells: reg, msg: `«${c.name}» ${name}: hay un divisor fuera del hueco.` });
        vCuts.push(i.offset, i.offset + t);
      }
      vCuts.push(W);
      for (let a = 0; a < hCuts.length; a += 2)
        for (let b = 0; b < vCuts.length; b += 2) cells.push({ w: vCuts[b + 1] - vCuts[b], h: hCuts[a + 1] - hCuts[a] });
      const small = cells.filter((x) => x.w > 0 && x.h > 0 && (x.w < s.minHoleWidth - 0.01 || x.h < s.minHoleHeight - 0.01));
      if (small.length)
        out.push({
          level: 'warn',
          carcassId: c.id,
          cells: reg,
          msg: `«${c.name}» ${name}: hueco de ${f1(small[0].w)} × ${f1(small[0].h)} mm, menor que el mínimo (${f1(s.minHoleWidth)} × ${f1(s.minHoleHeight)}).`,
        });
      const fl = props?.floating;
      if (fl) {
        const free = H - fl.height - p.globals.thickness.shelf;
        if (fl.width + p.globals.thickness.divider > W || free < 0)
          out.push({ level: 'error', carcassId: c.id, cells: reg, msg: `«${c.name}» ${name}: el cubo flotante no cabe en el hueco.` });
        else if (free < s.minHoleHeight)
          out.push({ level: 'warn', carcassId: c.id, cells: reg, msg: `«${c.name}» ${name}: bajo el cubo flotante quedan solo ${f1(free)} mm.` });
      }
    }
    // claves de huecos que ya no existen
    for (const k of Object.keys(c.regions)) {
      const m = parseKey(k);
      if (m.c1 >= c.cols.length || m.r1 >= c.rows.length) out.push({ level: 'info', carcassId: c.id, msg: `«${c.name}»: propiedades de un hueco que ya no existe (${k}).` });
    }
  }

  // flecha
  for (const b of boards) {
    if (b.normal !== 'z' || b.kind === 'door' || b.kind === 'drawerBox') continue;
    if (b.kind === 'base' && b.box.z <= 0.01) continue;
    if (b.kind === 'top') continue;
    const lim = maxSpan(p, b.t);
    const spans = unsupportedSpans(b, boards);
    const worst = Math.max(0, ...spans);
    if (worst > lim)
      out.push({
        level: 'warn',
        carcassId: b.groupId,
        boardId: b.id,
        msg: `«${b.groupName}» ${b.name}: ${f1(worst)} mm sin apoyo intermedio (máx. recomendado ${f1(lim)} mm para ${f1(b.t)} mm).`,
      });
  }

  // planchas
  const missing = new Set<number>();
  for (const b of boards) {
    const sh = sheetFor(p, b.t);
    if (!sh) {
      missing.add(b.t);
      continue;
    }
    if (!fitsSheet(b, sh, s.trim))
      out.push({
        level: 'error',
        carcassId: b.groupId,
        boardId: b.id,
        msg: `«${b.groupName}» ${b.name}: ${f1(b.length)} × ${f1(b.width)} no cabe en la plancha de ${sh.length} × ${sh.width}${b.rotatable ? '' : ' respetando la veta'}.`,
      });
  }
  for (const t of missing) out.push({ level: 'warn', msg: `No hay formato de plancha para ${f1(t)} mm (añádelo en Cortes).` });

  // solapes
  for (let i = 0; i < boards.length; i++)
    for (let j = i + 1; j < boards.length; j++)
      if (boxOverlap(boards[i], boards[j]))
        out.push({
          level: 'error',
          carcassId: boards[i].groupId,
          boardId: boards[i].id,
          msg: `Se solapan «${boards[i].groupName} ${boards[i].name}» y «${boards[j].groupName} ${boards[j].name}».`,
        });

  // rodapié
  const pl = p.globals.plinth;
  if (pl.notch && (pl.notchHeight < pl.skirtingHeight || pl.notchDepth < pl.skirtingThickness))
    out.push({ level: 'warn', msg: `El rebaje (${pl.notchHeight}×${pl.notchDepth}) es menor que el rodapié (${pl.skirtingHeight}×${pl.skirtingThickness}).` });

  // balconera
  if (env.maxAngle !== undefined) {
    if (env.maxAngle < 90)
      out.push({ level: 'warn', msg: `La puerta lateral solo abre ${f1(env.maxAngle)}° antes de tocar el mueble.` });
    else out.push({ level: 'info', msg: `La puerta lateral abre hasta ${f1(env.maxAngle)}°.` });
  }
  return out;
}
