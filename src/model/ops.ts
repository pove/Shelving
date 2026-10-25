// Operaciones de edición sobre el proyecto (pensadas para usarse dentro de immer).
import { expandToMerges, layoutCarcass, listRegions, parseKey, rectContains, rectsIntersect, regionKey } from './grid';
import type { Carcass, DoorSpec, Merge, Project, RegionProps } from './types';

type Axis = 'col' | 'row';

function remapRect(m: Merge, axis: Axis, f: (a: number, b: number) => [number, number] | null): Merge | null {
  const [a, b] = axis === 'col' ? [m.c0, m.c1] : [m.r0, m.r1];
  const r = f(a, b);
  if (!r) return null;
  return axis === 'col' ? { ...m, c0: r[0], c1: r[1] } : { ...m, r0: r[0], r1: r[1] };
}

function remap(c: Carcass, axis: Axis, f: (a: number, b: number) => [number, number] | null) {
  const merges: Merge[] = [];
  for (const m of c.merges) {
    const n = remapRect(m, axis, f);
    if (n && (n.c0 !== n.c1 || n.r0 !== n.r1)) merges.push(n);
  }
  c.merges = merges;
  const regions: Record<string, RegionProps> = {};
  for (const [k, v] of Object.entries(c.regions)) {
    const n = remapRect(parseKey(k), axis, f);
    if (n) regions[regionKey(n)] = v;
  }
  c.regions = regions;
  if (c.fronts) {
    const fronts = [];
    for (const fr of c.fronts) {
      const n = remapRect(fr, axis, f);
      if (n) fronts.push({ ...fr, ...n });
    }
    c.fronts = fronts;
  }
}

/** Inserta una pista nueva en la posición index (0..n). */
export function insertTrack(c: Carcass, axis: Axis, index: number, size = 300) {
  const tracks = axis === 'col' ? c.cols : c.rows;
  const seps = axis === 'col' ? c.colSeps : c.rowSeps;
  tracks.splice(index, 0, { size, fixed: false });
  seps.splice(Math.min(index, seps.length), 0, {});
  remap(c, axis, (a, b) => (a >= index ? [a + 1, b + 1] : b >= index ? [a, b + 1] : [a, b]));
}

export function removeTrack(c: Carcass, axis: Axis, index: number) {
  const tracks = axis === 'col' ? c.cols : c.rows;
  const seps = axis === 'col' ? c.colSeps : c.rowSeps;
  if (tracks.length <= 1) return;
  tracks.splice(index, 1);
  if (seps.length) seps.splice(Math.min(index, seps.length - 1), 1);
  remap(c, axis, (a, b) => {
    if (a > index) return [a - 1, b - 1];
    if (b >= index) {
      if (a === b) return null;
      return [a, b - 1];
    }
    return [a, b];
  });
}

/** Fija la medida de una pista (pasa a "fija"). */
export function setTrackSize(c: Carcass, axis: Axis, index: number, size: number) {
  const t = (axis === 'col' ? c.cols : c.rows)[index];
  t.size = Math.max(1, size);
  t.fixed = true;
}

export function mergeCells(c: Carcass, rect: Merge): Merge {
  const r = expandToMerges(c, rect);
  c.merges = c.merges.filter((m) => !rectContains(r, m));
  for (const k of Object.keys(c.regions)) if (rectContains(r, parseKey(k)) && k !== regionKey(r)) delete c.regions[k];
  if (r.c0 !== r.c1 || r.r0 !== r.r1) c.merges.push(r);
  return r;
}

export function splitCells(c: Carcass, rect: Merge) {
  const gone = c.merges.filter((m) => rectsIntersect(m, rect));
  c.merges = c.merges.filter((m) => !rectsIntersect(m, rect));
  for (const m of gone) delete c.regions[regionKey(m)];
}

export function ensureRegion(c: Carcass, key: string): RegionProps {
  if (!c.regions[key]) c.regions[key] = { inserts: [] };
  return c.regions[key];
}

/** Limpia propiedades vacías de huecos. */
export function cleanRegion(c: Carcass, key: string) {
  const r = c.regions[key];
  if (r && !r.name && !r.door && !r.floating && r.inserts.length === 0) delete c.regions[key];
}

export function findCarcassDraft(p: Project, id: string): Carcass | undefined {
  return p.modules.find((m) => m.id === id) ?? p.bridges.find((b) => b.id === id);
}

/** Pone la misma puerta/cajón en cada hueco que cae dentro del rectángulo. */
export function doorInEachRegion(c: Carcass, rect: Merge, door: DoorSpec) {
  for (const reg of listRegions(c)) {
    if (!rectContains(rect, reg)) continue;
    const r = ensureRegion(c, regionKey(reg));
    r.door = { ...door };
  }
  c.fronts = (c.fronts ?? []).filter((fr) => !rectsIntersect(fr, rect));
}

/** Una sola puerta para toda la selección (las baldas interiores se mantienen). */
export function addSpanningFront(c: Carcass, rect: Merge, door: DoorSpec, id: string) {
  for (const reg of listRegions(c)) {
    if (!rectsIntersect(rect, reg)) continue;
    const k = regionKey(reg);
    if (c.regions[k]?.door) {
      delete c.regions[k].door;
      cleanRegion(c, k);
    }
  }
  c.fronts = (c.fronts ?? []).filter((fr) => !rectsIntersect(fr, rect));
  c.fronts.push({ id, ...rect, door: { ...door, type: 'door', mount: 'overlay' } });
}

export function removeFronts(c: Carcass, rect: Merge) {
  c.fronts = (c.fronts ?? []).filter((fr) => !rectsIntersect(fr, rect));
  for (const reg of listRegions(c)) {
    const k = regionKey(reg);
    if (rectContains(rect, reg) && c.regions[k]?.door) {
      delete c.regions[k].door;
      cleanRegion(c, k);
    }
  }
}

/** Puertas/cajones que hay dentro de una selección: de huecos sueltos y puertas grandes. */
export function doorsIn(c: Carcass, rect: Merge) {
  const regionKeys = listRegions(c)
    .filter((reg) => rectContains(rect, reg) && c.regions[regionKey(reg)]?.door)
    .map(regionKey);
  const fronts = (c.fronts ?? []).filter((fr) => rectsIntersect(fr, rect));
  return { regionKeys, fronts, count: regionKeys.length + fronts.length };
}

/** Aplica un cambio a todas las puertas de la selección (hojas, bisagras…). */
export function editDoorsIn(c: Carcass, rect: Merge, fn: (d: DoorSpec) => void) {
  const { regionKeys, fronts } = doorsIn(c, rect);
  for (const k of regionKeys) fn(c.regions[k].door!);
  for (const fr of fronts) fn(fr.door);
}

/** Puerta o cajón de un solo hueco. */
export function setRegionDoor(c: Carcass, rect: Merge, door: DoorSpec | undefined) {
  const k = regionKey(rect);
  const r = ensureRegion(c, k);
  r.door = door ? { ...door } : undefined;
  cleanRegion(c, k);
  if (door) c.fronts = (c.fronts ?? []).filter((fr) => !rectsIntersect(fr, rect));
}

/** Lo que sobra de las pistas «repartir» de un casco para ser múltiplo de step (0 si no hay). */
function autoResidue(sizes: number[], tracks: { fixed: boolean }[], step: number) {
  const autos = tracks.map((t, i) => (t.fixed ? 0 : sizes[i]));
  if (!tracks.some((t) => !t.fixed)) return 0;
  const sum = autos.reduce((a, b) => a + b, 0);
  const r = sum - Math.floor(sum / step + 1e-6) * step;
  return r < 0.01 || step - r < 0.01 ? 0 : r;
}

const mm = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

/**
 * Redondea todo a múltiplos de step (mm):
 * - las medidas fijas de filas y columnas, los cubos flotantes y las baldas/divisores añadidos;
 * - el ancho y el alto de cada módulo se reducen lo justo (menos de step) para que las
 *   pistas «repartir» también salgan redondas, y los módulos a la derecha de un puente se
 *   mueven a la izquierda lo justo para que el puente también reparta redondo;
 * - los puentes alineados con una balda del módulo izquierdo (y con su techo) siguen alineados.
 * Devuelve la lista de cambios de tamaño/posición, para enseñarla.
 */
export function roundAll(p: Project, step: number): string[] {
  if (step <= 0) return [];
  const R = (v: number) => Math.round(v / step) * step;
  const changes: string[] = [];
  const links = p.bridges.map((b) => {
    const m = p.modules.find((x) => x.id === b.leftId);
    if (!m) return null;
    const L = layoutCarcass(p, m);
    const sep = L.rowSeps.findIndex((s) => Math.abs(s.a - b.z) < 0.5);
    return { b, m, sep, top: Math.abs(b.z + b.height - m.height) < 0.5, z0: b.z };
  });

  for (const c of [...p.modules, ...p.bridges]) {
    for (const t of [...c.cols, ...c.rows]) if (t.fixed) t.size = Math.max(step, R(t.size));
    for (const r of Object.values(c.regions)) {
      for (const i of r.inserts) i.offset = Math.max(0, R(i.offset));
      if (r.floating) {
        r.floating.width = Math.max(step, R(r.floating.width));
        r.floating.height = Math.max(step, R(r.floating.height));
      }
    }
  }

  // alto: cada módulo baja lo que sobre en sus filas «repartir»
  for (const m of p.modules) {
    const L = layoutCarcass(p, m);
    const r = autoResidue(L.rowH.sizes, m.rows, step);
    if (r > 0) {
      changes.push(`${m.name}: alto ${mm(m.height)} → ${mm(m.height - r)}`);
      m.height -= r;
    }
  }

  // ancho, de izquierda a derecha
  const ordered = [...p.modules].sort((a, b) => a.x - b.x);
  const x0 = new Map(ordered.map((m) => [m.id, m.x]));
  for (const m of ordered) {
    const L = layoutCarcass(p, m);
    const r = autoResidue(L.colW.sizes, m.cols, step);
    if (r > 0) {
      changes.push(`${m.name}: ancho ${mm(m.width)} → ${mm(m.width - r)}`);
      m.width -= r;
    }
    for (const b of p.bridges.filter((b) => b.leftId === m.id)) {
      const right = p.modules.find((x) => x.id === b.rightId);
      if (!right) continue;
      const Lb = layoutCarcass(p, b);
      const rb = autoResidue(Lb.colW.sizes, b.cols, step);
      if (rb > 0) for (const o of ordered) if (o.x >= right.x - 0.01) o.x -= rb;
    }
  }
  for (const m of ordered) {
    const was = x0.get(m.id)!;
    if (Math.abs(m.x - was) > 0.01) changes.push(`${m.name}: posición X ${mm(was)} → ${mm(m.x)}`);
  }

  for (const k of links) {
    if (!k || k.sep < 0) continue;
    k.b.z = layoutCarcass(p, k.m).rowSeps[k.sep].a;
    if (k.top) k.b.height = k.m.height - k.b.z;
    if (Math.abs(k.b.z - k.z0) > 0.01) changes.push(`${k.b.name}: base a ${mm(k.z0)} → ${mm(k.b.z)} (sigue alineado con su balda)`);
  }
  return changes;
}
