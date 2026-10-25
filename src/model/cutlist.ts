// Despiece: agrupación de tableros iguales y exportación CSV.
import type { Board, EdgeSet } from './types';

export interface CutRow {
  n: number;
  t: number;
  length: number;
  width: number;
  qty: number;
  names: string[];
  edges: EdgeSet;
  notes: string;
  rotatable: boolean;
  boardIds: string[];
  material: Board['material'];
}

export function edgeKey(e: EdgeSet) {
  return (['L1', 'L2', 'A1', 'A2'] as const).filter((k) => e[k]).join('+');
}

export function edgeText(e: EdgeSet) {
  const l = +e.L1 + +e.L2;
  const a = +e.A1 + +e.A2;
  const parts: string[] = [];
  if (l) parts.push(`${l} largo${l > 1 ? 's' : ''}`);
  if (a) parts.push(`${a} corto${a > 1 ? 's' : ''}`);
  return parts.join(' + ') || 'sin canto';
}

export function edgeMeters(r: CutRow) {
  return ((+r.edges.L1 + +r.edges.L2) * r.length + (+r.edges.A1 + +r.edges.A2) * r.width) * r.qty / 1000;
}

export function groupCutList(boards: Board[]): CutRow[] {
  const map = new Map<string, CutRow>();
  for (const b of boards) {
    const notes = b.notes.join('. ');
    const k = [b.t, b.length, b.width, edgeKey(b.edges), notes, b.rotatable, b.material].join('|');
    let r = map.get(k);
    if (!r) {
      r = {
        n: 0,
        t: b.t,
        length: b.length,
        width: b.width,
        qty: 0,
        names: [],
        edges: b.edges,
        notes,
        rotatable: b.rotatable,
        boardIds: [],
        material: b.material,
      };
      map.set(k, r);
    }
    r.qty++;
    r.names.push(`${b.groupName} - ${b.name}`);
    r.boardIds.push(b.id);
  }
  const rows = [...map.values()].sort(
    (a, b) => b.t - a.t || b.length - a.length || b.width - a.width || a.notes.localeCompare(b.notes),
  );
  rows.forEach((r, i) => (r.n = i + 1));
  return rows;
}

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const cell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV con separador «;» y coma decimal (Excel en español). Incluye BOM. */
export function cutListCsv(rows: CutRow[]): string {
  const head = ['Nº', 'Espesor (mm)', 'Largo (mm)', 'Ancho (mm)', 'Cantidad', 'Piezas', 'Cantos', 'L1', 'L2', 'A1', 'A2', 'Veta', 'Notas'];
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push(
      [
        String(r.n),
        num(r.t),
        num(r.length),
        num(r.width),
        String(r.qty),
        cell(r.names.join(', ')),
        cell(edgeText(r.edges)),
        r.edges.L1 ? 'X' : '',
        r.edges.L2 ? 'X' : '',
        r.edges.A1 ? 'X' : '',
        r.edges.A2 ? 'X' : '',
        r.rotatable ? 'Libre' : 'Respetar',
        cell(r.notes),
      ].join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
