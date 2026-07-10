import pandas as pd


class Dimension:
    def __init__(self, name):
        self.name = name
        self.factors = []


class Factor:
    def __init__(self, name):
        self.name = name
        self.decisor_importance = 1
        self.suggested_importance = 1
        self.relative_importance = 1
        self.relevant = False
        self.global_weigth = 1
        self.subfactors = []
        self.dimension = None
        self.scope = ""


class Subfactor:
    def __init__(self, name):
        self.name = name
        self.weight = 1
        self.factor = None


class Guiosad():
    levels_lbls = ["Irrelevante", "Opcional", "Importante", "Fundamental"]
    sub_levels_lbls = ["No cumple el requisito", "Desconozco si cumple requisito", "Cumple parcialmente el requisito", "Cumple el requisito"]
    scope_levels = ["Interno", "Externo", "Ambos"]
    foda_levels = ["Fortaleza", "Oportunidad", "Debilidad", "Amenaza"]
    def __init__(self):
        self.data = []
        self.subfactors_list = []
        self.guiosad_data = pd.read_csv(filepath_or_buffer="guiosad_data.csv", sep="\t")
        self.factors_data = pd.read_csv(filepath_or_buffer="factors.csv", sep="\t")
        self.dimensions = []
        self.factors = []
        self.factors_lbls = []
        self.subfactors = []
        dims = self.guiosad_data["Dimensión"].unique().tolist()
        for d in dims:
            dimension = Dimension(name=d)
            df_dim = self.guiosad_data[self.guiosad_data["Dimensión"] == d]
            factors_dim = df_dim["Factor"].unique().tolist()
            for f in factors_dim:
                fdict = {
                    "name":f,
                    "IS":1,
                    "ID":1,
                    "IR":1,
                    "relevant":True,
                    "subfactors":[],
                    "global":1,
                    "scope":"Interno",
                    "foda":"Debilidad"
                }
                factor = Factor(name=f)
                df_factor = df_dim[df_dim["Factor"] == f]
                subfactors_factor = df_factor["Subfactor"].to_list()
                self.subfactors_list.append(subfactors_factor)
                subfactores = []
                for s in subfactors_factor:
                    subfactor = Subfactor(name=s)
                    subfactor.factor = factor
                    factor.subfactors.append(subfactor)
                    self.subfactors.append(subfactor)

                    sbf = {
                        "name":s,
                        "weight":1
                    }
                    subfactores.append(sbf)

                fdict["subfactors"] = subfactores

                self.data.append(fdict)

                dimension.factors.append(factor)
                factor.dimension = dimension
                suggested_importance = self.factors_data[self.factors_data["Factor"] == f]["Sugerida"].to_list()[0]
                factor.suggested_importance = suggested_importance
                scope = self.factors_data[self.factors_data["Factor"] == f]["Alcance"].to_list()[0]
                factor.scope = scope
                self.factors.append(factor)
                self.factors_lbls.append(factor.name)
            self.dimensions.append(dimension)

    def get_suggested_importances(self):
        importances = []
        for f in self.factors:
            importances.append(f.suggested_importance)
        return importances

    def get_scopes(self):
        scopes = []
        for f in self.factors:
            scopes.append(f.scope)
        return scopes

    def assigment_function(input1, input2):
        value1 = Guiosad.levels_lbls.index(input1)
        value2 = Guiosad.levels_lbls.index(input2)
        result = (value1 + value2)//2
        return Guiosad.levels_lbls[result]

    def relevant(self, input1, input2):
        r = Guiosad.assigment_function(input1, input2)
        return Guiosad.levels_lbls.index(r) > 2


if __name__ == '__main__':
    g = Guiosad()
    print(g.data)