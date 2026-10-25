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

/**
 * Redondea las medidas fijas de todas las filas y columnas a múltiplos de step (mm).
 * Los puentes que estaban alineados con una balda del módulo izquierdo (y con su techo)
 * se mueven con ella, para que sigan alineados.
 */
export function roundFixedTracks(p: Project, step: number) {
  if (step <= 0) return;
  const links = p.bridges.map((b) => {
    const m = p.modules.find((x) => x.id === b.leftId);
    if (!m) return null;
    const L = layoutCarcass(p, m);
    const sep = L.rowSeps.findIndex((s) => Math.abs(s.a - b.z) < 0.5);
    return { b, m, sep, top: Math.abs(b.z + b.height - m.height) < 0.5 };
  });
  for (const c of [...p.modules, ...p.bridges])
    for (const t of [...c.cols, ...c.rows]) if (t.fixed) t.size = Math.max(step, Math.round(t.size / step) * step);
  for (const k of links) {
    if (!k || k.sep < 0) continue;
    k.b.z = layoutCarcass(p, k.m).rowSeps[k.sep].a;
    if (k.top) k.b.height = k.m.height - k.b.z;
  }
}
