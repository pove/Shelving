// Port literal de la geometría de Estanteria.py (v6) para usarlo como referencia en los tests.
// Coordenadas del script: Y = 0 frente, Y = FONDO pared.

export interface RefPiece {
  name: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  rebaje: boolean;
  nota: string;
}

export function estanteriaPy(): RefPiece[] {
  const TECHO = 2500, HOLGURA_TECHO = 10, ALTO_PUERTA = 2130, HUECO_PUERTA = 2115;
  const PARED_IZQ = 1750, PARED_DER = 1830, SEP_PUERTA = 50, SEP_SOBRE_PUERTA = 20, FONDO = 330;
  const E_INT = 19, E_LAT = 28, E_HOR = 19, E_ENCIMERA = 28;
  const COLS = 5, COLS_PUENTE = 7, ALTO_CUBO = 330;
  const FLOTANTE = true;
  const ARMARIO_COLS = 2, FONDO_ARMARIO = 300, E_PUERTA = 19, HOLGURA_PUERTA = 3;
  const BALDAS_ARMARIO_BAJO = 0, BALDAS_ARMARIO_ALTO = 1, HOLGURA_BALC = 5, BALC_HOJA = 730;
  const REBAJE = true, REBAJE_ALTO = 70, REBAJE_FONDO = 20;

  const piezas: RefPiece[] = [];
  const caja = (nombre: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, rebaje = false, nota = '') => {
    let rb = false;
    if (rebaje && REBAJE) {
      const z0 = Math.max(z, 0), z1 = Math.min(z + dz, REBAJE_ALTO);
      if (z1 > z0) rb = true;
    }
    piezas.push({ name: nombre, x, y, z, dx, dy, dz, rebaje: rb, nota });
  };

  const modulo = (nombre: string, x0: number, ancho: number, H: number, z_balda: number,
    nicho_col: number | null, flot_col: number | null, flot_lat: string, arm_cols: number, cw: number[]) => {
    const n = COLS;
    const ix = x0 + E_LAT;
    const xfin = x0 + ancho - E_LAT;
    const cx: number[] = [];
    let x = ix;
    for (let i = 0; i < n; i++) { cx.push(x); x += cw[i] + E_INT; }
    const div_x = Array.from({ length: n - 1 }, (_, i) => cx[i] + cw[i]);
    const h = ALTO_CUBO;
    const hm = (h - E_INT) / 2;
    const z_sup = z_balda - E_INT - h;
    const fondo_base = REBAJE ? FONDO - REBAJE_FONDO : FONDO;
    let sx: number;
    if (arm_cols > 0) {
      const x_div = div_x[arm_cols - 1];
      const ya = FONDO - FONDO_ARMARIO + E_PUERTA;
      const fa = FONDO - ya;
      caja(nombre + ' - Lateral A (armario)', x0, ya, 0, E_LAT, fa, H, true);
      caja(nombre + ' - Separador armario', x_div, 0, 0, E_INT, FONDO, H, true);
      const ax = ix, aw = x_div - ix;
      caja(nombre + ' - Armario base', ax, ya, 0, aw, fa - (REBAJE ? REBAJE_FONDO : 0), E_HOR);
      caja(nombre + ' - Armario techo', ax, ya, H - E_HOR, aw, fa, E_HOR);
      caja(nombre + ' - Armario separacion', ax, ya, z_sup, aw, fa, E_INT);
      const hb = (z_sup - E_HOR - BALDAS_ARMARIO_BAJO * E_INT) / (BALDAS_ARMARIO_BAJO + 1);
      for (let k = 0; k < BALDAS_ARMARIO_BAJO; k++)
        caja(nombre + ` - Armario bajo balda ${k + 1}`, ax, ya, E_HOR + (k + 1) * hb + k * E_INT, aw, fa, E_INT);
      const z_a = z_sup + E_INT;
      const ha_tot = H - E_HOR - z_a;
      const ha = (ha_tot - BALDAS_ARMARIO_ALTO * E_INT) / (BALDAS_ARMARIO_ALTO + 1);
      for (let k = 0; k < BALDAS_ARMARIO_ALTO; k++)
        caja(nombre + ` - Armario alto balda ${k + 1}`, ax, ya, z_a + (k + 1) * ha + k * E_INT, aw, fa, E_INT);
      const g = HOLGURA_PUERTA;
      const yp = FONDO - FONDO_ARMARIO;
      const z_corte = z_sup + E_INT / 2;
      caja(nombre + ' - Puerta armario bajo', x0 + g, yp, g, x_div - x0 - 2 * g, E_PUERTA, z_corte - g / 2 - g, false, 'Puerta: canto 4 lados');
      caja(nombre + ' - Puerta armario alto', x0 + g, yp, z_corte + g / 2, x_div - x0 - 2 * g, E_PUERTA, H - g - (z_corte + g / 2), false, 'Puerta: canto 4 lados');
      sx = x_div + E_INT;
    } else {
      caja(nombre + ' - Lateral A', x0, 0, 0, E_LAT, FONDO, H, true);
      sx = ix;
    }
    const sw = xfin - sx;
    caja(nombre + ' - Lateral B', xfin, 0, 0, E_LAT, FONDO, H, true);
    caja(nombre + ' - Base', sx, 0, 0, sw, fondo_base, E_HOR);
    caja(nombre + ' - Techo', sx, 0, H - E_HOR, sw, FONDO, E_HOR);
    let z = E_HOR;
    const filas: [number, number][] = [];
    filas.push([z, h]); z += h;
    caja(nombre + ' - Balda 1', sx, 0, z, sw, FONDO, E_INT); z += E_INT;
    filas.push([z, h]); z += h;
    caja(nombre + ' - Balda 2', sx, 0, z, sw, FONDO, E_INT); z += E_INT;
    filas.push([z, hm]); z += hm;
    caja(nombre + ' - Encimera', sx, 0, z, sw, FONDO, E_ENCIMERA); z += E_ENCIMERA;
    const z_enc = z;
    const h_abierto = z_sup - z_enc;
    caja(nombre + ' - Balda superior', sx, 0, z_sup, sw, FONDO, E_INT);
    filas.push([z_sup + E_INT, h]);
    caja(nombre + ' - Balda franja', sx, 0, z_balda, sw, FONDO, E_INT);
    const z_fr = z_balda + E_INT;
    const h_fr = H - E_HOR - z_fr;
    filas.push([z_fr, h_fr]);
    filas.forEach(([zf, hf], r) => {
      div_x.forEach((dx, i) => {
        if (i < arm_cols) return;
        caja(nombre + ` - Divisor F${r + 1}-${i + 1}`, dx, 0, zf, E_INT, FONDO, hf, r === 0);
      });
    });
    if (nicho_col !== null) {
      const dn = nicho_col === n - 1 ? div_x[nicho_col - 1] : div_x[nicho_col];
      caja(nombre + ' - Divisor nicho', dn, 0, z_enc, E_INT, FONDO, h_abierto);
    }
    if (FLOTANTE && flot_col !== null) {
      const w = cw[flot_col];
      const z_fb = z_sup - h - E_INT;
      if (flot_lat === 'izq') {
        const x_col = cx[flot_col] - E_INT;
        caja(nombre + ' - Flotante lateral', x_col, 0, z_sup - h, E_INT, FONDO, h);
        caja(nombre + ' - Flotante base', x_col, 0, z_fb, w + E_INT, FONDO, E_INT);
      } else {
        const x_col = cx[flot_col] + w;
        caja(nombre + ' - Flotante lateral', x_col, 0, z_sup - h, E_INT, FONDO, h);
        caja(nombre + ' - Flotante base', cx[flot_col], 0, z_fb, w + E_INT, FONDO, E_INT);
      }
    }
  };

  const H = TECHO - HOLGURA_TECHO;
  const z_base_puente = ALTO_PUERTA + SEP_SOBRE_PUERTA;
  const z_balda = z_base_puente + E_HOR - E_INT;
  const ancho_izq = PARED_IZQ - SEP_PUERTA;
  const ancho_der = PARED_DER - SEP_PUERTA;
  const x_der = PARED_IZQ + HUECO_PUERTA + SEP_PUERTA;
  const n = COLS;
  const w_izq = (ancho_izq - 2 * E_LAT - (n - 1) * E_INT) / n;
  const w_der = (ancho_der - 2 * E_LAT - (n - 1) * E_INT) / n;
  const a = ARMARIO_COLS;
  let x_div = E_LAT + a * w_izq + (a - 1) * E_INT;
  x_div = Math.max(x_div, BALC_HOJA + HOLGURA_BALC);
  const wa = (x_div - E_LAT - (a - 1) * E_INT) / a;
  const m = n - a;
  const libre = ancho_izq - E_LAT - (x_div + E_INT) - (m - 1) * E_INT;
  const estrecha = libre - (m - 1) * w_izq;
  const cw_izq = [...Array(a).fill(wa), ...Array(m - 1).fill(w_izq), estrecha];
  modulo('Izquierdo', 0, ancho_izq, H, z_balda, null, ARMARIO_COLS, 'der', ARMARIO_COLS, cw_izq);
  modulo('Derecho', x_der, ancho_der, H, z_balda, COLS - 1, COLS - 2, 'izq', 0, Array(n).fill(w_der));

  const x0 = ancho_izq;
  const L = x_der - x0;
  caja('Puente - Base', x0, 0, z_base_puente, L, FONDO, E_HOR);
  caja('Puente - Techo', x0, 0, H - E_HOR, L, FONDO, E_HOR);
  const zb = z_base_puente + E_HOR;
  const hb = H - E_HOR - zb;
  const wp = (L - (COLS_PUENTE - 1) * E_INT) / COLS_PUENTE;
  for (let c = 1; c < COLS_PUENTE; c++) caja(`Puente - Divisor ${c}`, x0 + c * wp + (c - 1) * E_INT, 0, zb, E_INT, FONDO, hb);
  return piezas;
}
