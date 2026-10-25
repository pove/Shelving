import os
from adsk import REGISTRO


class DesignTypes:
    DirectDesignType = 0
    ParametricDesignType = 1


class BooleanTypes:
    DifferenceBooleanType = 0


class Body:
    def __init__(self, obb):
        self.obb = obb
        self.cortes = []
        self.appearance = None


class TemporaryBRepManager:
    _t = None

    @staticmethod
    def get():
        if TemporaryBRepManager._t is None:
            TemporaryBRepManager._t = TemporaryBRepManager()
        return TemporaryBRepManager._t

    def createBox(self, obb):
        return Body(obb)

    def booleanOperation(self, target, tool, t):
        target.cortes.append(tool)
        return True


class _BF:
    def __init__(self):
        self.editing = False

    def startEdit(self):
        self.editing = True

    def finishEdit(self):
        self.editing = False


class _BFs:
    def add(self):
        return _BF()


class _Features:
    def __init__(self):
        self.baseFeatures = _BFs()


class _Bodies:
    def __init__(self, comp):
        self.items = []
        self.comp = comp

    def add(self, body, bf=None):
        if self.comp.design.designType == DesignTypes.ParametricDesignType:
            assert bf is not None and bf.editing, "en paramétrico hace falta base feature"
        self.items.append(body)
        return body

    @property
    def count(self):
        return len(self.items)

    def item(self, i):
        return self.items[i]


class _Occs:
    def __init__(self, comp):
        self.comp = comp

    def addNewComponent(self, m):
        c = Component(self.comp.design, self.comp)
        occ = type("Occ", (), {"component": c, "isLightBulbOn": True})()
        c.occ = occ
        return occ


class Component:
    def __init__(self, design, parent=None):
        self.design = design
        self.parent = parent
        self.name = ""
        self.occ = None
        self.occurrences = _Occs(self)
        self.features = _Features()
        self.bRepBodies = _Bodies(self)
        REGISTRO["componentes"].append(self)


class _Aps:
    count = 0

    def itemByName(self, n):
        return None


class Design:
    def __init__(self):
        self.designType = int(os.environ.get("DESIGN_TYPE", "1"))
        self.rootComponent = Component(self)
        self.appearances = _Aps()

    @staticmethod
    def cast(x):
        return x
