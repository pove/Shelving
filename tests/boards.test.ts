import { describe, expect, it } from 'vitest';
import { computeBoards } from '../src/model/boards';
import { defaultProject, newModule } from '../src/model/defaults';
import { layoutCarcass } from '../src/model/grid';
import type { Board, Project } from '../src/model/types';
import { estanteriaPy } from './reference/estanteria';

const EPS = 0.01;

function overlaps(a: Board, b: Board) {
  const A = a.box, B = b.box;
  const ox = Math.min(A.x + A.dx, B.x + B.dx) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.dy, B.y + B.dy) - Math.max(A.y, B.y);
  const oz = Math.min(A.z + A.dz, B.z + B.dz) - Math.max(A.z, B.z);
  return ox > EPS && oy > EPS && oz > EPS;
}

function findOverlaps(boards: Board[]) {
  const out: string[] = [];
  for (let i = 0; i < boards.length; i++)
    for (let j = i + 1; j < boards.length; j++)
      if (overlaps(boards[i], boards[j])) out.push(`${boards[i].groupName} ${boards[i].name} <-> ${boards[j].groupName} ${boards[j].name}`);
  return out;
}

const key = (x: number, y: number, z: number, dx: number, dy: number, dz: number) =>
  [x, y, z, dx, dy, dz].map((v) => v.toFixed(2)).join(',');

describe('proyecto inicial vs Estanteria.py', () => {
  const p = defaultProject();
  const { boards } = computeBoards(p);
  const ref = estanteriaPy();

  it('mismo número de tableros', () => {
    expect(ref.length).toBe(68);
    expect(boards.length).toBe(ref.length);
  });

  it('mismas cajas (posición y tamaño)', () => {
    const FONDO = 330;
    // Script: Y=0 frente, Y=FONDO pared. App: Y=0 pared.
    const refKeys = ref.map((r) => key(r.x, FONDO - r.y - r.dy, r.z, r.dx, r.dy, r.dz)).sort();
    const ours = boards.map((b) => key(b.box.x, b.box.y, b.box.z, b.box.dx, b.box.dy, b.box.dz)).sort();
    expect(ours).toEqual(refKeys);
  });

  it('mismos rebajes de rodapié', () => {
    const FONDO = 330;
    const refR = ref.filter((r) => r.rebaje).map((r) => key(r.x, FONDO - r.y - r.dy, r.z, r.dx, r.dy, r.dz)).sort();
    const ours = boards.filter((b) => b.notch).map((b) => key(b.box.x, b.box.y, b.box.z, b.box.dx, b.box.dy, b.box.dz)).sort();
    expect(ours).toEqual(refR);
  });

  it('mismos nombres en las piezas principales', () => {
    const names = new Set(boards.map((b) => `${b.groupName} - ${b.name}`));
    for (const n of [
      'Izquierdo - Lateral A (armario)', 'Izquierdo - Separador armario', 'Izquierdo - Armario base',
      'Izquierdo - Armario techo', 'Izquierdo - Lateral B', 'Izquierdo - Base', 'Izquierdo - Techo',
      'Izquierdo - Encimera', 'Izquierdo - Balda franja', 'Izquierdo - Flotante lateral',
      'Izquierdo - Puerta armario bajo', 'Izquierdo - Puerta armario alto', 'Izquierdo - Armario alto balda 1',
      'Derecho - Lateral A', 'Derecho - Flotante base', 'Derecho - Divisor nicho', 'Puente - Base', 'Puente - Techo',
    ]) expect(names).toContain(n);
  });

  it('sin solapes entre tableros', () => {
    expect(findOverlaps(boards)).toEqual([]);
  });

  it('medidas de referencia', () => {
    const L = layoutCarcass(p, p.modules[0]);
    expect(L.colW.sizes.map((v) => +v.toFixed(1))).toEqual([707, 313.6, 313.6, 252.8]);
    expect(L.rowH.sizes[3]).toBeCloseTo(900.5, 6);
    expect(L.colW.mismatch).toBe(0);
    expect(L.rowH.mismatch).toBe(0);
    const enc = boards.find((b) => b.groupId === 'izq' && b.name === 'Encimera')!;
    expect(enc.t).toBe(28);
    expect(enc.box.z + enc.box.dz).toBeCloseTo(900.5, 6);
  });

  it('cantos: frontal por defecto, 4 en puertas', () => {
    const door = boards.find((b) => b.kind === 'door')!;
    expect(door.edges).toEqual({ L1: true, L2: true, A1: true, A2: true });
    const shelf = boards.find((b) => b.name === 'Encimera')!;
    expect(shelf.edges.L1).toBe(true);
    expect(shelf.edges.L2 || shelf.edges.A1 || shelf.edges.A2).toBe(false);
    const div = boards.find((b) => b.name.startsWith('Divisor F2'))!; // 330 x 330: canto en alto
    expect(div.edges.L1 || div.edges.A1).toBe(true);
  });
});

describe('totales', () => {
  it('cada módulo ocupa exactamente su ancho y alto', () => {
    const p = defaultProject();
    const { boards, layouts } = computeBoards(p);
    for (const m of p.modules) {
      const bs = boards.filter((b) => b.groupId === m.id && b.kind !== 'door');
      const minX = Math.min(...bs.map((b) => b.box.x));
      const maxX = Math.max(...bs.map((b) => b.box.x + b.box.dx));
      const maxZ = Math.max(...bs.map((b) => b.box.z + b.box.dz));
      expect(minX).toBeCloseTo(m.x, 6);
      expect(maxX).toBeCloseTo(m.x + m.width, 6);
      expect(maxZ).toBeCloseTo(m.height, 6);
      const L = layouts.get(m.id)!;
      const sumW = L.sideL + L.sideR + L.colW.sizes.reduce((s, v) => s + v, 0) + L.colSepT.reduce((s, v) => s + v, 0);
      expect(sumW).toBeCloseTo(m.width, 6);
    }
  });

  it('marca descuadre cuando todas las medidas son fijas', () => {
    const p = defaultProject();
    p.modules[1].cols.forEach((c) => { c.fixed = true; c.size = 300; });
    const L = layoutCarcass(p, p.modules[1]);
    expect(L.colW.mismatch).toBeCloseTo(1780 - 56 - 76 - 1500, 6);
  });
});

describe('rejillas genéricas sin solapes', () => {
  const base = (): Project => {
    const p = defaultProject();
    p.bridges = [];
    p.modules = [newModule(0, p.globals)];
    return p;
  };

  it('rejilla simple 4x6: baldas corridas y divisores cortados', () => {
    const p = base();
    const { boards } = computeBoards(p);
    expect(findOverlaps(boards)).toEqual([]);
    expect(boards.filter((b) => b.kind === 'shelf').length).toBe(5);
    expect(boards.filter((b) => b.kind === 'divider').length).toBe(18);
  });

  it('fusiones en L, inserciones, flotante, puertas y cajones', () => {
    const p = base();
    const m = p.modules[0];
    m.merges = [
      { c0: 0, r0: 0, c1: 1, r1: 1 },
      { c0: 2, r0: 1, c1: 3, r1: 3 },
      { c0: 0, r0: 4, c1: 0, r1: 5 },
    ];
    m.regions = {
      '0:0:1:1': { inserts: [{ id: 'a', dir: 'h', offset: 100 }, { id: 'b', dir: 'v', offset: 200 }], door: { type: 'door', mount: 'overlay', leaves: 2, hinge: 'left' } },
      '2:1:3:3': { inserts: [], floating: { attach: 'right', width: 200, height: 250 } },
      '0:4:0:5': { inserts: [], door: { type: 'drawer', mount: 'inset', leaves: 1, hinge: 'left' } },
      '3:5:3:5': { inserts: [], door: { type: 'door', mount: 'overlay', leaves: 1, hinge: 'right' } },
    };
    const { boards } = computeBoards(p);
    expect(findOverlaps(boards)).toEqual([]);
    expect(boards.filter((b) => b.kind === 'door').length).toBe(3);
    expect(boards.filter((b) => b.kind === 'drawerBox').length).toBe(5);
  });

  it('zona de fondo distinto enrasada al frente', () => {
    const p = base();
    const m = p.modules[0];
    m.cols[3].depth = 250;
    m.cols[3].align = 'front';
    const { boards } = computeBoards(p);
    expect(findOverlaps(boards)).toEqual([]);
    expect(boards.filter((b) => b.kind === 'separator').length).toBe(1);
    expect(boards.filter((b) => b.kind === 'base').length).toBe(2);
  });
});

describe('entorno', () => {
  it('la balconera abre algo más de 90° antes de tocar la puerta del armario', async () => {
    const { maxDoorAngle } = await import('../src/model/environment');
    const p = defaultProject();
    const a = maxDoorAngle(p, computeBoards(p).boards);
    expect(a).toBeGreaterThanOrEqual(90);
    expect(a).toBeLessThan(91);
  });
  it('si el armario sobresale más que la bisagra, no llega a 90°', async () => {
    const { maxDoorAngle } = await import('../src/model/environment');
    const p = defaultProject();
    p.modules[0].cols[0].depth = 320;
    const a = maxDoorAngle(p, computeBoards(p).boards);
    expect(a).toBeLessThan(90);
  });
});

describe('avisos', () => {
  it('el proyecto inicial no tiene errores', async () => {
    const { derive } = await import('../src/derived');
    const d = derive(defaultProject());
    const errs = d.warnings.filter((w) => w.level !== 'info');
    expect(errs.map((w) => w.msg)).toEqual([]);
  });
  it('detecta baldas largas sin apoyo y piezas mayores que la plancha', async () => {
    const { derive } = await import('../src/derived');
    const p = defaultProject();
    p.modules[1].merges.push({ c0: 0, r0: 0, c1: 4, r1: 1 }, { c0: 0, r0: 2, c1: 4, r1: 2 });
    p.settings.sheets = p.settings.sheets.map((s) => ({ ...s, length: 2000 }));
    const d = derive(p);
    expect(d.warnings.some((w) => w.msg.includes('sin apoyo'))).toBe(true);
    expect(d.warnings.some((w) => w.msg.includes('no cabe en la plancha'))).toBe(true);
  });
});

describe('puertas sobre varios huecos', () => {
  it('una puerta en cada hueco o una sola para toda la selección, sin solapes', async () => {
    const { addSpanningFront, doorInEachRegion, removeFronts, insertTrack } = await import('../src/model/ops');
    const door = { type: 'door' as const, mount: 'overlay' as const, leaves: 1 as const, hinge: 'left' as const };
    // 2 filas x 3 columnas de cubos del módulo derecho
    const p = defaultProject();
    doorInEachRegion(p.modules[1], { c0: 0, r0: 0, c1: 2, r1: 1 }, door);
    let r = computeBoards(p);
    expect(r.boards.filter((b) => b.groupId === 'der' && b.kind === 'door').length).toBe(6);
    expect(findOverlaps(r.boards)).toEqual([]);

    addSpanningFront(p.modules[1], { c0: 0, r0: 0, c1: 2, r1: 1 }, { ...door, leaves: 2 }, 'f1');
    r = computeBoards(p);
    const doors = r.boards.filter((b) => b.groupId === 'der' && b.kind === 'door');
    expect(doors.length).toBe(2); // dos hojas, las 6 puertas pequeñas desaparecen
    // las baldas y divisores interiores se mantienen
    expect(r.boards.filter((b) => b.groupId === 'der' && b.kind === 'divider').length).toBe(21);
    expect(findOverlaps(r.boards)).toEqual([]);
    // tapa desde el lateral (holgura 3) hasta la mitad del divisor C3|C4
    const L = r.layouts.get('der')!;
    expect(doors[0].box.x).toBeCloseTo(3915 + 3, 6);
    expect(doors[1].box.x + doors[1].box.dx).toBeCloseTo((L.colSeps[2].a + L.colSeps[2].b) / 2 - 1.5, 6);
    expect(doors[0].box.z).toBeCloseTo(3, 6);

    // insertar una columna antes desplaza la puerta
    insertTrack(p.modules[1], 'col', 0);
    expect(p.modules[1].fronts![0].c0).toBe(1);
    removeFronts(p.modules[1], { c0: 0, r0: 0, c1: 5, r1: 5 });
    expect(p.modules[1].fronts).toEqual([]);
  });
});

describe('acciones de puertas de la barra', () => {
  it('poner, cambiar bisagras y quitar puertas de una selección', async () => {
    const { doorsIn, editDoorsIn, setRegionDoor, addSpanningFront, removeFronts } = await import('../src/model/ops');
    const door = { type: 'door' as const, mount: 'overlay' as const, leaves: 1 as const, hinge: 'left' as const };
    const m = defaultProject().modules[1];
    const all = { c0: 0, r0: 0, c1: 4, r1: 1 };
    setRegionDoor(m, { c0: 0, r0: 0, c1: 0, r1: 0 }, door);
    addSpanningFront(m, { c0: 2, r0: 0, c1: 3, r1: 1 }, door, 'f');
    expect(doorsIn(m, all).count).toBe(2);
    editDoorsIn(m, all, (d) => void (d.hinge = 'right'));
    expect(m.regions['0:0:0:0'].door!.hinge).toBe('right');
    expect(m.fronts![0].door.hinge).toBe('right');
    // una puerta propia sustituye a la grande que la tapaba
    setRegionDoor(m, { c0: 2, r0: 0, c1: 2, r1: 0 }, door);
    expect(m.fronts).toEqual([]);
    removeFronts(m, all);
    expect(doorsIn(m, all).count).toBe(0);
    expect(m.regions['0:0:0:0']).toBeUndefined();
  });
});

describe('redondeo de medidas', () => {
  it('reparte en múltiplos de 5 o 10 mm y la última columna absorbe la diferencia', async () => {
    const { resolveTracks } = await import('../src/model/grid');
    const t = Array.from({ length: 5 }, () => ({ size: 0, fixed: false }));
    expect(resolveTracks(t, 1648).sizes[0]).toBeCloseTo(329.6, 6);
    const r10 = resolveTracks(t, 1648, 10);
    expect(r10.sizes).toEqual([330, 330, 330, 330, 328]);
    expect(r10.mismatch).toBe(0);
    const r5 = resolveTracks([...t, { size: 100.4, fixed: true }], 1748.4, 5);
    expect(r5.sizes.slice(0, 4)).toEqual([330, 330, 330, 330]);
    expect(r5.mismatch).toBe(0);
  });

  it('el proyecto inicial redondeado sigue sin solapes y con los totales exactos', async () => {
    const { roundFixedTracks } = await import('../src/model/ops');
    const p = defaultProject();
    p.globals.rounding = 10;
    roundFixedTracks(p, 10);
    const { boards, layouts } = computeBoards(p);
    expect(findOverlaps(boards)).toEqual([]);
    for (const L of layouts.values()) {
      expect(L.colW.mismatch).toBe(0);
      expect(L.rowH.mismatch).toBe(0);
    }
    const der = layouts.get('der')!;
    expect(der.colW.sizes).toEqual([330, 330, 330, 330, 328]);
    const izq = layouts.get('izq')!;
    expect(izq.colW.sizes.slice(0, 3)).toEqual([710, 310, 310]);
    // el puente sigue alineado con la balda franja y con el techo de los módulos
    const franja = boards.find((b) => b.groupId === 'izq' && b.name === 'Balda franja')!;
    const base = boards.find((b) => b.groupId === 'puente' && b.name === 'Base')!;
    expect(base.box.z).toBeCloseTo(franja.box.z, 6);
    expect(layouts.get('puente')!.z1).toBeCloseTo(2490, 6);
    expect(layouts.get('puente')!.rowH.sizes[0]).toBeCloseTo(300, 6);
  });
});
