import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../src/derived';
import { defaultProject } from '../src/model/defaults';
import { fusionScript } from '../src/model/fusion';
import { estanteriaPy } from './reference/estanteria';

interface Out {
  cuerpos: { ruta: string; visible: boolean; centro: number[]; tam: number[]; cortes: number[][] }[];
  mensajes: string[];
  csv: string[];
  csv_texto: string;
}

function runScript(src: string, designType: 0 | 1): Out {
  const dir = mkdtempSync(join(tmpdir(), 'fusion-'));
  const f = join(dir, 'estanteria_generada.py');
  writeFileSync(f, src);
  const out = execFileSync('python3', [join(__dirname, 'fusion_stub', 'run_script.py'), f], {
    env: { ...process.env, DESIGN_TYPE: String(designType) },
  });
  return JSON.parse(out.toString());
}

const k = (c: number[], s: number[]) => [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2, ...s].map((v) => v.toFixed(2)).join(',');

describe('script de Fusion', () => {
  const p = defaultProject();
  const d = derive(p);
  const src = fusionScript(p, d.boards, d.env, new Date(2026, 0, 1));

  for (const dt of [1, 0] as const) {
    it(`construye las mismas piezas que Estanteria.py (${dt ? 'paramétrico' : 'directo/híbrido'})`, () => {
      const out = runScript(src, dt);
      expect(out.mensajes[0]).toContain('Mueble generado (68 tableros)');
      const mueble = out.cuerpos.filter((c) => !c.ruta.startsWith('Entorno'));
      expect(mueble.length).toBe(68);
      const ours = mueble.map((c) => k(c.centro, c.tam)).sort();
      const ref = estanteriaPy().map((r) => [r.x, r.y, r.z, r.dx, r.dy, r.dz].map((v) => v.toFixed(2)).join(',')).sort();
      expect(ours).toEqual(ref);
      // rebajes en la trasera (Y = FONDO), abajo
      const conRebaje = mueble.filter((c) => c.cortes.length);
      expect(conRebaje.length).toBe(estanteriaPy().filter((r) => r.rebaje).length);
      for (const c of conRebaje) {
        const [, cy, , , dy] = c.cortes[0];
        expect(cy + dy / 2).toBeCloseTo(330, 6);
      }
      // agrupado por módulo
      expect(mueble.some((c) => c.ruta === 'Izquierdo/Izquierdo - Encimera')).toBe(true);
      expect(mueble.some((c) => c.ruta === 'Puente/Puente - Base')).toBe(true);
      // las puertas, en su propio componente y visibles por defecto
      const puertas = mueble.filter((c) => c.ruta.includes('Puerta armario'));
      expect(puertas.map((c) => c.ruta)).toEqual(['Izquierdo/Izquierdo - Puertas/Izquierdo - Puerta armario bajo', 'Izquierdo/Izquierdo - Puertas/Izquierdo - Puerta armario alto']);
      expect(puertas.every((c) => c.visible)).toBe(true);
      // entorno
      const env = out.cuerpos.filter((c) => c.ruta.startsWith('Entorno'));
      expect(env.some((c) => c.ruta.includes('Balconera (abierta 91 grados)'))).toBe(true);
      expect(env.some((c) => c.ruta.endsWith('/Dintel'))).toBe(true);
      // CSV
      expect(out.csv).toEqual(['despiece_estanteria_con_puente.csv']);
      expect(out.csv_texto.split('\r\n')[0]).toContain('Espesor (mm);Largo (mm)');
    });
  }

  it('con las puertas ocultas se construyen igual pero apagadas', () => {
    const out = runScript(fusionScript(p, d.boards, d.env, new Date(2026, 0, 1), { showDoors: false }), 1);
    const mueble = out.cuerpos.filter((c) => !c.ruta.startsWith('Entorno'));
    expect(mueble.length).toBe(68);
    const ocultos = mueble.filter((c) => !c.visible).map((c) => c.ruta);
    expect(ocultos.length).toBe(2);
    expect(ocultos.every((r) => r.includes('Puerta'))).toBe(true);
  });
});
