// Editor en alzado frontal (SVG): selección de celdas, fusión y cotas.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDerived } from '../derived';
import { expandToMerges, findCarcass, listRegions, regionBounds, regionKey, type CarcassLayout } from '../model/grid';
import { findCarcassDraft, setTrackSize } from '../model/ops';
import type { Board, Merge, Project } from '../model/types';
import { useStore } from '../store';
import { fmt } from './common';

const PAD = 260;

interface DragState {
  carcassId: string;
  anchor: Merge;
  moved: boolean;
}

export default function Editor2D() {
  const { boards, layouts, env } = useDerived();
  const p = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const bounds = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, z1 = 0;
    for (const b of boards) {
      x0 = Math.min(x0, b.box.x);
      x1 = Math.max(x1, b.box.x + b.box.dx);
      z1 = Math.max(z1, b.box.z + b.box.dz);
    }
    if (p.environment.show) {
      x0 = Math.min(x0, p.environment.wallX0);
      x1 = Math.max(x1, p.environment.wallX1);
      z1 = Math.max(z1, p.globals.ceiling);
    }
    if (!Number.isFinite(x0)) return { x0: 0, x1: 2000, z1: 2500 };
    return { x0, x1, z1 };
  }, [boards, p.environment, p.globals.ceiling]);

  const vb = `${bounds.x0 - PAD} ${-bounds.z1 - PAD} ${bounds.x1 - bounds.x0 + 2 * PAD} ${bounds.z1 + 2 * PAD}`;

  // los tableros se dibujan de atrás hacia delante (las puertas encima)
  const sorted = useMemo(() => [...boards].sort((a, b) => a.box.y + a.box.dy - (b.box.y + b.box.dy)), [boards]);

  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const onCellDown = (cid: string, reg: Merge, e: React.PointerEvent) => {
    e.stopPropagation();
    const c = findCarcass(p, cid)!;
    if (e.shiftKey && sel.carcassId === cid && sel.cells) {
      const r = expandToMerges(c, union(sel.cells, reg));
      select({ cells: r, boardId: null });
      return;
    }
    drag.current = { carcassId: cid, anchor: reg, moved: false };
    select({ carcassId: cid, cells: reg, boardId: null });
  };
  const onCellEnter = (cid: string, reg: Merge) => {
    setHover(cid + '|' + regionKey(reg));
    const d = drag.current;
    if (!d || d.carcassId !== cid) return;
    const c = findCarcass(p, cid)!;
    d.moved = true;
    select({ cells: expandToMerges(c, union(d.anchor, reg)) });
  };

  const editTrack = (cid: string, axis: 'col' | 'row', i: number, cur: number) => {
    const v = prompt(`Medida interior de ${axis === 'col' ? 'la columna C' : 'la fila F'}${i + 1} (mm):`, String(Math.round(cur * 10) / 10).replace('.', ','));
    if (v == null) return;
    const n = parseFloat(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    update((d) => {
      const c = findCarcassDraft(d as Project, cid);
      if (c) setTrackSize(c, axis, i, n);
    });
  };

  const fs = Math.max(40, (bounds.x1 - bounds.x0) / 75);

  return (
    <div className="editor2d">
      <svg ref={svgRef} viewBox={vb} preserveAspectRatio="xMidYMid meet" onPointerDown={() => select({ cells: null, boardId: null })}>
        <defs>
          <pattern id="hatch" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="40" stroke="#c9c4ba" strokeWidth="6" />
          </pattern>
        </defs>
        {/* entorno */}
        {p.environment.show && (
          <g>
            <line x1={bounds.x0 - PAD} x2={bounds.x1 + PAD} y1={0} y2={0} stroke="#8d877c" strokeWidth={6} />
            {env.boxes
              .filter((e) => e.name.startsWith('Dintel') && !e.name.includes('balconera'))
              .map((e) => (
                <rect key={e.name} x={e.box.x} y={-(e.box.z + e.box.dz)} width={e.box.dx} height={e.box.dz} fill="url(#hatch)" opacity={0.7} />
              ))}
            {p.environment.openings.map((o) => (
              <rect key={o.id} x={o.x} y={-o.height} width={o.width} height={o.height} fill="#fbfaf7" stroke="#b9b3a8" strokeWidth={4} strokeDasharray="20 14" />
            ))}
            <line x1={bounds.x0 - PAD} x2={bounds.x1 + PAD} y1={-p.globals.ceiling} y2={-p.globals.ceiling} stroke="#b9b3a8" strokeWidth={4} strokeDasharray="30 20" />
            <text x={bounds.x0 - PAD + 20} y={-p.globals.ceiling - 20} fontSize={fs * 0.8} fill="#8d877c">
              techo {fmt(p.globals.ceiling)}
            </text>
          </g>
        )}

        {/* huecos (zona clicable) */}
        {[...layouts.values()].map((L) => (
          <CellsLayer
            key={L.carcass.id}
            L={L}
            sel={sel.carcassId === L.carcass.id ? sel.cells : null}
            hover={hover}
            onDown={onCellDown}
            onEnter={onCellEnter}
            fs={fs}
          />
        ))}

        {/* tableros */}
        {sorted.map((b) => (
          <BoardRect
            key={b.id}
            b={b}
            selected={sel.boardId === b.id}
            onDown={(e) => {
              e.stopPropagation();
              select({ carcassId: b.groupId, boardId: b.id, cells: null });
            }}
          />
        ))}

        {/* cotas */}
        {[...layouts.values()].map((L) => (
          <Dims key={L.carcass.id} L={L} fs={fs} onEdit={editTrack} active={sel.carcassId === L.carcass.id} />
        ))}
      </svg>
      <div className="editor-help">
        Clic: hueco · Mayús+clic o arrastrar: rango · Doble clic en una cota: editar · Clic en una balda o divisor: propiedades
      </div>
    </div>
  );
}

function union(a: Merge, b: Merge): Merge {
  return { c0: Math.min(a.c0, b.c0), r0: Math.min(a.r0, b.r0), c1: Math.max(a.c1, b.c1), r1: Math.max(a.r1, b.r1) };
}

function CellsLayer({
  L,
  sel,
  hover,
  onDown,
  onEnter,
  fs,
}: {
  L: CarcassLayout;
  sel: Merge | null;
  hover: string | null;
  onDown: (cid: string, reg: Merge, e: React.PointerEvent) => void;
  onEnter: (cid: string, reg: Merge) => void;
  fs: number;
}) {
  const c = L.carcass;
  const regions = listRegions(c);
  return (
    <g>
      {regions.map((reg) => {
        const rb = regionBounds(L, reg);
        const k = regionKey(reg);
        const inSel = sel && reg.c0 >= sel.c0 && reg.c1 <= sel.c1 && reg.r0 >= sel.r0 && reg.r1 <= sel.r1;
        const isHover = hover === c.id + '|' + k;
        const w = rb.x1 - rb.x0;
        const h = rb.z1 - rb.z0;
        const merged = reg.c0 !== reg.c1 || reg.r0 !== reg.r1;
        const name = c.regions[k]?.name;
        return (
          <g key={k} onPointerDown={(e) => onDown(c.id, reg, e)} onPointerEnter={() => onEnter(c.id, reg)} style={{ cursor: 'pointer' }}>
            <rect
              x={rb.x0}
              y={-rb.z1}
              width={w}
              height={h}
              fill={inSel ? '#9cc3ef' : isHover ? '#efe9dd' : rb.y.b < L.depth ? '#f1ede6' : '#fbfaf8'}
              fillOpacity={inSel ? 0.75 : 1}
            />
            {(merged || name) && w > fs * 3 && h > fs * 2.5 && (
              <text x={rb.x0 + w / 2} y={-rb.z0 - h / 2} fontSize={fs * 0.85} textAnchor="middle" fill="#6b6255" pointerEvents="none">
                {name && <tspan x={rb.x0 + w / 2} dy={-fs * 0.6}>{name}</tspan>}
                <tspan x={rb.x0 + w / 2} dy={name ? fs * 1.1 : 0}>
                  {fmt(w)} × {fmt(h)}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function BoardRect({ b, selected, onDown }: { b: Board; selected: boolean; onDown: (e: React.PointerEvent) => void }) {
  const isDoor = b.kind === 'door' || b.kind === 'drawerFront';
  if (b.kind === 'drawerBox') return null;
  const { x, z, dx, dz } = b.box;
  return (
    <g onPointerDown={onDown} style={{ cursor: 'pointer' }}>
      <rect
        x={x}
        y={-(z + dz)}
        width={dx}
        height={dz}
        fill={selected ? '#f0a33a' : isDoor ? '#e8d3a8' : '#d8bd8a'}
        fillOpacity={isDoor ? (selected ? 0.55 : 0.28) : 1}
        stroke={isDoor ? '#a48552' : '#8f7148'}
        strokeWidth={isDoor ? 3 : 1.5}
        strokeDasharray={isDoor ? '14 8' : undefined}
        pointerEvents={isDoor ? 'stroke' : 'all'}
      />
      {b.kind === 'door' && <DoorMark b={b} />}
    </g>
  );
}

function DoorMark({ b }: { b: Board }) {
  // triángulo de apertura (vértice en el lado de las bisagras)
  const { x, z, dx, dz } = b.box;
  const left = b.notes.some((n) => n.includes('izquierda'));
  const hx = left ? x : x + dx;
  const ox = left ? x + dx : x;
  return <polyline points={`${ox},${-(z + dz)} ${hx},${-(z + dz / 2)} ${ox},${-z}`} fill="none" stroke="#a48552" strokeWidth={2.5} strokeDasharray="10 8" pointerEvents="none" />;
}

function Dims({ L, fs, onEdit, active }: { L: CarcassLayout; fs: number; onEdit: (cid: string, axis: 'col' | 'row', i: number, cur: number) => void; active: boolean }) {
  const c = L.carcass;
  const isBridge = c.kind === 'bridge';
  const colBad = L.colW.mismatch !== 0;
  const rowBad = L.rowH.mismatch !== 0;
  const yTop = -L.z1 - fs * (isBridge ? 0.6 : 1.4);
  const left = c.kind === 'module' ? L.x0 - fs * 0.6 : L.x0 + fs * 0.3;
  const color = (bad: boolean) => (bad ? '#d1242f' : active ? '#1f5fa8' : '#6b6255');
  return (
    <g fontSize={fs} fill="#6b6255">
      {L.cols.map((s, i) => (
        <text
          key={'c' + i}
          x={(s.a + s.b) / 2}
          y={isBridge ? -L.z0 + fs * 1.3 : yTop}
          textAnchor="middle"
          fill={color(colBad)}
          fontWeight={c.cols[i].fixed ? 600 : 400}
          style={{ cursor: 'text' }}
          onDoubleClick={() => onEdit(c.id, 'col', i, L.colW.sizes[i])}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {fmt(L.colW.sizes[i])}
        </text>
      ))}
      {!isBridge &&
        L.rows.map((s, i) => (
          <text
            key={'r' + i}
            x={left}
            y={-(s.a + s.b) / 2 + fs * 0.35}
            textAnchor="end"
            fill={color(rowBad)}
            fontWeight={c.rows[i].fixed ? 600 : 400}
            style={{ cursor: 'text' }}
            onDoubleClick={() => onEdit(c.id, 'row', i, L.rowH.sizes[i])}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {fmt(L.rowH.sizes[i])}
          </text>
        ))}
      {/* cota total */}
      {!isBridge && (
        <g>
          <line x1={L.x0} x2={L.x1} y1={yTop - fs * 1.3} y2={yTop - fs * 1.3} stroke={color(colBad)} strokeWidth={2} />
          <line x1={L.x0} x2={L.x0} y1={yTop - fs * 1.8} y2={yTop - fs * 0.8} stroke={color(colBad)} strokeWidth={2} />
          <line x1={L.x1} x2={L.x1} y1={yTop - fs * 1.8} y2={yTop - fs * 0.8} stroke={color(colBad)} strokeWidth={2} />
          <text x={(L.x0 + L.x1) / 2} y={yTop - fs * 1.6} textAnchor="middle" fill={color(colBad)} fontWeight={600}>
            {c.name} · {fmt(L.x1 - L.x0)}
          </text>
          <text x={L.x0} y={fs * 1.4} fontSize={fs * 0.8} fill="#8d877c">
            x={fmt(L.x0)}
          </text>
        </g>
      )}
      {isBridge && (
        <text x={(L.x0 + L.x1) / 2} y={-L.z0 + fs * 2.6} textAnchor="middle" fill={color(colBad)} fontWeight={600}>
          {c.name} · {fmt(L.x1 - L.x0)} · base a {fmt(L.z0)}
        </text>
      )}
    </g>
  );
}
