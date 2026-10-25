import { useRef, useState } from 'react';
import { defaultProject, newModule, uid } from '../model/defaults';
import { roundAll } from '../model/ops';
import type { Project } from '../model/types';
import { migrate, useStore } from '../store';
import EnvironmentPanel from './EnvironmentPanel';
import { download, Field, NumInput, Section, slug, TextInput } from './common';

export default function GlobalPanel() {
  const p = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const replace = useStore((s) => s.replace);
  const select = useStore((s) => s.select);
  const fileRef = useRef<HTMLInputElement>(null);
  const [roundMsg, setRoundMsg] = useState<string[] | null>(null);
  const g = p.globals;
  const T = g.thickness;

  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Project;
      if (data.version !== 1 || !Array.isArray(data.modules)) throw new Error('Formato no reconocido');
      replace(migrate(data));
    } catch (e) {
      alert('No se pudo importar el proyecto: ' + (e as Error).message);
    }
  };

  const thick = (k: keyof typeof T, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumInput value={T[k]} min={1} onChange={(v) => update((d) => void (d.globals.thickness[k] = v))} />
    </Field>
  );

  return (
    <>
      <Section title="Proyecto">
        <Field label="Nombre">
          <TextInput value={p.name} onChange={(v) => update((d) => void (d.name = v))} width={150} />
        </Field>
        <div className="btn-row">
          <button onClick={() => download(`${slug(p.name)}.json`, JSON.stringify(p, null, 2), 'application/json')}>Exportar .json</button>
          <button onClick={() => fileRef.current?.click()}>Importar .json</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        <div className="btn-row">
          <button
            onClick={() => {
              const last = [...p.modules].sort((a, b) => b.x + b.width - (a.x + a.width))[0];
              const x = last ? last.x + last.width + 100 : 0;
              const m = newModule(x, g);
              m.name = `Módulo ${p.modules.length + 1}`;
              update((d) => void d.modules.push(m));
              select({ carcassId: m.id, cells: null, boardId: null });
            }}
          >
            + Módulo
          </button>
          <button
            disabled={p.modules.length < 2}
            title="Une dos módulos por arriba"
            onClick={() => {
              const ms = [...p.modules].sort((a, b) => a.x - b.x);
              const l = ms[0];
              const r = ms[1];
              const id = uid();
              update((d) =>
                void d.bridges.push({
                  kind: 'bridge',
                  id,
                  name: `Puente ${d.bridges.length + 1}`,
                  leftId: l.id,
                  rightId: r.id,
                  z: Math.max(0, l.height - 340),
                  height: 340,
                  depth: g.depth,
                  cols: [1, 2, 3].map(() => ({ size: 0, fixed: false })),
                  rows: [{ size: 0, fixed: false }],
                  colSeps: [{}, {}],
                  rowSeps: [],
                  merges: [],
                  regions: {},
                }),
              );
              select({ carcassId: id, cells: null, boardId: null });
            }}
          >
            + Puente
          </button>
          <button
            onClick={() => {
              if (confirm('¿Sustituir el proyecto por el ejemplo inicial? (se puede deshacer)')) replace(defaultProject());
            }}
          >
            Ejemplo
          </button>
        </div>
      </Section>

      <Section title="Espesores (mm)">
        <div className="grid2">
          {thick('side', 'Laterales ext.')}
          {thick('topBottom', 'Techo / base')}
          {thick('shelf', 'Baldas')}
          {thick('divider', 'Divisores')}
          {thick('door', 'Puertas')}
          {thick('drawer', 'Cajas cajón')}
        </div>
        <p className="hint">Una balda concreta (p. ej. encimera de 28) se cambia seleccionándola en el alzado.</p>
      </Section>

      <Section title="Medidas y holguras">
        <div className="grid2">
          <Field label="Fondo por defecto">
            <NumInput value={g.depth} min={50} onChange={(v) => update((d) => void (d.globals.depth = v))} />
          </Field>
          <Field label="Altura techo">
            <NumInput value={g.ceiling} min={500} onChange={(v) => update((d) => void (d.globals.ceiling = v))} />
          </Field>
          <Field label="Holgura techo">
            <NumInput value={g.ceilingGap} min={0} onChange={(v) => update((d) => void (d.globals.ceilingGap = v))} />
          </Field>
          <Field label="Holgura puertas">
            <NumInput value={g.doorGap} min={0} step={0.5} onChange={(v) => update((d) => void (d.globals.doorGap = v))} />
          </Field>
        </div>
        <button
          onClick={() =>
            update((d) => {
              for (const m of d.modules) m.height = d.globals.ceiling - d.globals.ceilingGap;
            })
          }
        >
          Ajustar alto de módulos al techo
        </button>
        <Field label="Redondear repartos" hint="Las filas y columnas «repartir» se redondean; la última de cada módulo absorbe la diferencia para que el total cuadre">
          <select value={g.rounding ?? 0} onChange={(e) => update((d) => void (d.globals.rounding = Number(e.target.value)))}>
            <option value={0}>Sin redondear</option>
            <option value={5}>A medio cm</option>
            <option value={10}>Al cm</option>
          </select>
        </Field>
        {(g.rounding ?? 0) > 0 && (
          <button
            title="Redondea también las medidas fijas, los cubos flotantes y las baldas añadidas, y ajusta unos mm el ancho y el alto de los módulos para que todo salga redondo (se puede deshacer)"
            onClick={() => {
              let changes: string[] = [];
              update((d) => void (changes = roundAll(d as Project, d.globals.rounding ?? 0)));
              setRoundMsg(changes.length ? changes : ['Ya estaba todo redondeado.']);
            }}
          >
            Redondear todo
          </button>
        )}
        {roundMsg && (
          <div className="round-msg">
            <ul>
              {roundMsg.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <button className="link" onClick={() => setRoundMsg(null)}>
              Cerrar
            </button>
          </div>
        )}
      </Section>

      <Section title="Rodapié">
        <label className="check">
          <input type="checkbox" checked={g.plinth.notch} onChange={(e) => update((d) => void (d.globals.plinth.notch = e.target.checked))} />
          Rebajar piezas verticales y retranquear bases
        </label>
        <div className="grid2">
          <Field label="Rebaje alto">
            <NumInput value={g.plinth.notchHeight} min={0} onChange={(v) => update((d) => void (d.globals.plinth.notchHeight = v))} />
          </Field>
          <Field label="Rebaje fondo">
            <NumInput value={g.plinth.notchDepth} min={0} onChange={(v) => update((d) => void (d.globals.plinth.notchDepth = v))} />
          </Field>
          <Field label="Rodapié alto">
            <NumInput value={g.plinth.skirtingHeight} min={0} onChange={(v) => update((d) => void (d.globals.plinth.skirtingHeight = v))} />
          </Field>
          <Field label="Rodapié grosor">
            <NumInput value={g.plinth.skirtingThickness} min={0} onChange={(v) => update((d) => void (d.globals.plinth.skirtingThickness = v))} />
          </Field>
        </div>
        {(g.plinth.notchHeight < g.plinth.skirtingHeight || g.plinth.notchDepth < g.plinth.skirtingThickness) && (
          <p className="warn-text">El rebaje es más pequeño que el rodapié.</p>
        )}
      </Section>

      <EnvironmentPanel />

      <Section title="Materiales" defaultOpen={false}>
        <div className="grid2">
          <Field label="Color mueble">
            <input type="color" value={p.materials.color} onChange={(e) => update((d) => void (d.materials.color = e.target.value))} />
          </Field>
          <Field label="Color puertas">
            <input type="color" value={p.materials.doorColor} onChange={(e) => update((d) => void (d.materials.doorColor = e.target.value))} />
          </Field>
        </div>
        <p className="hint">Apariencias de Fusion: búsquedas en orden, separadas por «|» (sin distinguir mayúsculas ni tildes).</p>
        {(
          [
            ['furniture', 'Mueble'],
            ['doors', 'Puertas'],
            ['wall', 'Paredes'],
            ['floor', 'Suelo'],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <TextInput
              value={p.materials[k].join(' | ')}
              width={170}
              onChange={(v) =>
                update(
                  (d) =>
                    void (d.materials[k] = v
                      .split('|')
                      .map((s) => s.trim())
                      .filter(Boolean)),
                )
              }
            />
          </Field>
        ))}
      </Section>
    </>
  );
}
