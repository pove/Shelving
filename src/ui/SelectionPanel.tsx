import type { Draft } from 'immer';
import { useDerived } from '../derived';
import { uid } from '../model/defaults';
import { canMerge, findCarcass, listRegions, rectContains, rectsIntersect, regionAt, regionBounds, regionKey } from '../model/grid';
import { addSpanningFront, cleanRegion, defaultDoor, doorInEachRegion, ensureRegion, removeFronts, findCarcassDraft, insertTrack, mergeCells, removeTrack, setTrackSize, splitCells } from '../model/ops';
import type { Bridge, Carcass, EdgeSet, Merge, Module, Project, RegionProps } from '../model/types';
import { useStore } from '../store';
import { Field, fmt, MountSelect, NumInput, Section, TextInput } from './common';

export default function SelectionPanel() {
  const sel = useStore((s) => s.selection);
  const p = useStore((s) => s.project);
  const c = sel.carcassId ? findCarcass(p, sel.carcassId) : undefined;
  if (!c) return <p className="hint pad">Selecciona un módulo, un hueco o una pieza en el alzado o en la vista 3D.</p>;
  return (
    <>
      {sel.boardId && <BoardPanel boardId={sel.boardId} />}
      {sel.cells && <CellsPanel c={c} rect={sel.cells} />}
      <CarcassPanel c={c} />
    </>
  );
}

function useCarcassUpdate(id: string) {
  const update = useStore((s) => s.update);
  return (fn: (c: Draft<Carcass>, p: Draft<Project>) => void) =>
    update((d) => {
      const c = findCarcassDraft(d as Project, id);
      if (c) fn(c as Draft<Carcass>, d);
    });
}

// ------------------------------------------------------------------ casco

function CarcassPanel({ c }: { c: Carcass }) {
  const p = useStore((s) => s.project);
  const upd = useCarcassUpdate(c.id);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const { layouts } = useDerived();
  const L = layouts.get(c.id);
  if (!L) return null;
  const isModule = c.kind === 'module';

  return (
    <Section title={isModule ? `Módulo: ${c.name}` : `Puente: ${c.name}`}>
      <Field label="Nombre">
        <TextInput value={c.name} onChange={(v) => upd((d) => void (d.name = v))} width={150} />
      </Field>
      {isModule ? (
        <div className="grid2">
          <Field label="Posición X">
            <NumInput value={(c as Module).x} onChange={(v) => upd((d) => void ((d as Module).x = v))} />
          </Field>
          <Field label="Ancho total">
            <NumInput value={(c as Module).width} min={50} invalid={L.colW.mismatch !== 0} onChange={(v) => upd((d) => void ((d as Module).width = v))} />
          </Field>
          <Field label="Alto total">
            <NumInput value={(c as Module).height} min={50} invalid={L.rowH.mismatch !== 0} onChange={(v) => upd((d) => void ((d as Module).height = v))} />
          </Field>
          <Field label="Fondo">
            <NumInput value={c.depth} min={50} onChange={(v) => upd((d) => void (d.depth = v))} />
          </Field>
          <Field label="Lateral izq." hint="Vacío = espesor global de laterales">
            <NumInput value={L.sideL} min={0} onChange={(v) => upd((d) => void ((d as Module).sideLeft = v))} />
          </Field>
          <Field label="Lateral der.">
            <NumInput value={L.sideR} min={0} onChange={(v) => upd((d) => void ((d as Module).sideRight = v))} />
          </Field>
        </div>
      ) : (
        <div className="grid2">
          <Field label="Módulo izq.">
            <select value={(c as Bridge).leftId} onChange={(e) => upd((d) => void ((d as Bridge).leftId = e.target.value))}>
              {p.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Módulo der.">
            <select value={(c as Bridge).rightId} onChange={(e) => upd((d) => void ((d as Bridge).rightId = e.target.value))}>
              {p.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cota base">
            <NumInput value={(c as Bridge).z} min={0} onChange={(v) => upd((d) => void ((d as Bridge).z = v))} />
          </Field>
          <Field label="Alto">
            <NumInput value={(c as Bridge).height} min={20} invalid={L.rowH.mismatch !== 0} onChange={(v) => upd((d) => void ((d as Bridge).height = v))} />
          </Field>
          <Field label="Fondo">
            <NumInput value={c.depth} min={50} onChange={(v) => upd((d) => void (d.depth = v))} />
          </Field>
          <Field label="Ancho (auto)">
            <span className="ro">{fmt(L.x1 - L.x0)}</span>
          </Field>
        </div>
      )}
      {!isModule && (
        <button
          onClick={() =>
            upd((d, pp) => {
              const b = d as Bridge;
              const l = pp.modules.find((m) => m.id === b.leftId);
              if (l) b.height = l.height - b.z;
            })
          }
        >
          Alinear techo con los módulos
        </button>
      )}

      <TrackTable c={c} axis="col" />
      <TrackTable c={c} axis="row" />

      <div className="btn-row">
        <button
          className="danger"
          onClick={() => {
            if (!confirm(`¿Eliminar «${c.name}»?`)) return;
            update((d) => {
              d.modules = d.modules.filter((m) => m.id !== c.id);
              d.bridges = d.bridges.filter((b) => b.id !== c.id && b.leftId !== c.id && b.rightId !== c.id);
            });
            select({ carcassId: null, cells: null, boardId: null });
          }}
        >
          Eliminar {isModule ? 'módulo' : 'puente'}
        </button>
      </div>
    </Section>
  );
}

function TrackTable({ c, axis }: { c: Carcass; axis: 'col' | 'row' }) {
  const upd = useCarcassUpdate(c.id);
  const { layouts } = useDerived();
  const L = layouts.get(c.id)!;
  const tracks = axis === 'col' ? c.cols : c.rows;
  const seps = axis === 'col' ? c.colSeps : c.rowSeps;
  const res = axis === 'col' ? L.colW : L.rowH;
  const sepT = axis === 'col' ? L.colSepT : L.rowSepT;
  const idx = tracks.map((_, i) => i);
  if (axis === 'row') idx.reverse();
  const bad = res.mismatch !== 0;

  return (
    <div className="tracks">
      <div className="tracks-head">
        <strong>{axis === 'col' ? 'Columnas (izq. → der.)' : 'Filas (arriba → abajo)'}</strong>
        <button onClick={() => upd((d) => insertTrack(d, axis, tracks.length))}>+ añadir</button>
      </div>
      {bad && (
        <div className="warn-text">
          {res.mismatch > 0 ? 'Sobran' : 'Faltan'} {fmt(Math.abs(res.mismatch))} mm: no cuadra con el {axis === 'col' ? 'ancho' : 'alto'} total.
          {' '}
          <button className="link" onClick={() => upd((d) => void ((axis === 'col' ? d.cols : d.rows)[axis === 'col' ? d.cols.length - 1 : 0].fixed = false))}>
            Repartir en {axis === 'col' ? 'la última' : 'la de abajo'}
          </button>
        </div>
      )}
      <table className="tt">
        <thead>
          <tr>
            <th>#</th>
            <th title="Medida interior">Interior</th>
            <th title="Fija o repartir">Fija</th>
            {axis === 'col' ? (
              <>
                <th title="Fondo de la zona (vacío = el del módulo)">Fondo</th>
                <th title="Enrasada a la pared (atrás) o al frente">Enrase</th>
                <th>Zona</th>
              </>
            ) : null}
            <th title={axis === 'col' ? 'Grosor del divisor a la derecha' : 'Grosor de la balda encima'}>{axis === 'col' ? 'Div.' : 'Balda'}</th>
            {axis === 'row' && <th>Nombre balda</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {idx.map((i) => {
            const t = tracks[i];
            const hasSep = i < seps.length;
            return (
              <tr key={i}>
                <td>{axis === 'col' ? `C${i + 1}` : `F${i + 1}`}</td>
                <td>
                  <NumInput value={res.sizes[i]} width={56} invalid={bad} onChange={(v) => upd((d) => setTrackSize(d, axis, i, v))} />
                </td>
                <td>
                  <input type="checkbox" checked={t.fixed} onChange={(e) => upd((d) => void ((axis === 'col' ? d.cols : d.rows)[i].fixed = e.target.checked))} />
                </td>
                {axis === 'col' && (
                  <>
                    <td>
                      <NumInput
                        value={c.cols[i].depth ?? c.depth}
                        width={44}
                        onChange={(v) =>
                          upd((d) => {
                            d.cols[i].depth = v === d.depth ? undefined : v;
                          })
                        }
                      />
                    </td>
                    <td>
                      <select value={c.cols[i].align ?? 'back'} onChange={(e) => upd((d) => void (d.cols[i].align = e.target.value as 'back' | 'front'))}>
                        <option value="back">pared</option>
                        <option value="front">frente</option>
                      </select>
                    </td>
                    <td>
                      <TextInput value={c.cols[i].zone ?? ''} width={46} onChange={(v) => upd((d) => void (d.cols[i].zone = v.trim() || undefined))} />
                    </td>
                  </>
                )}
                <td>
                  {hasSep && (
                    <NumInput
                      value={sepT[i]}
                      width={34}
                      min={1}
                      onChange={(v) => upd((d) => void ((axis === 'col' ? d.colSeps : d.rowSeps)[i].thickness = v))}
                    />
                  )}
                </td>
                {axis === 'row' && (
                  <td>
                    {hasSep && (
                      <TextInput value={seps[i].name ?? ''} width={78} placeholder={`Balda ${i + 1}`} onChange={(v) => upd((d) => void (d.rowSeps[i].name = v.trim() || undefined))} />
                    )}
                  </td>
                )}
                <td className="nowrap">
                  <button className="icon" title="Insertar antes" onClick={() => upd((d) => insertTrack(d, axis, axis === 'row' ? i + 1 : i))}>
                    +
                  </button>
                  <button className="icon" title="Eliminar" disabled={tracks.length <= 1} onClick={() => upd((d) => removeTrack(d, axis, i))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ huecos

function CellsPanel({ c, rect }: { c: Carcass; rect: Merge }) {
  const upd = useCarcassUpdate(c.id);
  const select = useStore((s) => s.select);
  const { layouts } = useDerived();
  const L = layouts.get(c.id)!;
  if (rect.c1 >= c.cols.length || rect.r1 >= c.rows.length) return null;
  const region = regionAt(c, rect.c0, rect.r0);
  const isRegion = regionKey(region) === regionKey(rect);
  const multi = rect.c0 !== rect.c1 || rect.r0 !== rect.r1;
  const anyMerge = c.merges.some((m) => rectsIntersect(m, rect));
  const mergeable = canMerge(L, rect);
  const label = `F${rect.r0 + 1}${rect.r1 > rect.r0 ? '-' + (rect.r1 + 1) : ''} C${rect.c0 + 1}${rect.c1 > rect.c0 ? '-' + (rect.c1 + 1) : ''}`;

  return (
    <Section title={`Hueco ${label}`}>
      <div className="btn-row">
        <button
          disabled={!multi || (isRegion && c.merges.some((m) => regionKey(m) === regionKey(rect))) || !mergeable}
          title={mergeable ? 'Une las celdas eliminando baldas y divisores internos' : 'No se puede fusionar a través de un cambio de fondo'}
          onClick={() => {
            let r: Merge = rect;
            upd((d) => void (r = mergeCells(d, rect)));
            select({ cells: r });
          }}
        >
          Fusionar
        </button>
        <button disabled={!anyMerge} onClick={() => upd((d) => splitCells(d, rect))}>
          Separar
        </button>
      </div>
      {isRegion ? (
        <RegionEditor c={c} rect={rect} />
      ) : (
        <p className="hint">Selección de {listRegions(c).filter((r) => rectsIntersect(r, rect)).length} huecos. Fusiónalos para editarlos juntos o ponles puertas abajo.</p>
      )}
      {!isRegion && !mergeable && <p className="warn-text">La selección cruza un cambio de fondo.</p>}
      <FrontsEditor c={c} rect={rect} multi={!isRegion} />
    </Section>
  );
}


/** Puertas sobre varios huecos: una en cada hueco o una sola para toda la selección. */
function FrontsEditor({ c, rect, multi }: { c: Carcass; rect: Merge; multi: boolean }) {
  const upd = useCarcassUpdate(c.id);
  const DEFAULT_DOOR = defaultDoor(useStore((s) => s.project));
  const fronts = (c.fronts ?? []).filter((fr) => rectsIntersect(fr, rect));
  const regs = listRegions(c).filter((r) => rectContains(rect, r));
  const withDoor = regs.filter((r) => c.regions[regionKey(r)]?.door).length;
  return (
    <>
      {multi && (
        <>
          <h4>Puertas en la selección</h4>
          <div className="btn-row">
            <button title="Una puerta independiente en cada hueco seleccionado" onClick={() => upd((d) => doorInEachRegion(d, rect, DEFAULT_DOOR))}>
              + Puerta en cada
            </button>
            <button onClick={() => upd((d) => doorInEachRegion(d, rect, { ...DEFAULT_DOOR, type: 'drawer' }))}>+ Cajones</button>
            <button title="Una sola puerta que tapa toda la selección; las baldas y divisores de dentro se mantienen" onClick={() => upd((d) => addSpanningFront(d, rect, DEFAULT_DOOR, uid()))}>
              + Una puerta
            </button>
            <button disabled={!fronts.length && !withDoor} className="danger" onClick={() => upd((d) => removeFronts(d, rect))}>
              Quitar puertas
            </button>
          </div>
          {withDoor > 0 && <p className="hint">{withDoor} de {regs.length} huecos tienen puerta o cajón propio.</p>}
        </>
      )}
      {fronts.map((fr) => (
        <div key={fr.id} className="front-row">
          <span className="ro">
            Puerta F{fr.r0 + 1}-{fr.r1 + 1} C{fr.c0 + 1}-{fr.c1 + 1}
          </span>
          <select
            value={fr.door.leaves}
            onChange={(e) => upd((d) => void (d.fronts!.find((x) => x.id === fr.id)!.door.leaves = Number(e.target.value) as 1 | 2))}
          >
            <option value={1}>1 hoja</option>
            <option value={2}>2 hojas</option>
          </select>
          <MountSelect value={fr.door.mount} onChange={(m) => upd((d) => void (d.fronts!.find((x) => x.id === fr.id)!.door.mount = m))} />
          {fr.door.leaves === 1 && (
            <select value={fr.door.hinge} onChange={(e) => upd((d) => void (d.fronts!.find((x) => x.id === fr.id)!.door.hinge = e.target.value as 'left' | 'right'))}>
              <option value="left">Bisagras izq.</option>
              <option value="right">Bisagras der.</option>
            </select>
          )}
          <button className="icon" title="Quitar esta puerta" onClick={() => upd((d) => void (d.fronts = d.fronts!.filter((x) => x.id !== fr.id)))}>
            ✕
          </button>
        </div>
      ))}
    </>
  );
}

function RegionEditor({ c, rect }: { c: Carcass; rect: Merge }) {
  const upd = useCarcassUpdate(c.id);
  const p = useStore((s) => s.project);
  const { layouts } = useDerived();
  const L = layouts.get(c.id)!;
  const key = regionKey(rect);
  const props: RegionProps = c.regions[key] ?? { inserts: [] };
  const rb = regionBounds(L, rect);
  const W = rb.x1 - rb.x0;
  const H = rb.z1 - rb.z0;
  const g = p.globals;
  const updR = (fn: (r: Draft<RegionProps>) => void, dropFronts = false) =>
    upd((d) => {
      fn(ensureRegion(d, key) as Draft<RegionProps>);
      cleanRegion(d, key);
      // una puerta propia sustituye a la puerta grande que tapaba este hueco
      if (dropFronts && d.fronts) d.fronts = d.fronts.filter((fr) => !rectsIntersect(fr, rect));
    });

  return (
    <>
      <p className="ro">
        Interior: {fmt(W)} × {fmt(H)} mm · fondo {fmt(rb.y.b - rb.y.a)}
      </p>
      <Field label="Nombre">
        <TextInput value={props.name ?? ''} onChange={(v) => updR((r) => void (r.name = v.trim() || undefined))} width={140} placeholder="(sin nombre)" />
      </Field>

      <h4>Baldas y divisores</h4>
      <div className="btn-row">
        <button onClick={() => updR((r) => void r.inserts.push({ id: uid(), dir: 'h', offset: Math.round((H - g.thickness.shelf) / 2 * 10) / 10 }))}>Partir ½ (balda)</button>
        <button onClick={() => updR((r) => void r.inserts.push({ id: uid(), dir: 'v', offset: Math.round((W - g.thickness.divider) / 2 * 10) / 10 }))}>Partir ½ (divisor)</button>
      </div>
      {props.inserts.length > 0 && (
        <table className="tt">
          <thead>
            <tr>
              <th>Tipo</th>
              <th title="Desde la cara interior inferior / izquierda">Posición</th>
              <th>Grosor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.inserts.map((ins, i) => (
              <tr key={ins.id}>
                <td>{ins.dir === 'h' ? 'Balda' : 'Divisor'}</td>
                <td>
                  <NumInput value={ins.offset} min={0} onChange={(v) => updR((r) => void (r.inserts[i].offset = v))} />
                </td>
                <td>
                  <NumInput
                    value={ins.thickness ?? (ins.dir === 'h' ? g.thickness.shelf : g.thickness.divider)}
                    width={40}
                    min={1}
                    onChange={(v) => updR((r) => void (r.inserts[i].thickness = v))}
                  />
                </td>
                <td>
                  <button className="icon" onClick={() => updR((r) => void r.inserts.splice(i, 1))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="btn-row">
        <button onClick={() => updR((r) => void r.inserts.push({ id: uid(), dir: 'h', offset: Math.min(300, H / 2) }))}>+ Balda</button>
        <button onClick={() => updR((r) => void r.inserts.push({ id: uid(), dir: 'v', offset: Math.min(300, W / 2) }))}>+ Divisor</button>
      </div>

      <h4>Puerta / cajón</h4>
      <div className="grid2">
        <Field label="Frente">
          <select
            value={props.door?.type ?? 'none'}
            onChange={(e) =>
              updR((r) => {
                const v = e.target.value;
                if (v === 'none') r.door = undefined;
                else r.door = { ...defaultDoor(p), ...(r.door ?? {}), type: v as 'door' | 'drawer' };
              }, true)
            }
          >
            <option value="none">Ninguno</option>
            <option value="door">Puerta</option>
            <option value="drawer">Cajón</option>
          </select>
        </Field>
        {props.door && (
          <>
            <Field label="Montaje">
              <MountSelect value={props.door.mount} onChange={(m) => updR((r) => void (r.door!.mount = m))} />
            </Field>
            {props.door.type === 'door' && (
              <>
                <Field label="Hojas">
                  <select value={props.door.leaves} onChange={(e) => updR((r) => void (r.door!.leaves = Number(e.target.value) as 1 | 2))}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </Field>
                {props.door.leaves === 1 && (
                  <Field label="Bisagras">
                    <select value={props.door.hinge} onChange={(e) => updR((r) => void (r.door!.hinge = e.target.value as 'left' | 'right'))}>
                      <option value="left">Izquierda</option>
                      <option value="right">Derecha</option>
                    </select>
                  </Field>
                )}
              </>
            )}
          </>
        )}
      </div>

      <h4>Cubo flotante</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={!!props.floating}
          onChange={(e) =>
            updR((r) => {
              const cw = L.colW.sizes[rect.c0];
              r.floating = e.target.checked ? { attach: 'left', width: Math.min(cw, W / 2), height: Math.min(330, H / 2) } : undefined;
            })
          }
        />
        Colgado de la balda superior
      </label>
      {props.floating && (
        <div className="grid2">
          <Field label="Pegado a">
            <select value={props.floating.attach} onChange={(e) => updR((r) => void (r.floating!.attach = e.target.value as 'left' | 'right'))}>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </Field>
          <Field label="Ancho int.">
            <NumInput value={props.floating.width} min={10} onChange={(v) => updR((r) => void (r.floating!.width = v))} />
          </Field>
          <Field label="Alto int.">
            <NumInput value={props.floating.height} min={10} onChange={(v) => updR((r) => void (r.floating!.height = v))} />
          </Field>
          <Field label="Libre debajo">
            <span className="ro">{fmt(H - props.floating.height - g.thickness.shelf)}</span>
          </Field>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ pieza

function BoardPanel({ boardId }: { boardId: string }) {
  const { boards } = useDerived();
  const update = useStore((s) => s.update);
  const p = useStore((s) => s.project);
  const b = boards.find((x) => x.id === boardId);
  if (!b) return null;
  const upd = useCarcassUpdateStatic(update, b.groupId);
  const src = b.src;
  const setOv = (fn: (o: { edges?: EdgeSet; rotatable?: boolean }) => void) =>
    update((d) => {
      const o = (d.overrides[b.id] ??= {});
      fn(o);
    });

  return (
    <Section title={`Pieza: ${b.name}`}>
      <p className="ro">
        {b.groupName} · {fmt(b.length)} × {fmt(b.width)} × {fmt(b.t)} mm
      </p>
      {b.notes.map((n) => (
        <p key={n} className="hint">
          {n}
        </p>
      ))}
      {src.type === 'rowSep' && (
        <div className="grid2">
          <Field label="Nombre balda">
            <TextInput value={findName(p, src.carcassId, src.index)} width={110} onChange={(v) => upd((d) => void (d.rowSeps[src.index].name = v.trim() || undefined))} />
          </Field>
          <Field label="Grosor">
            <select value={b.t} onChange={(e) => upd((d) => void (d.rowSeps[src.index].thickness = Number(e.target.value)))}>
              {[16, 19, 25, 28, 30].concat(b.t).filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <option key={v} value={v}>
                  {v} mm
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {src.type === 'colSep' && (
        <Field label="Grosor divisor">
          <select value={b.t} onChange={(e) => upd((d) => void (d.colSeps[src.index].thickness = Number(e.target.value)))}>
            {[16, 19, 25, 28, 30].concat(b.t).filter((v, i, a) => a.indexOf(v) === i).map((v) => (
              <option key={v} value={v}>
                {v} mm
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="edges-edit">
        <span>Cantos:</span>
        {(['L1', 'L2', 'A1', 'A2'] as const).map((k) => (
          <label key={k} className="check" title={k.startsWith('L') ? 'Lado largo' : 'Lado corto'}>
            <input
              type="checkbox"
              checked={b.edges[k]}
              onChange={(e) =>
                setOv((o) => {
                  o.edges = { ...b.edges, [k]: e.target.checked };
                })
              }
            />
            {k}
          </label>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={b.rotatable} onChange={(e) => setOv((o) => void (o.rotatable = e.target.checked))} />
        Se puede girar al optimizar (sin veta)
      </label>
    </Section>
  );
}

function findName(p: Project, id: string, index: number) {
  const c = findCarcass(p, id);
  return c?.rowSeps[index]?.name ?? '';
}

function useCarcassUpdateStatic(update: (fn: (d: Draft<Project>) => void) => void, id: string) {
  return (fn: (c: Draft<Carcass>) => void) =>
    update((d) => {
      const c = findCarcassDraft(d as Project, id);
      if (c) fn(c as Draft<Carcass>);
    });
}
