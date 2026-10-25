// Guardar imágenes: la vista 3D (PNG) y el alzado (PNG o SVG).
import { useStore } from '../store';
import { download } from './common';

/** Quita la selección mientras se genera la imagen (sin resaltados) y la restaura después. */
export async function withoutSelection<T>(fn: () => Promise<T>): Promise<T> {
  const st = useStore.getState();
  const prev = st.selection;
  st.select({ carcassId: null, cells: null, boardId: null });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await fn();
  } finally {
    useStore.getState().select(prev);
  }
}

/** La registra la vista 3D mientras está montada: renderiza y devuelve el PNG (fondo transparente). */
let capture3D: (() => string) | null = null;

export function registerCapture3D(fn: (() => string) | null) {
  capture3D = fn;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo generar la imagen'));
    img.src = src;
  });
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'));
}

/** La vista 3D a doble resolución, con el mismo fondo degradado que en pantalla. */
async function canvas3D(): Promise<HTMLCanvasElement> {
  if (!capture3D) throw new Error('La vista 3D no está abierta');
  const img = await loadImage(capture3D());
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#f4f2ee');
  grad.addColorStop(1, '#e4e0d8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c;
}

export async function save3DImage(fileName: string) {
  download(fileName, await canvasToBlob(await canvas3D()));
}

/** Copia del SVG lista para guardarse sola: tamaño en píxeles, fondo blanco y tipografía. */
function standaloneSvg(svg: SVGSVGElement, widthPx: number) {
  const vb = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = widthPx;
  const h = Math.round((w * vb.height) / vb.width);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(vb.x));
  bg.setAttribute('y', String(vb.y));
  bg.setAttribute('width', String(vb.width));
  bg.setAttribute('height', String(vb.height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  return { text: new XMLSerializer().serializeToString(clone), w, h };
}

async function canvasSvg(svg: SVGSVGElement, widthPx: number): Promise<HTMLCanvasElement> {
  const { text, w, h } = standaloneSvg(svg, widthPx);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function saveSvgImage(svg: SVGSVGElement, fileName: string, format: 'png' | 'svg') {
  if (format === 'svg') {
    download(fileName, new Blob([standaloneSvg(svg, 3000).text], { type: 'image/svg+xml' }));
    return;
  }
  download(fileName, await canvasToBlob(await canvasSvg(svg, 3000)));
}

/** La vista 3D arriba y el alzado debajo, en una sola imagen del mismo ancho. */
export async function saveBothImage(svg: SVGSVGElement, fileName: string) {
  const a = await canvas3D();
  const b = await canvasSvg(svg, a.width);
  const gap = Math.round(a.width / 100);
  const c = document.createElement('canvas');
  c.width = a.width;
  c.height = a.height + gap + b.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, 0, a.height + gap);
  download(fileName, await canvasToBlob(c));
}
