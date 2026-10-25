// Generador del script de Autodesk Fusion (Python), equivalente a Estanteria.py.
import { cutListCsv, groupCutList } from './cutlist';
import type { EnvResult } from './environment';
import type { Board, Project } from './types';

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
};
const s = (v: string) => JSON.stringify(v);

export function fusionScript(p: Project, boards: Board[], env: EnvResult, date = new Date(), opts: { showDoors?: boolean } = {}): string {
  const carcasses = [...p.modules, ...p.bridges];
  const REF = Math.max(p.globals.depth, ...carcasses.map((c) => Math.max(c.depth, ...c.cols.map((k) => k.depth ?? 0))));
  // App: Y = distancia a la pared. Fusion: Y = 0 frente, Y = FONDO pared (como Estanteria.py).
  const fy = (y: number, dy: number) => REF - y - dy;

  const groups = carcasses.filter((c) => boards.some((b) => b.groupId === c.id));
  const gi = new Map(groups.map((c, i) => [c.id, i]));

  const rows = boards.map((b) => {
    const { x, y, z, dx, dy, dz } = b.box;
    let reb = 'None';
    if (b.notch) {
      const ny0 = REF - b.notch.y1;
      reb = `(${n(x)}, ${n(ny0)}, ${n(b.notch.z0)}, ${n(dx)}, ${n(REF - y - ny0)}, ${n(b.notch.z1 - b.notch.z0)})`;
    }
    const mat = b.material === 'doors' ? 'puerta' : 'mueble';
    return `    (${gi.get(b.groupId)}, ${s(`${b.groupName} - ${b.name}`)}, ${n(x)}, ${n(fy(y, dy))}, ${n(z)}, ${n(dx)}, ${n(dy)}, ${n(dz)}, ${reb}, ${s(mat)}),`;
  });

  const envRows = env.boxes.map(
    (e) => `    (${s(e.name)}, ${s(e.kind === 'floor' ? 'suelo' : 'pared')}, ${n(e.box.x)}, ${n(fy(e.box.y, e.box.dy))}, ${n(e.box.z)}, ${n(e.box.dx)}, ${n(e.box.dy)}, ${n(e.box.dz)}, ${e.door ? 'True' : 'False'}),`,
  );
  let leaf = 'None';
  if (env.leaf) {
    const l = env.leaf;
    const cx = l.hx + (l.d[0] * l.length) / 2 + (l.t[0] * l.thickness) / 2;
    const cy = l.hy + (l.d[1] * l.length) / 2 + (l.t[1] * l.thickness) / 2;
    leaf = `(${s(`Balconera (abierta ${l.angle.toFixed(0)} grados)`)}, ${n(cx)}, ${n(REF - cy)}, ${n(l.z + l.height / 2)}, ${n(l.d[0])}, ${n(-l.d[1])}, ${n(l.t[0])}, ${n(-l.t[1])}, ${n(l.length)}, ${n(l.thickness)}, ${n(l.height)})`;
  }

  const csv = cutListCsv(groupCutList(boards)).replace(/^﻿/, '');
  const csvName = 'despiece_' + (p.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'estanteria') + '.csv';
  const list = (a: string[]) => `[${a.map(s).join(', ')}]`;
  const angle = env.maxAngle !== undefined ? n(env.maxAngle) : 'None';
  const g = p.globals;

  return `# ${p.name} — generado por «Estanterías a medida» el ${date.toLocaleString('es-ES')}
# Fusion -> Utilidades -> Complementos -> Scripts y complementos -> (+) -> crear script y pegar este archivo.
# Todas las medidas en mm. Funciona en Diseño paramétrico y en diseño híbrido/directo.
#
# Ejes: X = a lo largo de la pared (0 = esquina izquierda), Y = fondo (0 = frente del
# mueble, FONDO = pared), Z = altura (hacia arriba).
#
# Resumen: ${boards.length} tableros · laterales ${g.thickness.side} · techo/base ${g.thickness.topBottom} · baldas ${g.thickness.shelf} · divisores ${g.thickness.divider}
#          rebaje rodapié ${g.plinth.notch ? `${g.plinth.notchHeight}x${g.plinth.notchDepth}` : 'no'} · holgura puertas ${g.doorGap}

import adsk.core, adsk.fusion, traceback, os, unicodedata

# ================= OPCIONES =================
NUEVO_DOCUMENTO = True    # True = construye en un diseño nuevo. Con False usa el diseño abierto
                          # (si ya tiene piezas, pregunta antes: quedarían piezas viejas mezcladas)
ENTORNO         = ${p.environment.show ? 'True' : 'False'}    # pared, suelo, rodapié y puertas (no entra en el despiece)
PUERTAS_VISIBLES = ${opts.showDoors === false ? 'False' : 'True'}   # las puertas de cada módulo van en su componente «Puertas»: enciéndelo/apágalo con la bombilla
ENTORNO_PUERTAS_VISIBLES = ${p.environment.showDoors === false ? 'False' : 'True'}   # hojas del hueco de puerta y balconera, en «Puertas del entorno»
GUARDAR_CSV     = True
FONDO           = ${n(REF)}

# Apariencias: se prueba cada búsqueda en orden (no distingue mayúsculas ni tildes;
# todas las palabras deben aparecer en el nombre de la apariencia de Fusion)
AP_MUEBLE = ${list(p.materials.furniture)}
AP_PUERTA = ${list(p.materials.doors)}
AP_PARED  = ${list(p.materials.wall)}
AP_SUELO  = ${list(p.materials.floor)}
# ============================================

GRUPOS = ${list(groups.map((c) => c.name))}

# (grupo, nombre, x, y, z, dx, dy, dz, rebaje (x, y, z, dx, dy, dz) o None, apariencia)
TABLEROS = [
${rows.join('\n')}
]

# (nombre, apariencia, x, y, z, dx, dy, dz, es puerta)
ENTORNO_CAJAS = [
${envRows.join('\n')}
]

# (nombre, cx, cy, cz, dir. hoja x, y, dir. grosor x, y, largo, grosor, alto)
ENTORNO_HOJA = ${leaf}
ANGULO_BALCONERA = ${angle}

DESPIECE_CSV = ${s(csv)}
NOMBRE_CSV = ${s(csvName)}

_design = None


def _caja_tmp(x, y, z, dx, dy, dz):
    tbm = adsk.fusion.TemporaryBRepManager.get()
    centro = adsk.core.Point3D.create((x + dx / 2) / 10, (y + dy / 2) / 10, (z + dz / 2) / 10)
    obb = adsk.core.OrientedBoundingBox3D.create(
        centro,
        adsk.core.Vector3D.create(1, 0, 0),
        adsk.core.Vector3D.create(0, 1, 0),
        dx / 10, dy / 10, dz / 10)
    return tbm.createBox(obb)


def _con_base_feature(c, cuerpo):
    bf = c.features.baseFeatures.add()
    bf.startEdit()
    try:
        c.bRepBodies.add(cuerpo, bf)
    finally:
        bf.finishEdit()


def _componente(padre, nombre, cuerpo):
    occ = padre.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    c = occ.component
    c.name = nombre
    if _design.designType == adsk.fusion.DesignTypes.ParametricDesignType:
        _con_base_feature(c, cuerpo)
    else:
        try:
            c.bRepBodies.add(cuerpo)
        except:
            _con_base_feature(c, cuerpo)
    return c.bRepBodies.item(0) if c.bRepBodies.count > 0 else None


def grupo(padre, nombre):
    return grupo_occ(padre, nombre).component


def grupo_occ(padre, nombre):
    occ = padre.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    occ.component.name = nombre
    return occ


def tablero(comp, nombre, x, y, z, dx, dy, dz, rebaje):
    cuerpo = _caja_tmp(x, y, z, dx, dy, dz)
    if rebaje:
        tbm = adsk.fusion.TemporaryBRepManager.get()
        tbm.booleanOperation(cuerpo, _caja_tmp(*rebaje), adsk.fusion.BooleanTypes.DifferenceBooleanType)
    return _componente(comp, nombre, cuerpo)


def hoja_girada(comp, nombre, cx, cy, cz, ux, uy, tx, ty, largo, grosor, alto):
    tbm = adsk.fusion.TemporaryBRepManager.get()
    obb = adsk.core.OrientedBoundingBox3D.create(
        adsk.core.Point3D.create(cx / 10, cy / 10, cz / 10),
        adsk.core.Vector3D.create(ux, uy, 0),
        adsk.core.Vector3D.create(tx, ty, 0),
        largo / 10, grosor / 10, alto / 10)
    return _componente(comp, nombre, tbm.createBox(obb))


# ---------------- apariencias ----------------
def _norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(ch for ch in s if not unicodedata.combining(ch))


_cache_ap = None


def _buscar(app, consultas):
    global _cache_ap
    if _cache_ap is None:
        _cache_ap = []
        for i in range(_design.appearances.count):
            a = _design.appearances.item(i)
            _cache_ap.append((_norm(a.name), a))
        libs = app.materialLibraries
        for i in range(libs.count):
            try:
                aps = libs.item(i).appearances
                for j in range(aps.count):
                    a = aps.item(j)
                    _cache_ap.append((_norm(a.name), a))
            except:
                pass
    for q in consultas:
        toks = _norm(q).split()
        for nn, a in _cache_ap:
            if all(t in nn for t in toks):
                try:
                    ap = _design.appearances.itemByName(a.name)
                    if not ap:
                        ap = _design.appearances.addByCopy(a, a.name)
                    return ap
                except:
                    continue
    return None


def aplicar(app, consultas, lista):
    if not lista:
        return "-"
    try:
        ap = _buscar(app, consultas)
        if not ap:
            return "no encontrada (aplícala a mano con la tecla A)"
        for b in lista:
            b.appearance = ap
        return ap.name
    except:
        return "no se pudo aplicar (aplícala a mano con la tecla A)"


def _carpeta_csv():
    carpeta = os.path.expanduser("~")
    for cand in ("OneDrive/Escritorio", "OneDrive/Desktop", "Escritorio", "Desktop"):
        p = os.path.join(carpeta, cand)
        if os.path.isdir(p):
            return p
    return carpeta


def run(context):
    global _design
    app = adsk.core.Application.get()
    ui = app.userInterface
    try:
        if NUEVO_DOCUMENTO:
            app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        _design = adsk.fusion.Design.cast(app.activeProduct)
        if not _design:
            ui.messageBox("Abre un diseño de Fusion antes de ejecutar el script.")
            return
        root = _design.rootComponent
        if not NUEVO_DOCUMENTO and (root.occurrences.count > 0 or root.bRepBodies.count > 0):
            r = ui.messageBox(
                "Este diseño ya tiene piezas. Si sigues, el mueble nuevo se mezclará con lo que haya "
                "(Fusion numerará los nombres repetidos, p. ej. «Encimera 1»).\\n\\n"
                "¿Construir aquí de todas formas? (No = cancelar; pon NUEVO_DOCUMENTO = True "
                "para construir siempre en un diseño nuevo)",
                "Diseño con piezas",
                adsk.core.MessageBoxButtonTypes.YesNoButtonType)
            if r != adsk.core.DialogResults.DialogYes:
                return

        comps = [grupo(root, g) for g in GRUPOS]
        puertas = {}  # componente «Puertas» de cada grupo, creado al encontrar la primera
        cuerpos = {"mueble": [], "puerta": []}
        for gi, nombre, x, y, z, dx, dy, dz, rebaje, ap in TABLEROS:
            destino = comps[gi]
            if ap == "puerta":
                if gi not in puertas:
                    puertas[gi] = grupo_occ(comps[gi], GRUPOS[gi] + " - Puertas")
                destino = puertas[gi].component
            b = tablero(destino, nombre, x, y, z, dx, dy, dz, rebaje)
            if b:
                cuerpos[ap].append(b)

        for occ in puertas.values():
            try:
                occ.isLightBulbOn = PUERTAS_VISIBLES
            except:
                pass

        env = {"pared": [], "suelo": []}
        if ENTORNO and (ENTORNO_CAJAS or ENTORNO_HOJA):
            e = grupo(root, "Entorno (no fabricar)")
            ep = None  # componente «Puertas del entorno», creado al encontrar la primera
            for nombre, ap, x, y, z, dx, dy, dz, es_puerta in ENTORNO_CAJAS:
                destino = e
                if es_puerta:
                    ep = ep or grupo_occ(e, "Puertas del entorno")
                    destino = ep.component
                b = _componente(destino, nombre, _caja_tmp(x, y, z, dx, dy, dz))
                if b:
                    env[ap].append(b)
            if ENTORNO_HOJA:
                ep = ep or grupo_occ(e, "Puertas del entorno")
                b = hoja_girada(ep.component, *ENTORNO_HOJA)
                if b:
                    env["pared"].append(b)
            if ep:
                try:
                    ep.isLightBulbOn = ENTORNO_PUERTAS_VISIBLES
                except:
                    pass

        ruta = "(no guardado)"
        if GUARDAR_CSV:
            ruta = os.path.join(_carpeta_csv(), NOMBRE_CSV)
            with open(ruta, "w", encoding="utf-8-sig", newline="") as f:
                f.write(DESPIECE_CSV)

        ap_m = aplicar(app, AP_MUEBLE, cuerpos["mueble"])
        ap_pu = aplicar(app, AP_PUERTA, cuerpos["puerta"])
        ap_p = aplicar(app, AP_PARED, env["pared"])
        ap_s = aplicar(app, AP_SUELO, env["suelo"])

        msg = "Mueble generado (%d tableros).\\n" % len(TABLEROS)
        if ANGULO_BALCONERA is not None:
            msg += "\\nBalconera: abre hasta %.1f grados\\n" % ANGULO_BALCONERA
        msg += ("\\nApariencias:\\n  mueble: %s\\n  puertas: %s\\n  paredes: %s\\n  suelo y rodapié: %s\\n"
                % (ap_m, ap_pu, ap_p, ap_s))
        msg += "\\nDespiece guardado en:\\n%s" % ruta
        ui.messageBox(msg)
    except:
        ui.messageBox("Error:\\n{}".format(traceback.format_exc()))
`;
}
