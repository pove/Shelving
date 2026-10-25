from adsk import REGISTRO


class Point3D:
    def __init__(self, x, y, z):
        self.x, self.y, self.z = x, y, z

    @staticmethod
    def create(x, y, z):
        return Point3D(x, y, z)


class Vector3D(Point3D):
    @staticmethod
    def create(x, y, z):
        return Vector3D(x, y, z)


class Matrix3D:
    @staticmethod
    def create():
        return Matrix3D()


class OrientedBoundingBox3D:
    def __init__(self, c, l, w, a, b, h):
        self.c, self.l, self.w, self.size = c, l, w, (a, b, h)

    @staticmethod
    def create(c, l, w, a, b, h):
        return OrientedBoundingBox3D(c, l, w, a, b, h)


class DocumentTypes:
    FusionDesignDocumentType = 0


class MessageBoxButtonTypes:
    YesNoButtonType = 3


class DialogResults:
    DialogYes = 2
    DialogNo = 3


class _UI:
    def messageBox(self, m, *args):
        REGISTRO["mensajes"].append(m)
        if args:
            REGISTRO.setdefault("preguntas", []).append(m)
            return DialogResults.DialogYes if REGISTRO.get("responder_si") else DialogResults.DialogNo


class _Libs:
    count = 0


class _Docs:
    def add(self, t):
        from adsk.fusion import Design
        REGISTRO["documentos_nuevos"] = REGISTRO.get("documentos_nuevos", 0) + 1
        Application.get().activeProduct = Design()


class Application:
    _app = None

    def __init__(self):
        from adsk.fusion import Design
        self.userInterface = _UI()
        self.activeProduct = Design()
        self.materialLibraries = _Libs()
        self.documents = _Docs()

    @staticmethod
    def get():
        if Application._app is None:
            Application._app = Application()
        return Application._app
