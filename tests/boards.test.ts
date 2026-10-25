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
      'Derecho - Lateral A', 'Derecho - Flotante base', 'Puente - Base', 'Puente - Techo',
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
