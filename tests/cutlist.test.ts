import { describe, expect, it } from 'vitest';
import { computeBoards } from '../src/model/boards';
import { cutListCsv, groupCutList } from '../src/model/cutlist';
import { defaultProject } from '../src/model/defaults';
import { estanteriaPy } from './reference/estanteria';

describe('despiece', () => {
  const p = defaultProject();
  const { boards } = computeBoards(p);
  const rows = groupCutList(boards);

  it('la suma de cantidades es el número de tableros', () => {
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(boards.length);
  });

  it('mismas medidas (espesor, largo, ancho) que el CSV de Estanteria.py', () => {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const ref = estanteriaPy().map((r) => {
      const d = [r.dx, r.dy, r.dz].sort((a, b) => b - a);
      return `${r1(d[2])}|${r1(d[0])}|${r1(d[1])}`;
    }).sort();
    const ours = boards.map((b) => `${b.t}|${b.length}|${b.width}`).sort();
    expect(ours).toEqual(ref);
  });

  it('CSV con BOM, separador ; y coma decimal', () => {
    const csv = cutListCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split('\r\n');
    expect(lines[0].split(';')[1]).toBe('Espesor (mm)');
    expect(lines.length).toBe(rows.length + 1);
    expect(csv).toContain(';155,5;');
    expect(csv).toContain('Rebaje rodapie');
  });
});
