import { useMemo, useState } from 'react';
import { useDerived } from '../derived';
import { fusionScript } from '../model/fusion';
import { useStore } from '../store';
import { download, slug } from './common';

export default function FusionView() {
  const p = useStore((s) => s.project);
  const { boards, env } = useDerived();
  const showDoors = useStore((s) => s.showDoors);
  const src = useMemo(() => fusionScript(p, boards, env, new Date(), { showDoors }), [p, boards, env, showDoors]);
  const [copied, setCopied] = useState(false);
  const name = slug(p.name);
  return (
    <div className="report">
      <h2>Script de Autodesk Fusion</h2>
      <p className="muted">
        Construye el diseño completo con un componente por tablero (agrupados por módulo y puente), el entorno aparte, aplica las
        apariencias buscándolas por nombre en las bibliotecas de Fusion y guarda el CSV de despiece en el Escritorio. Por defecto crea un
        diseño nuevo cada vez (<code>NUEVO_DOCUMENTO = True</code>), así no se mezcla con piezas de ejecuciones anteriores.
      </p>
      <div className="report-tools">
        <button className="primary" onClick={() => download(`${name}.py`, src, 'text/x-python')}>
          Descargar {name}.py
        </button>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(src);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
        <span className="muted">
          {boards.length} tableros · {src.split('\n').length} líneas
        </span>
      </div>
      <ol className="muted">
        <li>En Fusion: Utilidades → Complementos → Scripts y complementos → «+» → Crear script (Python), con el nombre que quieras.</li>
        <li>Sustituye el contenido del .py creado por este archivo (o copia el archivo descargado a esa carpeta).</li>
        <li>Ejecuta el script: crea un diseño nuevo y construye el mueble con Z hacia arriba.</li>
      </ol>
      <pre className="code">{src}</pre>
    </div>
  );
}
