# Uso: python3 run_script.py script.py  -> imprime JSON con los cuerpos creados
import importlib.util, json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adsk import REGISTRO

home = tempfile.mkdtemp()
os.environ["HOME"] = home
os.environ["USERPROFILE"] = home
spec = importlib.util.spec_from_file_location("generado", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.run(None)


def visible(c):
    while c is not None:
        if c.occ is not None and not c.occ.isLightBulbOn:
            return False
        c = c.parent
    return True


def ruta(c):
    out = []
    while c is not None and c.parent is not None:
        out.append(c.name)
        c = c.parent
    return "/".join(reversed(out))


cuerpos = []
for c in REGISTRO["componentes"]:
    for b in c.bRepBodies.items:
        o = b.obb
        s = [v * 10 for v in o.size]
        cen = (o.c.x * 10, o.c.y * 10, o.c.z * 10)
        cuerpos.append({
            "ruta": ruta(c),
            "visible": visible(c),
            "centro": cen,
            "tam": s,
            "dir": (o.l.x, o.l.y),
            "cortes": [[t.obb.c.x * 10, t.obb.c.y * 10, t.obb.c.z * 10] + [v * 10 for v in t.obb.size] for t in b.cortes],
        })
csv = [f for f in os.listdir(home)]
print(json.dumps({"cuerpos": cuerpos, "mensajes": REGISTRO["mensajes"], "csv": csv,
                  "csv_texto": open(os.path.join(home, csv[0]), encoding="utf-8-sig").read() if csv else ""}))
