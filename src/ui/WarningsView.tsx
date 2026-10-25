import { useDerived } from '../derived';
import { useStore } from '../store';
import { fmt, NumInput } from './common';

export default function WarningsView() {
  const { warnings } = useDerived();
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setTab);
  const p = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const st = p.settings;
  const icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
  const sorted = [...warnings].sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level));
  return (
    <div className="report">
      <h2>Avisos</h2>
      <div className="report-tools">
        <label className="check">
          Hueco mínimo <NumInput value={st.minHoleWidth} min={0} width={55} onChange={(v) => update((d) => void (d.settings.minHoleWidth = v))} /> ×{' '}
          <NumInput value={st.minHoleHeight} min={0} width={55} onChange={(v) => update((d) => void (d.settings.minHoleHeight = v))} /> mm
        </label>
        <label className="check" title="Para 19 mm; se escala con el espesor (t/19)^0,75">
          Luz máx. sin apoyo (19 mm) <NumInput value={st.maxSpan19} min={100} width={60} onChange={(v) => update((d) => void (d.settings.maxSpan19 = v))} /> mm
        </label>
        <span className="muted">
          28 mm → {fmt(st.maxSpan19 * Math.pow(28 / 19, 0.75), 0)} mm
        </span>
      </div>
      {sorted.length === 0 && <p>Sin avisos.</p>}
      <ul className="warn-list">
        {sorted.map((w, i) => (
          <li
            key={i}
            className={w.level}
            onClick={() => {
              if (!w.carcassId) return;
              select({ carcassId: w.carcassId, boardId: w.boardId ?? null, cells: w.cells ?? null });
              setTab('design');
            }}
          >
            {icon[w.level]} {w.msg}
          </li>
        ))}
      </ul>
    </div>
  );
}
