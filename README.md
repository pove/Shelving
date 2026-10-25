# Estanterías a medida

Webapp (sin backend) para diseñar estanterías modulares de melamina y generar a partir del
diseño el **despiece**, la **optimización de cortes** y un **script de Autodesk Fusion**
equivalente a `Estanteria.py`.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest
npm run build    # dist/ estático
```

## Cómo está hecho

Todo parte de una función pura: `computeBoards(proyecto)` (`src/model/boards.ts`) convierte el
proyecto JSON en una lista de tableros (posición, tamaño, espesor, cantos, notas, rebaje).
La vista 3D, el alzado, el despiece, los cortes y el script de Fusion se alimentan de esa lista.

| Archivo | Qué hace |
| --- | --- |
| `src/model/types.ts` | Modelo de datos (proyecto, módulos, puentes, entorno, tableros) |
| `src/model/grid.ts` | Medidas interiores fijas/repartidas, posiciones, huecos y zonas de fondo |
| `src/model/boards.ts` | Proyecto → tableros |
| `src/model/ops.ts` | Edición: insertar/quitar filas y columnas, fusionar/separar |
| `src/model/environment.ts` | Pared, suelo, rodapié, puertas y ángulo máximo de la balconera |
| `src/model/warnings.ts` | Avisos: descuadres, huecos pequeños, flecha, planchas, solapes |
| `src/model/cutlist.ts` | Despiece agrupado y CSV (`;`, coma decimal, UTF-8 con BOM) |
| `src/model/nesting.ts` | Empaquetado guillotina con sierra, refilado y veta |
| `src/model/fusion.ts` | Generador del script de Fusion |
| `src/model/defaults.ts` | Proyecto inicial (recrea `Estanteria.py` v6) |

### Ejes y convenciones

- App: X a lo largo de la pared, Y = distancia a la pared, Z = alto. Medidas en mm.
- Script de Fusion: igual que `Estanteria.py` (Y = 0 frente, Y = FONDO pared, Z arriba).
- Filas de abajo arriba (F1 = abajo), columnas de izquierda a derecha.
- En los cruces, las baldas pasan y los divisores se cortan; donde cambia el fondo
  (p. ej. el armario de 281 + puerta), el separador va de suelo a techo y parte base y techo.

### Tests

- `tests/boards.test.ts`: el proyecto inicial da exactamente las mismas 68 cajas y rebajes que
  `Estanteria.py` (port en `tests/reference/estanteria.ts`), sin solapes y con totales que cuadran.
- `tests/fusion.test.ts`: ejecuta el `.py` generado con Python contra un stub de la API de
  Fusion (`tests/fusion_stub/`) en modo paramétrico y directo, y compara la geometría.
- `tests/cutlist.test.ts`, `tests/nesting.test.ts`: despiece/CSV y cortes sin solapes.

## Redondeo de medidas

En «Medidas y holguras», «Redondear repartos» (medio cm o cm) redondea las filas y columnas
que se reparten solas; la última de cada módulo absorbe la diferencia para que el total cuadre.
«Redondear todo» redondea también las medidas fijas, los cubos flotantes y las baldas añadidas,
y reduce unos mm (menos del paso) el ancho y el alto de los módulos para que la columna/fila que
absorbe la diferencia también salga redonda; los módulos a la derecha de un puente se mueven lo
justo para que el puente también reparta redondo, y el puente sigue alineado con su balda y con
el techo. Enseña la lista de cambios y se puede deshacer.

## Diseños guardados (`disenos/`)

Los `.json` de la carpeta `disenos/` aparecen en el desplegable «Cargar diseño» (sección
Proyecto), junto al ejemplo de Estanteria.py. Para añadir uno:

1. En la app, «Exportar .json».
2. En GitHub, abre la carpeta `disenos/` → *Add file → Upload files* → sube el `.json`
   (el nombre del archivo es el que sale en el desplegable: `_` se convierten en espacios).
3. Al guardarlo en `main` se vuelve a publicar la web sola y aparece en el desplegable.

El test `tests/disenos.test.ts` carga cada diseño de la carpeta y falla si alguno tiene errores.

## Montaje de puertas

Cada puerta o cajón tiene su montaje (y en «Puertas» se elige el de las nuevas y se pueden
pasar todas de golpe):
- **Delante, tamaño del hueco** (por defecto): delante del mueble y del tamaño interior del
  hueco, dejando vistos los cantos de laterales y baldas.
- **Embutida**: dentro del hueco, a haces con el frente; las baldas y divisores de dentro se
  retranquean el grosor de la puerta.
- **Superpuesta**: delante, tapando la mitad de baldas/divisores y los laterales.

## Uso en el móvil

- «Ver: Todo / Izquierdo / Puente / Derecho» amplía el alzado a un solo módulo.
- Al tocar un hueco aparece abajo la barra de acciones: **Varios** (cada toque amplía la
  selección), **Fusionar**, **Separar**, **+ Puerta**, **+ Cajón** (con varios huecos:
  **+ Una puerta**, **+ Puerta en cada**, **+ Cajones**), cambiar hojas y bisagras y
  **Quitar puerta**. «Más…» lleva al panel con el resto de opciones del hueco.

## Integración continua y publicación

- `.github/workflows/ci.yml`: en cada push a cualquier rama y en cada PR ejecuta typecheck, tests y build.
- `.github/workflows/pages.yml`: en cada push a `main` publica `dist/` en GitHub Pages
  (`https://pove.github.io/Shelving/`). Hay que activarlo una vez en
  *Settings → Pages → Build and deployment → Source: GitHub Actions*.
