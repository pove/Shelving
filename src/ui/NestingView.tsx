import { useMemo } from 'react';
import { nest, type NestItem, type NestResult } from '../model/nesting';
import { useStore } from '../store';
import { fmt, NumInput } from './common';
import { summarizeNames, useCutList } from './CutListView';

const PALETTE = ['#e9d4a7', '#d9c08c', '#efdcb6', '#e2cb98', '#f2e4c4', '#dcc59a'];

export default function NestingView() {
  const p = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const rows = useCutList();
  const st = p.settings;

  const results = useMemo(() => {
    const byT = new Map<number, NestItem[]>();
    for (const r of rows)
      for (const id of r.boardIds)
        byT.set(r.t, [...(byT.get(r.t) ?? []), { ref: r.n, id, length: r.length, width: r.width, rotatable: r.rotatable, label: r.names[0] }]);
    return [...byT.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([t, items]) => {
        const sheet = st.sheets.find((s) => Math.abs(s.thickness - t) < 0.01);
        return { t, items, res: sheet ? nest(items, sheet, st.kerf, st.trim) : null };
      });
  }, [rows, st.sheets, st.kerf, st.trim]);

  const totalSheets = results.reduce((s, r) => s + (r.res?.sheets.length ?? 0), 0);

  return (
    <div className="report">
      <h2>Optimización de cortes · {p.name}</h2>
      <p className="muted">
        Corte guillotina · {totalSheets} planchas en total · medidas en mm · la veta va a lo largo de la plancha
      </p>
      <div className="report-tools">
        <label className="check">
          Sierra <NumInput value={st.kerf} min={0} width={50} onChange={(v) => update((d) => void (d.settings.kerf = v))} /> mm
        </label>
        <label className="check">
          Refilado <NumInput value={st.trim} min={0} width={50} onChange={(v) => update((d) => void (d.settings.trim = v))} /> mm
        </label>
        <button
          onClick={() =>
            update((d) => {
              for (const r of rows) for (const id of r.boardIds) d.overrides[id] = { ...d.overrides[id], rotatable: false };
              d.settings.rotateByDefault = false;
            })
          }
        >
          Respetar veta en todas
        </button>
        <button
          onClick={() =>
            update((d) => {
              for (const r of rows) for (const id of r.boardIds) d.overrides[id] = { ...d.overrides[id], rotatable: true };
              d.settings.rotateByDefault = true;
            })
          }
        >
          Permitir girar todas
        </button>
        <button onClick={() => window.print()}>Imprimir / PDF</button>
      </div>

      <h3>Formatos de plancha</h3>
      <table className="list" style={{ maxWidth: 520 }}>
        <thead>
          <tr>
            <th>Espesor</th>
            <th>Largo (veta)</th>
            <th>Ancho</th>
            <th className="no-print" />
          </tr>
        </thead>
        <tbody>
          {st.sheets.map((s, i) => (
            <tr key={i}>
              <td>
                <NumInput value={s.thickness} min={1} onChange={(v) => update((d) => void (d.settings.sheets[i].thickness = v))} />
              </td>
              <td>
                <NumInput value={s.length} min={100} onChange={(v) => update((d) => void (d.settings.sheets[i].length = v))} />
              </td>
              <td>
                <NumInput value={s.width} min={100} onChange={(v) => update((d) => void (d.settings.sheets[i].width = v))} />
              </td>
              <td className="no-print">
                <button className="icon" onClick={() => update((d) => void d.settings.sheets.splice(i, 1))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="report-tools">
        <button onClick={() => update((d) => void d.settings.sheets.push({ thickness: 19, length: 2800, width: 2070 }))}>+ Formato</button>
      </div>

      {results.map(({ t, items, res }) => (
        <section key={t}>
          <h3>Espesor {fmt(t)} mm</h3>
          {!res ? (
            <p className="warn-text">No hay formato de plancha para {fmt(t)} mm: añádelo arriba.</p>
          ) : (
            <SheetGroup res={res} count={items.length} names={rows} />
          )}
        </section>
      ))}
    </div>
  );
}

function SheetGroup({ res, count, names }: { res: NestResult; count: number; names: ReturnType<typeof useCutList> }) {
  const refs = [...new Set(res.sheets.flatMap((s) => s.placed.map((p) => p.item.ref)))].sort((a, b) => a - b);
  return (
    <>
      <div className="stats">
        <span>
          <b>{res.sheets.length}</b> planchas de {res.sheet.length} × {res.sheet.width}
        </span>
        <span>
          <b>{fmt(res.utilization * 100, 1)} %</b> aprovechamiento
        </span>
        <span>
          <b>{count}</b> piezas
        </span>
      </div>
      {res.unplaced.length > 0 && (
        <p className="warn-text">
          No caben en la plancha: {res.unplaced.map((u) => `nº ${u.ref} (${fmt(u.length)} × ${fmt(u.width)})`).join(', ')}
        </p>
      )}
      <div className="sheets">
        {res.sheets.map((s, i) => (
          <div className="sheet-card" key={i}>
            <div className="muted">
              Plancha {i + 1}/{res.sheets.length} · {s.placed.length} piezas · {fmt((s.usedArea / (res.sheet.length * res.sheet.width)) * 100, 1)} %
            </div>
            <SheetSvg res={res} idx={i} />
          </div>
        ))}
      </div>
      <table className="list" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Nº</th>
            <th>Largo × ancho</th>
            <th>Cant.</th>
            <th>Pieza</th>
          </tr>
        </thead>
        <tbody>
          {refs.map((n) => {
            const r = names.find((x) => x.n === n)!;
            return (
              <tr key={n}>
                <td className="n">{n}</td>
                <td className="nowrap">
                  {fmt(r.length)} × {fmt(r.width)}
                  {r.rotatable ? ' (girable)' : ''}
                </td>
                <td className="n">{r.qty}</td>
                <td>{summarizeNames(r.names)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function SheetSvg({ res, idx }: { res: NestResult; idx: number }) {
  const { sheet } = res;
  const s = res.sheets[idx];
  const scale = 520 / sheet.length;
  const fs = 85;
  return (
    <svg width={sheet.length * scale} height={sheet.width * scale} viewBox={`0 0 ${sheet.length} ${sheet.width}`}>
      <rect x={0} y={0} width={sheet.length} height={sheet.width} fill="#f7f5f0" stroke="#8d877c" strokeWidth={6} />
      {s.placed.map((p, i) => {
        const big = p.w > fs * 3.2 && p.h > fs * 1.3;
        return (
          <g key={i}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={PALETTE[p.item.ref % PALETTE.length]} stroke="#7d6240" strokeWidth={3} />
            <text
              x={p.x + p.w / 2}
              y={p.y + p.h / 2 + (big && p.h > fs * 2.6 ? -fs * 0.15 : fs * 0.35)}
              fontSize={Math.min(fs * 1.3, p.h * 0.7, p.w * 0.45)}
              textAnchor="middle"
              fontWeight={700}
              fill="#3b2f1e"
            >
              {p.item.ref}
            </text>
            {big && p.h > fs * 2.6 && (
              <text x={p.x + p.w / 2} y={p.y + p.h / 2 + fs * 1.1} fontSize={fs * 0.8} textAnchor="middle" fill="#5c4a30">
                {fmt(p.item.length)}×{fmt(p.item.width)}
              </text>
            )}
          </g>
        );
      })}
      <text x={sheet.length - 20} y={sheet.width - 20} fontSize={70} textAnchor="end" fill="#8d877c">
        veta →
      </text>
    </svg>
  );
}
