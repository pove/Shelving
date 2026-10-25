// Barra de acciones del alzado: lo que se puede hacer con la selección actual,
// a un toque (pensada sobre todo para el móvil, donde no hay Mayús ni clic derecho).
import type { Draft } from 'immer';
import { useDerived } from '../derived';
import { uid } from '../model/defaults';
import { canMerge, findCarcass, listRegions, rectContains, rectsIntersect, regionKey } from '../model/grid';
import { addSpanningFront, doorInEachRegion, doorsIn, editDoorsIn, findCarcassDraft, mergeCells, removeFronts, setRegionDoor, splitCells } from '../model/ops';
import type { Carcass, DoorSpec, Merge, Project } from '../model/types';
import { useStore } from '../store';

const DOOR: DoorSpec = { type: 'door', mount: 'overlay', leaves: 1, hinge: 'left' };
const DRAWER: DoorSpec = { ...DOOR, type: 'drawer' };

export default function ActionBar() {
  const p = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const multi = useStore((s) => s.multiSelect);
  const setMulti = useStore((s) => s.setMultiSelect);
  const { boards, layouts } = useDerived();

  const c = sel.carcassId ? findCarcass(p, sel.carcassId) : undefined;
  const upd = (fn: (c: Draft<Carcass>) => void) =>
    update((d) => {
      const cc = c && findCarcassDraft(d as Project, c.id);
      if (cc) fn(cc as Draft<Carcass>);
    });

  // una puerta seleccionada directamente: se trata como su hueco o su puerta grande
  const board = sel.boardId ? boards.find((b) => b.id === sel.boardId) : undefined;
  let rect: Merge | null = sel.cells;
  if (!rect && c && board && (board.kind === 'door' || board.kind === 'drawerFront')) {
    if (board.src.type === 'region') {
      const [c0, r0, c1, r1] = board.src.key.split(':').map(Number);
      rect = { c0, r0, c1, r1 };
    } else if (board.src.type === 'front') {
      const id = board.src.frontId;
      rect = c.fronts?.find((f) => f.id === id) ?? null;
    }
  }

  const multiBtn = (
    <button
      className={'toggle' + (multi ? ' on' : '')}
      aria-pressed={multi}
      title="Cada toque añade el hueco a la selección (como Mayús+clic)"
      onClick={() => setMulti(!multi)}
    >
      {multi ? '✓ Varios' : 'Varios'}
    </button>
  );

  if (!c || !rect) {
    return (
      <div className="actionbar">
        <span className="ab-label">
          {multi ? 'Toca el primer hueco y luego el último' : 'Toca un hueco para ver qué puedes hacer con él'}
        </span>
        {multiBtn}
      </div>
    );
  }

  const L = layouts.get(c.id);
  const regs = listRegions(c).filter((r) => rectContains(rect!, r));
  const n = regs.length;
  const single = n === 1;
  const doors = doorsIn(c, rect);
  const mergeable = !!L && canMerge(L, rect);
  const isMerged = c.merges.some((m) => regionKey(m) === regionKey(rect!));
  const anyMerge = c.merges.some((m) => rectsIntersect(m, rect!));
  // puerta "principal" para mostrar su estado (bisagras/hojas)
  const first = doors.regionKeys.length ? c.regions[doors.regionKeys[0]].door! : doors.fronts[0]?.door;
  const label = `${c.name} · ${single ? '1 hueco' : `${n} huecos`}${doors.count ? ` · ${doors.count === 1 ? (first?.type === 'drawer' ? 'cajón' : 'puerta') : `${doors.count} puertas/cajones`}` : ''}`;
  const clear = () => select({ cells: null, boardId: null });

  return (
    <div className="actionbar">
      <span className="ab-label">{label}</span>
      <div className="ab-buttons">
        {multiBtn}
        {n > 1 && mergeable && !isMerged && (
          <button
            title="Quita las baldas y divisores de dentro"
            onClick={() => {
              let r: Merge = rect!;
              upd((d) => void (r = mergeCells(d, rect!)));
              select({ cells: r, boardId: null });
            }}
          >
            Fusionar
          </button>
        )}
        {anyMerge && <button onClick={() => upd((d) => splitCells(d, rect!))}>Separar</button>}

        {doors.count === 0 && single && (
          <>
            <button className="add" onClick={() => upd((d) => setRegionDoor(d, regs[0], DOOR))}>
              + Puerta
            </button>
            <button className="add" onClick={() => upd((d) => setRegionDoor(d, regs[0], DRAWER))}>
              + Cajón
            </button>
          </>
        )}
        {doors.count === 0 && !single && (
          <>
            <button className="add" title="Una sola puerta que tapa toda la selección; las baldas de dentro se mantienen" onClick={() => upd((d) => addSpanningFront(d, rect!, DOOR, uid()))}>
              + Una puerta
            </button>
            <button className="add" onClick={() => upd((d) => doorInEachRegion(d, rect!, DOOR))}>
              + Puerta en cada
            </button>
            <button className="add" onClick={() => upd((d) => doorInEachRegion(d, rect!, DRAWER))}>
              + Cajones
            </button>
          </>
        )}
        {doors.count > 0 && first && (
          <>
            {first.type === 'door' && (
              <>
                <button
                  title="Cambia el número de hojas"
                  onClick={() => upd((d) => editDoorsIn(d, rect!, (x) => void (x.leaves = first.leaves === 1 ? 2 : 1)))}
                >
                  {first.leaves === 1 ? '1 hoja → 2' : '2 hojas → 1'}
                </button>
                {first.leaves === 1 && (
                  <button onClick={() => upd((d) => editDoorsIn(d, rect!, (x) => void (x.hinge = first.hinge === 'left' ? 'right' : 'left')))}>
                    Bisagras {first.hinge === 'left' ? 'izq. → der.' : 'der. → izq.'}
                  </button>
                )}
              </>
            )}
            <button
              className="danger"
              onClick={() => {
                upd((d) => removeFronts(d, rect!));
                if (board) clear();
              }}
            >
              Quitar {doors.count > 1 ? 'puertas' : first.type === 'drawer' ? 'cajón' : 'puerta'}
            </button>
          </>
        )}
        <button
          title="Más opciones del hueco (baldas, cubo flotante, nombre…)"
          onClick={() => document.getElementById('sel-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Más…
        </button>
        <button className="icon" title="Quitar la selección" onClick={clear}>
          ✕
        </button>
      </div>
    </div>
  );
}
