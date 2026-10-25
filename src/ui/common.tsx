import { useEffect, useState, type ReactNode } from 'react';
import type { DoorMount } from '../model/types';

export const fmt = (v: number, d = 1) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return r.toLocaleString('es-ES', { maximumFractionDigits: d });
};

/** Entrada numérica que confirma al salir o con Intro (un solo paso de deshacer). */
export function NumInput({
  value,
  onChange,
  min,
  step = 1,
  width = 60,
  invalid,
  title,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  width?: number;
  invalid?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  const [txt, setTxt] = useState(fmtIn(value));
  useEffect(() => setTxt(fmtIn(value)), [value]);
  const commit = () => {
    const v = parseFloat(txt.replace(',', '.'));
    if (!Number.isFinite(v) || (min !== undefined && v < min)) {
      setTxt(fmtIn(value));
      return;
    }
    if (Math.abs(v - value) > 1e-9) onChange(v);
  };
  return (
    <input
      className={'num' + (invalid ? ' invalid' : '')}
      style={{ width }}
      value={txt}
      step={step}
      title={title}
      disabled={disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setTxt(fmtIn(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function fmtIn(v: number) {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

export function TextInput({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <input
      className="text"
      style={{ width }}
      value={txt}
      placeholder={placeholder}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => txt !== value && onChange(txt)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel-section">
      <h3 onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span> {title}
      </h3>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}

export function download(name: string, content: string | Blob, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'estanteria';

/** Montajes de puerta, en el orden en que se ofrecen. */
export const MOUNTS: [DoorMount, string, string][] = [
  ['face', 'Delante, tamaño del hueco', 'Delante del mueble y del tamaño interior del hueco: no tapa los cantos'],
  ['inset', 'Embutida', 'Dentro del hueco, a haces con el frente; las baldas de dentro se retranquean'],
  ['overlay', 'Superpuesta', 'Delante, tapando la mitad de baldas y divisores y los laterales (bisagras de codo)'],
];

export function MountSelect({ value, onChange }: { value: DoorMount; onChange: (m: DoorMount) => void }) {
  return (
    <select value={value} title={MOUNTS.find((m) => m[0] === value)?.[2]} onChange={(e) => onChange(e.target.value as DoorMount)}>
      {MOUNTS.map(([k, label, hint]) => (
        <option key={k} value={k} title={hint}>
          {label}
        </option>
      ))}
    </select>
  );
}
