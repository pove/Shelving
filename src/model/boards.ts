// Función pura central: proyecto -> lista de tableros.
// Todo lo demás (3D, despiece, cortes, script de Fusion) se alimenta de aquí.
import {
  layoutCarcass,
  listRegions,
  parseKey,
  regionBounds,
  regionKey,
  type CarcassLayout,
} from './grid';
import type { Board, BoardKind, BoardSource, Box, DoorSpec, EdgeSet, Merge, Project } from './types';

export interface BoardsResult {
  boards: Board[];
  layouts: Map<string, CarcassLayout>;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => String(r1(v)).replace('.', ',');

export const NO_EDGES: EdgeSet = { L1: false, L2: false, A1: false, A2: false };

interface AddOpts {
  notes?: string[];
  material?: 'furniture' | 'doors';
  /** Tablero que puede llegar al suelo por detrás (aplica rebaje/retranqueo). */
  plinth?: boolean;
  allEdges?: boolean;
  topEdge?: boolean;
}

export function computeBoards(p: Project): BoardsResult {
  const boards: Board[] = [];
  const layouts = new Map<string, CarcassLayout>();
  const carcasses = [...p.modules, ...p.bridges];
  for (const c of carcasses) {
    const L = layoutCarcass(p, c);
    layouts.set(c.id, L);
    carcassBoards(p, L, boards);
  }
  // nombres únicos por grupo
  const seen = new Map<string, number>();
  for (const b of boards) {
    const k = b.groupId + '|' + b.name;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) b.name = `${b.name} (${n})`;
  }
  return { boards, layouts };
}

function makeBoard(
  p: Project,
  L: CarcassLayout,
  id: string,
  kind: BoardKind,
  name: string,
  box0: Box,
  src: BoardSource,
  o: AddOpts = {},
): Board {
  const g = p.globals;
  const box = { ...box0 };
  const notes = [...(o.notes ?? [])];
  const dims = { x: box.dx, y: box.dy, z: box.dz };
  let normal: 'x' | 'y' | 'z' = 'x';
  if (dims.y < dims[normal]) normal = 'y';
  if (dims.z < dims[normal]) normal = 'z';
  if (kind === 'door' || kind === 'drawerFront') normal = 'y';

  let notch: Board['notch'];
  if (o.plinth && g.plinth.notch) {
    const nh = g.plinth.notchHeight;
    const nd = g.plinth.notchDepth;
    if (box.z < nh && box.y < nd) {
      if (normal === 'z') {
        // tablero horizontal: se retranquea
        const cut = nd - box.y;
        box.y += cut;
        box.dy -= cut;
      } else {
        const z1 = Math.min(box.z + box.dz, nh);
        notch = { z0: box.z, z1, y1: nd };
        notes.push(
          `Rebaje rodapie ${fmt(z1 - box.z)}x${fmt(nd - box.y)} (alto x fondo), detras abajo`,
        );
      }
    }
  }

  const sizes = { x: box.dx, y: box.dy, z: box.dz };
  const others = (['x', 'y', 'z'] as const).filter((a) => a !== normal);
  const frontAxis = normal === 'y' ? 'x' : others.find((a) => a !== 'y')!;
  let [la, wa] = sizes[others[0]] >= sizes[others[1]] ? others : [others[1], others[0]];
  if (Math.abs(sizes[la] - sizes[wa]) < 0.01 && wa === frontAxis) [la, wa] = [wa, la];
  const t = sizes[normal];
  let edges: EdgeSet;
  if (o.allEdges) edges = { L1: true, L2: true, A1: true, A2: true };
  else {
    // canto frontal visible: en piezas de normal y, el canto superior (eje x)
    edges = frontAxis === la ? { ...NO_EDGES, L1: true } : { ...NO_EDGES, A1: true };
    if (o.topEdge === false) edges = { ...NO_EDGES };
  }
  const ov = p.overrides[id];
  if (ov?.edges) edges = { ...ov.edges };
  const rotatable = ov?.rotatable ?? p.settings.rotateByDefault;

  return {
    id,
    name,
    groupId: L.carcass.id,
    groupName: L.carcass.name,
    kind,
    box,
    normal,
    t: r1(t),
    length: r1(sizes[la]),
    width: r1(sizes[wa]),
    notch,
    edges,
    notes,
    rotatable,
    material: o.material ?? 'furniture',
    src,
  };
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function carcassBoards(p: Project, L: CarcassLayout, out: Board[]) {
  const c = L.carcass;
  const g = p.globals;
  const C = c.cols.length;
  const R = c.rows.length;
  const cid = c.id;
  const add = (
    id: string,
    kind: BoardKind,
    name: string,
    box: Box,
    src: BoardSource,
    o?: AddOpts,
  ) => {
    if (box.dx <= 0.01 || box.dy <= 0.01 || box.dz <= 0.01) return;
    // detrás de una puerta embutida, las piezas interiores se retranquean el grosor de la puerta
    if (kind !== 'door' && kind !== 'drawerFront' && kind !== 'drawerBox') {
      for (const r of insetRects) {
        const ox = Math.min(r.x1, box.x + box.dx) - Math.max(r.x0, box.x);
        const oz = Math.min(r.z1, box.z + box.dz) - Math.max(r.z0, box.z);
        if (ox > 0.5 && oz > 0.5 && Math.abs(box.y + box.dy - r.front) < 0.01) {
          box = { ...box, dy: box.dy - g.thickness.door };
          break;
        }
      }
    }
    out.push(makeBoard(p, L, `${cid}:${id}`, kind, name, box, src, o));
  };

  // ---- huecos
  const regions = listRegions(c);
  const rid: number[][] = [];
  for (let col = 0; col < C; col++) {
    rid.push([]);
    for (let r = 0; r < R; r++)
      rid[col].push(
        regions.findIndex((m) => col >= m.c0 && col <= m.c1 && r >= m.r0 && r <= m.r1),
      );
  }
  // huecos tapados por puertas embutidas (de un hueco o de varios)
  const insetRects: { x0: number; x1: number; z0: number; z1: number; front: number }[] = [];
  const insetOf = (m: Merge) =>
    insetRects.push({ x0: L.cols[m.c0].a, x1: L.cols[m.c1].b, z0: L.rows[m.r0].a, z1: L.rows[m.r1].b, front: L.colY[m.c0].b });
  for (const [key, props] of Object.entries(c.regions)) {
    const m = parseKey(key);
    if (props.door?.mount === 'inset' && m.c1 < C && m.r1 < R && regions.some((reg) => regionKey(reg) === key)) insetOf(m);
  }
  for (const fr of c.fronts ?? []) if (fr.door.mount === 'inset' && fr.c1 < C && fr.r1 < R) insetOf(fr);

  const hEdge = (rb: number, col: number) => rid[col][rb - 1] !== rid[col][rb];
  const vEdge = (cb: number, r: number) =>
    r >= 0 && r < R && (L.structural[cb] || rid[cb - 1][r] !== rid[cb][r]);
  /** En el nudo (cb, rb) interior, ¿la pieza horizontal pasa por encima del divisor? */
  const hCovers = (rb: number, cb: number) => {
    if (L.structural[cb]) return false;
    const hl = hEdge(rb, cb - 1);
    const hr = hEdge(rb, cb);
    if (hl && hr) return true;
    if (hl || hr) return !(vEdge(cb, rb - 1) && vEdge(cb, rb));
    return false;
  };
  const zoneOf = (col: number) => c.cols[col].zone;

  // ---- laterales
  const z0 = L.z0;
  const H = L.z1 - L.z0;
  if (L.sideL > 0) {
    const zn = zoneOf(0);
    add(
      'sideL',
      'side',
      zn ? `Lateral A (${lc(zn)})` : 'Lateral A',
      { x: L.x0, y: L.colY[0].a, z: z0, dx: L.sideL, dy: L.colY[0].b - L.colY[0].a, dz: H },
      { type: 'side', carcassId: cid, side: 'left' },
      { plinth: true },
    );
  }
  if (L.sideR > 0) {
    const zn = zoneOf(C - 1);
    const y = L.colY[C - 1];
    add(
      'sideR',
      'side',
      zn ? `Lateral B (${lc(zn)})` : 'Lateral B',
      { x: L.x1 - L.sideR, y: y.a, z: z0, dx: L.sideR, dy: y.b - y.a, dz: H },
      { type: 'side', carcassId: cid, side: 'right' },
      { plinth: true },
    );
  }

  // ---- base y techo (se parten en los cambios de fondo)
  let gs = 0;
  for (let col = 1; col <= C; col++) {
    if (col === C || L.structural[col]) {
      const xa = L.cols[gs].a;
      const xb = L.cols[col - 1].b;
      const y = L.colY[gs];
      const zn = zoneOf(gs);
      const src: BoardSource = { type: 'topBottom', carcassId: cid };
      add(
        `base:${gs}`,
        'base',
        zn ? `${zn} base` : 'Base',
        { x: xa, y: y.a, z: z0, dx: xb - xa, dy: y.b - y.a, dz: L.tBase },
        src,
        { plinth: true },
      );
      add(
        `top:${gs}`,
        'top',
        zn ? `${zn} techo` : 'Techo',
        { x: xa, y: y.a, z: L.z1 - L.tTop, dx: xb - xa, dy: y.b - y.a, dz: L.tTop },
        src,
      );
      gs = col;
    }
  }

  // ---- baldas de la rejilla
  for (let rb = 1; rb < R; rb++) {
    const sep = L.rowSeps[rb - 1];
    const baseName = c.rowSeps[rb - 1]?.name ?? `Balda ${rb}`;
    let col = 0;
    while (col < C) {
      if (!hEdge(rb, col)) {
        col++;
        continue;
      }
      const cs = col;
      while (col + 1 < C && hEdge(rb, col + 1) && hCovers(rb, col + 1)) col++;
      const ce = col;
      col++;
      const xa = cs > 0 && hCovers(rb, cs) ? L.colSeps[cs - 1].a : L.cols[cs].a;
      const xb = ce < C - 1 && hCovers(rb, ce + 1) ? L.colSeps[ce].b : L.cols[ce].b;
      const y = L.colY[cs];
      const zn = zoneOf(cs);
      add(
        `h:${rb}:${cs}`,
        'shelf',
        zn ? `${zn} ${lc(baseName)}` : baseName,
        { x: xa, y: y.a, z: sep.a, dx: xb - xa, dy: y.b - y.a, dz: sep.b - sep.a },
        { type: 'rowSep', carcassId: cid, index: rb - 1 },
        { plinth: true },
      );
    }
  }

  // ---- divisores de la rejilla
  for (let cb = 1; cb < C; cb++) {
    const s = L.colSeps[cb - 1];
    const custom = c.colSeps[cb - 1]?.name;
    const src: BoardSource = { type: 'colSep', carcassId: cid, index: cb - 1 };
    if (L.structural[cb]) {
      const ya = Math.min(L.colY[cb - 1].a, L.colY[cb].a);
      const yb = Math.max(L.colY[cb - 1].b, L.colY[cb].b);
      const zn = zoneOf(cb - 1) ?? zoneOf(cb);
      add(
        `v:${cb}:all`,
        'separator',
        custom ?? (zn ? `Separador ${lc(zn)}` : 'Separador'),
        { x: s.a, y: ya, z: z0, dx: s.b - s.a, dy: yb - ya, dz: H },
        src,
        { plinth: true },
      );
      continue;
    }
    let r = 0;
    while (r < R) {
      if (!vEdge(cb, r)) {
        r++;
        continue;
      }
      const rs = r;
      while (r + 1 < R && vEdge(cb, r + 1) && !hCovers(r + 1, cb)) r++;
      const re = r;
      r++;
      const za = L.rows[rs].a;
      const zb = L.rows[re].b;
      const y = L.colY[cb];
      let auto = rs === re ? `Divisor F${rs + 1}-${cb}` : `Divisor F${rs + 1}-F${re + 1}-${cb}`;
      // junto a un hueco con nombre (p. ej. "Nicho") -> "Divisor nicho"
      const named = [regions[rid[cb - 1][rs]], regions[rid[cb][rs]]]
        .filter((reg) => reg.r0 === rs && reg.r1 === re && c.regions[regionKey(reg)]?.name)
        .sort((a, b) => (a.c1 - a.c0) - (b.c1 - b.c0));
      if (named.length) auto = `Divisor ${lc(c.regions[regionKey(named[0])]!.name!)}`;
      add(
        `v:${cb}:${rs}`,
        'divider',
        custom ?? auto,
        { x: s.a, y: y.a, z: za, dx: s.b - s.a, dy: y.b - y.a, dz: zb - za },
        src,
        { plinth: true },
      );
    }
  }

  /** Frente(s) de puerta o cajón sobre el rectángulo de celdas m. */
  const doorBoards = (m: Merge, d: DoorSpec, label: string, idp: string, src: BoardSource, front: number) => {
    const gap = g.doorGap;
    const tDoor = g.thickness.door;
    let xl: number, xr: number, zl: number, zh: number, dy0: number;
    if (d.mount === 'inset') {
      xl = L.cols[m.c0].a + gap;
      xr = L.cols[m.c1].b - gap;
      zl = L.rows[m.r0].a + gap;
      zh = L.rows[m.r1].b - gap;
      dy0 = front - tDoor;
    } else if (d.mount === 'face') {
      // delante del mueble y del tamaño interior del hueco: deja vistos los cantos
      xl = L.cols[m.c0].a;
      xr = L.cols[m.c1].b;
      zl = L.rows[m.r0].a;
      zh = L.rows[m.r1].b;
      dy0 = front;
    } else {
      const sepFront = (cb: number) => Math.max(L.colY[cb - 1].b, L.colY[cb].b);
      if (m.c0 === 0) xl = L.x0 + gap;
      else {
        const s = L.colSeps[m.c0 - 1];
        xl = sepFront(m.c0) > front + 0.01 ? s.b + gap : (s.a + s.b) / 2 + gap / 2;
      }
      if (m.c1 === C - 1) xr = L.x1 - gap;
      else {
        const s = L.colSeps[m.c1];
        xr = sepFront(m.c1 + 1) > front + 0.01 ? s.a - gap : (s.a + s.b) / 2 - gap / 2;
      }
      if (m.r0 === 0) zl = L.z0 + gap;
      else {
        const s = L.rowSeps[m.r0 - 1];
        zl = (s.a + s.b) / 2 + gap / 2;
      }
      if (m.r1 === R - 1) zh = L.z1 - gap;
      else {
        const s = L.rowSeps[m.r1];
        zh = (s.a + s.b) / 2 - gap / 2;
      }
      dy0 = front;
    }
    const isDrawer = d.type === 'drawer';
    const leaves = isDrawer ? 1 : d.leaves;
    const lw = (xr - xl - (leaves - 1) * gap) / leaves;
    const hgt = zh - zl;
    const hinges = hgt <= 900 ? 2 : hgt <= 1600 ? 3 : hgt <= 2000 ? 4 : 5;
    for (let k = 0; k < leaves; k++) {
      const side = leaves === 2 ? (k === 0 ? 'izquierda' : 'derecha') : d.hinge === 'left' ? 'izquierda' : 'derecha';
      const notes = isDrawer ? ['Frente de cajón: canto 4 lados'] : ['Puerta: canto 4 lados', `${hinges} bisagras a la ${side}`];
      const nm = isDrawer
        ? `Frente cajón ${lc(label)}`
        : `Puerta ${lc(label)}${leaves === 2 ? (k === 0 ? ' izq.' : ' der.') : ''}`;
      add(
        `${idp}:${k}`,
        isDrawer ? 'drawerFront' : 'door',
        nm,
        { x: xl + k * (lw + gap), y: dy0, z: zl, dx: lw, dy: tDoor, dz: hgt },
        src,
        { allEdges: true, material: 'doors', notes },
      );
    }
  };

  // ---- puertas que abarcan varios huecos
  for (const fr of c.fronts ?? []) {
    if (fr.c1 >= C || fr.r1 >= R) continue;
    const label = fr.name ?? `F${fr.r0 + 1}-${fr.r1 + 1} C${fr.c0 + 1}-${fr.c1 + 1}`;
    doorBoards(fr, { ...fr.door, type: 'door' }, label, `front:${fr.id}`, { type: 'front', carcassId: cid, frontId: fr.id }, L.colY[fr.c0].b);
  }

  // ---- contenido de los huecos
  for (const [key, props] of Object.entries(c.regions)) {
    const m = parseKey(key);
    if (m.c1 >= C || m.r1 >= R) continue;
    if (!regions.some((reg) => regionKey(reg) === key)) continue;
    const rb = regionBounds(L, m);
    const label = props.name ?? `Hueco F${m.r0 + 1}C${m.c0 + 1}`;
    const tDoor = g.thickness.door;
    const inset = props.door?.mount === 'inset';
    const ya = rb.y.a;
    const yb = inset ? rb.y.b - tDoor : rb.y.b;
    const srcBase = { type: 'region' as const, carcassId: cid, key };

    // baldas y divisores añadidos
    const hs = props.inserts
      .filter((i) => i.dir === 'h')
      .map((i) => ({ ...i, t: i.thickness ?? g.thickness.shelf }))
      .sort((a, b) => a.offset - b.offset);
    hs.forEach((i, k) => {
      add(
        `ins:${key}:${i.id}`,
        'insert',
        `${label} balda ${k + 1}`,
        { x: rb.x0, y: ya, z: rb.z0 + i.offset, dx: rb.x1 - rb.x0, dy: yb - ya, dz: i.t },
        { ...srcBase, insertId: i.id },
        { plinth: true },
      );
    });
    const cuts: number[] = [rb.z0];
    for (const h of hs) cuts.push(rb.z0 + h.offset, rb.z0 + h.offset + h.t);
    cuts.push(rb.z1);
    const vs = props.inserts
      .filter((i) => i.dir === 'v')
      .map((i) => ({ ...i, t: i.thickness ?? g.thickness.divider }))
      .sort((a, b) => a.offset - b.offset);
    vs.forEach((i, k) => {
      for (let j = 0; j < cuts.length; j += 2) {
        const za = cuts[j];
        const zb = cuts[j + 1];
        if (zb - za < 0.5) continue;
        add(
          `ins:${key}:${i.id}:${j / 2}`,
          'insert',
          `${label} divisor ${k + 1}`,
          { x: rb.x0 + i.offset, y: ya, z: za, dx: i.t, dy: yb - ya, dz: zb - za },
          { ...srcBase, insertId: i.id },
          { plinth: true },
        );
      }
    });

    // cubo flotante
    const f = props.floating;
    if (f) {
      const ts = g.thickness.divider;
      const tb = g.thickness.shelf;
      const sx = f.attach === 'left' ? rb.x0 + f.width : rb.x1 - f.width - ts;
      const bx = f.attach === 'left' ? rb.x0 : sx;
      add(
        `float:${key}:side`,
        'floatSide',
        'Flotante lateral',
        { x: sx, y: ya, z: rb.z1 - f.height, dx: ts, dy: yb - ya, dz: f.height },
        srcBase,
      );
      add(
        `float:${key}:base`,
        'floatBase',
        'Flotante base',
        { x: bx, y: ya, z: rb.z1 - f.height - tb, dx: f.width + ts, dy: yb - ya, dz: tb },
        srcBase,
      );
    }

    // puerta / cajón
    const d = props.door;
    if (d) {
      doorBoards(m, d, label, `door:${key}`, srcBase, rb.y.b);
      if (d.type === 'drawer') drawerBox(p, L, add, key, label, rb, inset ? rb.y.b - tDoor : rb.y.b, srcBase);
    }
  }
}

function drawerBox(
  p: Project,
  L: CarcassLayout,
  add: (id: string, kind: BoardKind, name: string, box: Box, src: BoardSource, o?: AddOpts) => void,
  key: string,
  label: string,
  rb: ReturnType<typeof regionBounds>,
  frontBack: number,
  src: BoardSource,
) {
  void L;
  const bt = p.globals.thickness.drawer;
  const slide = 13;
  const avail = frontBack - rb.y.a - 10;
  const boxD = Math.max(250, Math.floor(avail / 50) * 50);
  const boxH = Math.max(60, rb.z1 - rb.z0 - 40);
  const xa = rb.x0 + slide;
  const xb = rb.x1 - slide;
  const za = rb.z0 + 15;
  const ya = frontBack - boxD;
  const nm = `Cajón ${lc(label)}`;
  const o: AddOpts = { notes: ['Caja de cajón (guías laterales 13 mm)'] };
  add(`drw:${key}:l`, 'drawerBox', `${nm} lateral`, { x: xa, y: ya, z: za, dx: bt, dy: boxD, dz: boxH }, src, o);
  add(`drw:${key}:r`, 'drawerBox', `${nm} lateral`, { x: xb - bt, y: ya, z: za, dx: bt, dy: boxD, dz: boxH }, src, o);
  add(`drw:${key}:b`, 'drawerBox', `${nm} fondo`, { x: xa + bt, y: ya, z: za, dx: xb - xa - 2 * bt, dy: boxD, dz: bt }, src, { ...o, topEdge: false });
  add(`drw:${key}:f`, 'drawerBox', `${nm} frente interior`, { x: xa + bt, y: frontBack - bt, z: za + bt, dx: xb - xa - 2 * bt, dy: bt, dz: boxH - bt }, src, o);
  add(`drw:${key}:t`, 'drawerBox', `${nm} trasera`, { x: xa + bt, y: ya, z: za + bt, dx: xb - xa - 2 * bt, dy: bt, dz: boxH - bt }, src, o);
}
