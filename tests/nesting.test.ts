import { describe, expect, it } from 'vitest';
import { computeBoards } from '../src/model/boards';
import { groupCutList } from '../src/model/cutlist';
import { defaultProject } from '../src/model/defaults';
import { nest, type NestItem } from '../src/model/nesting';

function check(res: ReturnType<typeof nest>, kerf: number, trim: number) {
  for (const sh of res.sheets) {
    for (const p of sh.placed) {
      expect(p.x).toBeGreaterThanOrEqual(trim - 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(trim - 1e-9);
      expect(p.x + p.w).toBeLessThanOrEqual(res.sheet.length - trim + 1e-9);
      expect(p.y + p.h).toBeLessThanOrEqual(res.sheet.width - trim + 1e-9);
      if (!p.item.rotatable) expect(p.rotated).toBe(false);
    }
    for (let i = 0; i < sh.placed.length; i++)
      for (let j = i + 1; j < sh.placed.length; j++) {
        const a = sh.placed[i], b = sh.placed[j];
        const sep = a.x + a.w + kerf <= b.x + 1e-9 || b.x + b.w + kerf <= a.x + 1e-9 || a.y + a.h + kerf <= b.y + 1e-9 || b.y + b.h + kerf <= a.y + 1e-9;
        expect(sep).toBe(true);
      }
  }
}

describe('optimización de cortes', () => {
  it('coloca todas las piezas sin solapes, respetando sierra, refilado y veta', () => {
    const p = defaultProject();
    const rows = groupCutList(computeBoards(p).boards);
    for (const t of [19, 28]) {
      const items: NestItem[] = rows
        .filter((r) => r.t === t)
        .flatMap((r) => r.boardIds.map((id) => ({ ref: r.n, id, length: r.length, width: r.width, rotatable: r.rotatable, label: '' })));
      const sheet = p.settings.sheets.find((s) => s.thickness === t)!;
      const res = nest(items, sheet, 4, 10);
      expect(res.unplaced).toEqual([]);
      expect(res.sheets.reduce((s, x) => s + x.placed.length, 0)).toBe(items.length);
      check(res, 4, 10);
      const area = items.reduce((s, i) => s + i.length * i.width, 0);
      expect(res.sheets.length).toBeGreaterThanOrEqual(Math.ceil(area / (sheet.length * sheet.width)));
      expect(res.utilization).toBeGreaterThan(0.5);
    }
  });

  it('gira las piezas cuando se permite', () => {
    const items: NestItem[] = Array.from({ length: 6 }, (_, i) => ({ ref: 1, id: String(i), length: 1000, width: 2000, rotatable: true, label: '' }));
    const res = nest(items, { thickness: 19, length: 2800, width: 2070 }, 4, 10);
    expect(res.unplaced).toEqual([]);
    check(res, 4, 10);
  });

  it('una pieza mayor que la plancha queda sin colocar', () => {
    const res = nest([{ ref: 1, id: 'x', length: 3000, width: 300, rotatable: false, label: '' }], { thickness: 19, length: 2800, width: 2070 }, 4, 10);
    expect(res.unplaced.length).toBe(1);
  });
});
