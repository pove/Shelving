import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../src/derived';
import { DESIGNS } from '../src/designs';
import { migrate } from '../src/store';

const dir = join(__dirname, '..', 'disenos');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('diseños guardados en disenos/', () => {
  it('el desplegable ofrece todos los archivos de la carpeta', () => {
    expect(DESIGNS.map((d) => d.file).sort()).toEqual([...files].sort());
  });

  for (const f of files) {
    it(`${f} carga y no tiene errores`, async () => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect(raw.version).toBe(1);
      const p = migrate(raw);
      const d = derive(p);
      expect(d.boards.length).toBeGreaterThan(0);
      expect(d.warnings.filter((w) => w.level === 'error').map((w) => w.msg)).toEqual([]);
      const loaded = await DESIGNS.find((x) => x.file === f)!.load();
      expect(loaded.modules.length).toBe(p.modules.length);
    });
  }
});
