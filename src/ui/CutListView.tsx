import { useMemo } from 'react';
import { useDerived } from '../derived';
import { cutListCsv, edgeMeters, edgeText, groupCutList, type CutRow } from '../model/cutlist';
import type { EdgeSet } from '../model/types';
import { useStore } from '../store';
import { download, fmt, slug } from './common';

export function EdgeIcon({ e }: { e: EdgeSet }) {
  // L = lados largos (horizontales), A = cortos (verticales); L1 = frontal
  const on = '#1f5fa8';
  const off = '#d8d2c6';
  return (
    <svg className="edge-ico" viewBox="0 0 34 18">
      <rect x="3" y="3" width="28" height="12" fill="#f3ead8" />
      <line x1="3" y1="15" x2="31" y2="15" stroke={e.L1 ? on : off} strokeWidth={e.L1 ? 3 : 1} />
      <line x1="3" y1="3" x2="31" y2="3" stroke={e.L2 ? on : off} strokeWidth={e.L2 ? 3 : 1} />
      <line x1="3" y1="3" x2="3" y2="15" stroke={e.A1 ? on : off} strokeWidth={e.A1 ? 3 : 1} />
      <line x1="31" y1="3" x2="31" y2="15" stroke={e.A2 ? on : off} strokeWidth={e.A2 ? 3 : 1} />
    </svg>
  );
}

export function useCutList() {
  const { boards } = useDerived();
  return useMemo(() => groupCutList(boards), [boards]);
}

export default function CutListView() {
  const rows = useCutList();
  const p = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const byT = useMemo(() => {
    const m = new Map<number, CutRow[]>();
    for (const r of rows) m.set(r.t, [...(m.get(r.t) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const total = rows.reduce((s, r) => s + r.qty, 0);

  const setEdges = (r: CutRow, k: keyof EdgeSet, v: boolean) =>
    update((d) => {
      for (const id of r.boardIds) d.overrides[id] = { ...d.overrides[id], edges: { ...r.edges, [k]: v } };
    });
  const setRot = (r: CutRow, v: boolean) =>
    update((d) => {
      for (const id of r.boardIds) d.overrides[id] = { ...d.overrides[id], rotatable: v };
    });

  return (
    <div className="report">
      <h2>Despiece · {p.name}</h2>
      <p className="muted">
        {total} piezas en {rows.length} referencias · medidas en mm (largo en el sentido de la veta)
      </p>
      <div className="report-tools">
        <button className="primary" onClick={() => download(`despiece_${slug(p.name)}.csv`, cutListCsv(rows), 'text/csv;charset=utf-8')}>
          Exportar CSV
        </button>
        <button onClick={() => window.print()}>Imprimir</button>
        <button
          onClick={() => {
            if (confirm('¿Quitar todos los cambios manuales de cantos y veta?')) update((d) => void (d.overrides = {}));
          }}
        >
          Restablecer cantos
        </button>
        <span className="muted">Cantos: L1 = canto frontal visible, L2 = largo trasero, A1/A2 = cortos. Haz clic en las casillas para cambiarlos.</span>
      </div>
      {byT.map(([t, rs]) => {
        const area = rs.reduce((s, r) => s + (r.length * r.width * r.qty) / 1e6, 0);
        const em = rs.reduce((s, r) => s + edgeMeters(r), 0);
        return (
          <section key={t}>
            <h3>
              Espesor {fmt(t)} mm · {rs.reduce((s, r) => s + r.qty, 0)} piezas · {fmt(area, 2)} m² · {fmt(em, 1)} m de canto
            </h3>
            <table className="list">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Largo</th>
                  <th>Ancho</th>
                  <th>Cant.</th>
                  <th>Pieza</th>
                  <th>Cantos</th>
                  <th className="no-print">L1 L2 A1 A2</th>
                  <th title="Permitir girar la pieza al optimizar">Girar</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={r.n}>
                    <td className="n">{r.n}</td>
                    <td className="n">{fmt(r.length)}</td>
                    <td className="n">{fmt(r.width)}</td>
                    <td className="n">{r.qty}</td>
                    <td>{summarizeNames(r.names)}</td>
                    <td className="nowrap">
                      <EdgeIcon e={r.edges} /> {edgeText(r.edges)}
                    </td>
                    <td className="no-print nowrap">
                      {(['L1', 'L2', 'A1', 'A2'] as const).map((k) => (
                        <input key={k} type="checkbox" title={k} checked={r.edges[k]} onChange={(e) => setEdges(r, k, e.target.checked)} />
                      ))}
                    </td>
                    <td>
                      <input type="checkbox" checked={r.rotatable} onChange={(e) => setRot(r, e.target.checked)} />
                    </td>
                    <td className="muted">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/** "Izquierdo - Balda 1, Izquierdo - Balda 2" -> "Izquierdo: Balda 1, Balda 2" */
export function summarizeNames(names: string[]) {
  const m = new Map<string, string[]>();
  for (const n of names) {
    const i = n.indexOf(' - ');
    const g = i >= 0 ? n.slice(0, i) : '';
    const rest = i >= 0 ? n.slice(i + 3) : n;
    m.set(g, [...(m.get(g) ?? []), rest]);
  }
  return [...m.entries()].map(([g, ns]) => (g ? `${g}: ${ns.join(', ')}` : ns.join(', '))).join(' · ');
}
