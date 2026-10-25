// Diseños guardados en la carpeta disenos/ del repositorio: se incluyen al compilar,
// así que basta con añadir un .json a esa carpeta (y publicar) para que salga en el desplegable.
import type { Project } from './model/types';
import { migrate } from './store';

const files = import.meta.glob<{ default: Project }>('../disenos/*.json');

/** «estanteria_con_puente_huecos_armarios.json» -> «Estanteria con puente huecos armarios» */
function label(file: string) {
  const s = file.replace(/\.json$/, '').replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SavedDesign {
  file: string;
  label: string;
  load: () => Promise<Project>;
}

export const DESIGNS: SavedDesign[] = Object.keys(files)
  .sort()
  .map((path) => {
    const file = path.split('/').pop()!;
    return { file, label: label(file), load: async () => migrate((await files[path]()).default) };
  });
