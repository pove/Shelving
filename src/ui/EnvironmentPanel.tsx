import { useDerived } from '../derived';
import { useStore } from '../store';
import { Field, fmt, NumInput, Section } from './common';

export default function EnvironmentPanel() {
  const p = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const { env: envR } = useDerived();
  const env = p.environment;
  const door = env.sideWall.door;
  return (
    <Section title="Entorno (solo visual)" defaultOpen={false}>
        <label className="check">
          <input type="checkbox" checked={env.show} onChange={(e) => update((d) => void (d.environment.show = e.target.checked))} /> Mostrar entorno
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={env.showDoors !== false}
            onChange={(e) => update((d) => void (d.environment.showDoors = e.target.checked))}
          />{' '}
          Mostrar puertas del entorno (hueco de puerta y balconera)
        </label>
        <div className="grid2">
          <Field label="Pared desde X">
            <NumInput value={env.wallX0} onChange={(v) => update((d) => void (d.environment.wallX0 = v))} />
          </Field>
          <Field label="hasta X">
            <NumInput value={env.wallX1} onChange={(v) => update((d) => void (d.environment.wallX1 = v))} />
          </Field>
          <Field label="Grosor pared">
            <NumInput value={env.wallThickness} min={10} onChange={(v) => update((d) => void (d.environment.wallThickness = v))} />
          </Field>
        </div>
        <h4>Huecos de puerta (con dintel)</h4>
        {env.openings.map((o, i) => (
          <div className="grid2" key={o.id}>
            <Field label="X">
              <NumInput value={o.x} onChange={(v) => update((d) => void (d.environment.openings[i].x = v))} />
            </Field>
            <Field label="Ancho">
              <NumInput value={o.width} min={100} onChange={(v) => update((d) => void (d.environment.openings[i].width = v))} />
            </Field>
            <Field label="Alto">
              <NumInput value={o.height} min={100} onChange={(v) => update((d) => void (d.environment.openings[i].height = v))} />
            </Field>
            <Field label="Hojas">
              <NumInput value={o.leaves} min={0} onChange={(v) => update((d) => void (d.environment.openings[i].leaves = Math.round(v)))} />
            </Field>
            <button className="danger" onClick={() => update((d) => void d.environment.openings.splice(i, 1))}>
              Quitar hueco
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            update((d) => void d.environment.openings.push({ id: Math.random().toString(36).slice(2, 8), x: d.environment.wallX0 + 500, width: 800, height: 2030, leaves: 1 }))
          }
        >
          + Hueco de puerta
        </button>
        <h4>Pared perpendicular y puerta que abre hacia el mueble</h4>
        <div className="grid2">
          <label className="check">
            <input type="checkbox" checked={env.sideWall.enabled} onChange={(e) => update((d) => void (d.environment.sideWall.enabled = e.target.checked))} /> Pared lateral
          </label>
          <Field label="Lado">
            <select value={env.sideWall.side} onChange={(e) => update((d) => void (d.environment.sideWall.side = e.target.value as 'left' | 'right'))}>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={door.enabled} onChange={(e) => update((d) => void (d.environment.sideWall.door.enabled = e.target.checked))} /> Con puerta
          </label>
          <span />
          <Field label="Dist. a pared" hint="De la pared de la estantería a la cara de la hoja abierta a 90°">
            <NumInput value={door.distance} min={0} onChange={(v) => update((d) => void (d.environment.sideWall.door.distance = v))} />
          </Field>
          <Field label="Ancho hoja">
            <NumInput value={door.leaf} min={100} onChange={(v) => update((d) => void (d.environment.sideWall.door.leaf = v))} />
          </Field>
          <Field label="Grosor hoja">
            <NumInput value={door.thickness} min={5} onChange={(v) => update((d) => void (d.environment.sideWall.door.thickness = v))} />
          </Field>
          <Field label="Alto">
            <NumInput value={door.height} min={100} onChange={(v) => update((d) => void (d.environment.sideWall.door.height = v))} />
          </Field>
        </div>
        {envR.maxAngle !== undefined && (
          <p className={envR.maxAngle < 90 ? 'warn-text' : 'ro'}>
            Ángulo máximo de apertura: <b>{fmt(envR.maxAngle, 1)}°</b> (se dibuja la hoja en esa posición)
          </p>
        )}
    </Section>
  );
}
