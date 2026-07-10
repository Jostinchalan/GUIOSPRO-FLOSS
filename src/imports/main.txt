from flexx import flx
from guiosad import Guiosad

guiosad = Guiosad()
factors_lbls = guiosad.factors_lbls

factors = guiosad.factors
subfactors = guiosad.data
relevant_factors = []
relevant_factors_lbls = []
subfactors_list = guiosad.subfactors_list

the_importance_levels = Guiosad.levels_lbls
the_subfactor_importance_levels = Guiosad.sub_levels_lbls
the_factors_suggested_importance = guiosad.get_suggested_importances()
the_scopes = guiosad.get_scopes()
all_factors = guiosad.factors_lbls
the_subfactors = guiosad.subfactors_list
the_subfactors_importance = []

for fff in the_subfactors:
    the_imp = [1] * len(fff)
    the_subfactors_importance.append(the_imp)

the_factor_global_weigth = [1] * len(all_factors)
the_factor_classification = [True] * len(all_factors)
the_factor_foda = ["Debilidad"] * len(all_factors)


def relevant_factor(input1, input2) -> bool:
    value1 = Guiosad.levels_lbls.index(input1)
    value2 = Guiosad.levels_lbls.index(input2)
    r = (value1 + value2) // 2
    return Guiosad.levels_lbls.index(r) > 1


class MainWidget(flx.Widget):

    def init(self):
        self.relevant_factors = []
        self.relevant_factors_lbls = factors_lbls
        self.selected_factor = all_factors[0]
        self.sub_save = False
        with flx.VFix():
            with flx.TabLayout():
                # 1st Tab
                self.suggested = []
                self.sliders = []
                self.results = []
                self.relative = []
                self.relevants = []
                self.fact_rel = []
                self.sub_sliders = []
                self.sub_txt_results = []
                self.fact_vfix = []
                self.chbs_class = []

                self.txts_global = []
                self.txts_class = []
                self.txts_foda = []

                with flx.VFix(title="Paso 1 y 2. Obtención de factores relevantes"):
                    lb = flx.Label(
                        html="<h5>Paso 1 y 2. Obtención de factores relevantes:</h5><p>El objetivo de este paso es determinar qué factores resultan"
                             " relevantes para el análisis de la adopción. Para ello, usted deberá evaluar la importancia "
                             "que tiene los factores para su organización. Asimismo, deberá clasificar aquellos que pueden ser, de acuerdo al"
                             " alcance de su impacto, internos o externos.</p>",
                        wrap=2, flex=0, minsize=100)
                    with flx.VFix(style='border:1px solid #777;', flex=1):
                        with flx.HFix(flex=0):
                            flx.Label(html="<b>Factor</b>", flex=2)
                            flx.Label(html="<b>Imp. Sugerida</b>", flex=1)
                            flx.Label(html="<b>Evaluación</b>", flex=1)
                            flx.Label(html="<b>Imp. Decisor</b>", flex=1)
                            flx.Label(html="<b>Imp. Relativa</b>", flex=1)
                            #flx.Label(html="<b>Relevante?</b>", flex=1)
                            flx.Label(html="<b>Alcance</b>", flex=1)
                        for f, imp, scp in zip(all_factors, the_factors_suggested_importance, the_scopes):
                            with flx.HFix(flex=0):
                                flx.Label(text=f, flex=2, wrap=1)
                                txt_suggested = flx.LineEdit(text=the_importance_levels[imp - 1], disabled=True, flex=1)
                                self.suggested.append(txt_suggested)

                                slider = flx.Slider(min=1, max=4, step=1, value=1, flex=1)
                                self.sliders.append(slider)

                                txt_results = flx.LineEdit(text=the_importance_levels[slider.value - 1], disabled=True,
                                                           flex=1)
                                self.results.append(txt_results)

                                txt_rel = flx.LineEdit(text="", disabled=True, flex=1)
                                self.relative.append(txt_rel)

                                #chb = flx.CheckBox(checked=True, flex=1)
                                #self.relevants.append(chb)

                                if scp == "Interno":
                                    with flx.HFix(flex=1):
                                        #chb_class = flx.CheckBox(checked=True, disabled=True, flex=1)
                                        txt_scope = flx.LineEdit(text="Interno", disabled=True,
                                                                     flex=1)
                                        #chb_class = flx.CheckBox(checked=True, disabled=True, flex=1)
                                        self.chbs_class.append(txt_scope)
                                elif scp == "Externo":
                                    with flx.HFix(flex=1):
                                        txt_scope = flx.LineEdit(text="Externo", disabled=True,
                                                                 flex=1)
                                        #chb_class = flx.CheckBox(checked=False, disabled=True, flex=1)
                                        self.chbs_class.append(txt_scope)
                                else:
                                    with flx.HFix(flex=1):
                                        comb_scope = flx.ComboBox(options=["Interno", "Externo"],
                                                                 flex=1)
                                        comb_scope.set_selected_index(0)
                                        # chb_class = flx.CheckBox(checked=False, disabled=False, flex=1)
                                        self.chbs_class.append(comb_scope)
                        flx.Label(text="", flex=0)

                # 2nd Tab
                with flx.VFix(title="Paso 3 y 4. Obtención de factores ponderados"):
                    flx.Label(
                        html="<h5>Paso 3 y 4. Obtención de factores ponderados: </h5>El objetivo de este paso es establecer la "
                             "relevancia que tienen los subfactores que componen a los factores que resultaron relevantes "
                             "del paso anterior. Seleccione el factor en la lista desplegable y cuando termine de "
                             "establecer la importancia por los subfactores, elija guardar en el botón correspondiente.",
                        wrap=2, flex=0, minsize=100)
                    with flx.HBox(flex=0):
                        flx.Label(html="<b>Factor:</b>", flex=0)
                        self.cmb_sub = flx.ComboBox(options=tuple(self.relevant_factors_lbls),
                                                    selected_index=0, flex=2)
                        self.btn_sub = flx.Button(text="Guardar", flex=0)
                        self.btn_sub.apply_style("type:button;")
                    with flx.VFix(style='border:1px solid #777;', flex=4) as the_p:
                        with flx.HFix(flex=0):
                            flx.Label(html="<b>Subfactor</b>", flex=3)
                            flx.Label(html="<b>Evaluación</b>", flex=1)
                            flx.Label(html="<b>Resultado</b>", flex=1)
                        self.subvfix = flx.VFix()
                        flx.Label(text="", flex=1, parent=the_p)

                # 3rd Tab
                with flx.VFix(title="Paso 5 y 6. Evaluación y recomendación sobre la adopción"):
                    flx.Label(
                        html="<h5>Paso 5 y 6. Evaluación y recomendación sobre la adopción: </h5><p>En este paso se muestra la clasificación FODA de cada factor"
                             " atendiendo a su importancia global y alcance para la organización. En caso de que el factor"
                             " no contenga valores, significa que este no fue considerado relevante en el paso 1 y 2, o no<p>"
                             " fueron evaluados aún sus subfactores.", wrap=2, flex=0, minsize=100)

                    with flx.VFix(style='border:1px solid #777;', flex=1):
                        with flx.HFix(flex=0):
                            flx.Label(html="<b>Factor</b>", flex=2)
                            flx.Label(html="<b>Ponderación media del factor</b>", flex=1)
                            flx.Label(html="<b>Alcance</b>", flex=1)
                            flx.Label(html="<b>FODA</b>", flex=1)
                        for f, w in zip(all_factors, the_factor_global_weigth):
                            fi = all_factors.index(f)
                            with flx.HFix(flex=0):
                                flx.Label(text=f, flex=2, wrap=1)
                                txt_global = flx.LineEdit(text="", disabled=True, flex=1)
                                self.txts_global.append(txt_global)
                                txt_class = flx.LineEdit(text="", disabled=True, flex=1)
                                self.txts_class.append(txt_class)
                                txt_foda = flx.LineEdit(text="", disabled=True, flex=1)
                                self.txts_foda.append(txt_foda)
                        with flx.HFix(flex=0, minsize=130):
                            flx.Label(text="", flex=2)
                            self.btn_recom = flx.Button(text="Ver recomendación", flex=1)
                            self.recom = flx.MultiLineEdit(text="", flex=2, minsize=80)
                        flx.Label(text="", flex=1)

    @flx.reaction("btn_recom.pointer_click")
    def recom_on_click(self, *events):
        self.compute_recommendation()

    @flx.reaction
    def update_results(self, *events):
        self.relevant_factors_lbls.clear()
        for sld, txt in zip(self.sliders, self.results):
            txt.user_text(the_importance_levels[sld.value - 1])
        relevant_list = []
        relative_list = []
        for sugg, txt in zip(self.suggested, self.results):
            str1 = str(sugg.text)
            str2 = str(txt.text)
            r1 = the_importance_levels.index(str1)
            r2 = the_importance_levels.index(str2)
            r = (r1 + r2) // 2
            relative_list.append(the_importance_levels[r])
            relevant_list.append(r > 0)

        for rel, txt_rel in zip(relative_list, self.relative):
            txt_rel.user_text(rel)

        for rel, cb in zip(relevant_list, self.relevants):
            cb.user_checked(rel)

        for f, rel in zip(all_factors, relevant_list):
            if rel:
                self.relevant_factors_lbls.append(f)
        if self.relevant_factors_lbls:
            self.cmb_sub.set_options(tuple(self.relevant_factors_lbls))
            self.cmb_sub.set_selected_key(self.selected_factor)

        for sld, txt in zip(self.sub_sliders, self.sub_txt_results):
            txt.user_text(the_importance_levels[sld.value - 1])

        for txt_g, txt_c, txt_f, rel in zip(self.txts_global, self.txts_class, self.txts_foda, relevant_list):
            if not rel:
                txt_g.user_text("")
                txt_c.user_text("")
                txt_f.user_text("Subfactores no evaluados.")
                txt_f.apply_style("background: #ffffff;")

    @flx.reaction('cmb_sub.text')
    def _combo_text_changed(self, *events):
        self.sub_sliders.clear()
        self.sub_txt_results.clear()
        for c in self.subvfix.children:
            c.dispose()
        self.selected_factor = self.cmb_sub.selected_key
        self.selected_factor_index = all_factors.index(self.selected_factor)
        self.selected_subfactors = the_subfactors[self.selected_factor_index]
        self.selected_subfactors_importance = the_subfactors_importance[self.selected_factor_index]
        for s in self.selected_subfactors:
            sind = self.selected_subfactors.index(s)
            si = self.selected_subfactors_importance[sind]
            with flx.HFix(flex=0, parent=self.subvfix) as subhfix:
                flx.Label(text=s, flex=3, wrap=1, parent=subhfix)
                sub_slider = flx.Slider(min=1, max=4, step=1, value=si, flex=1, parent=subhfix)
                self.sub_sliders.append(sub_slider)
                txt_sub_result = flx.LineEdit(text=the_subfactor_importance_levels[si - 1], disabled=True, flex=1, parent=subhfix)
                self.sub_txt_results.append(txt_sub_result)

    @flx.reaction("btn_sub.pointer_click")
    def btn_sub_pressed(self, *events):
        global_weight = 0.
        for i in range(len(self.selected_subfactors)):
            si = self.sub_sliders[i].value
            the_subfactors_importance[self.selected_factor_index][i] = si
            self.sub_txt_results[i].user_text(the_subfactor_importance_levels[si - 1])
            global_weight += si

        global_weight = global_weight / len(self.selected_subfactors)
        the_factor_global_weigth[self.selected_factor_index] = global_weight
        the_global_imp = the_importance_levels[global_weight - 1]
        # self.txts_global[self.selected_factor_index].user_text("{}({})".format(the_global_imp, str(global_weight)))
        self.txts_global[self.selected_factor_index].user_text("{:.1f}".format(str(global_weight)))
        #classif = self.chbs_class[self.selected_factor_index].checked
        #classif_lbl = "Externo"
        #if classif:
        #    classif_lbl = "Interno"

        classif_lbl = self.chbs_class[self.selected_factor_index].text

        self.txts_class[self.selected_factor_index].user_text(classif_lbl)
        foda = ""
        style_neutro = "background: #cccccc;"
        style_bad = "background: #ff9ec0;"
        style_good = "background: #9d9;"
        the_style = style_neutro
        if classif_lbl == "Interno":
            if global_weight >= 3:
                foda = "Fortaleza"
                the_style = style_good
            else:
                foda = "Debilidad"
                the_style = style_bad
        else:
            if global_weight >= 3:
                foda = "Oportunidad"
                the_style = style_good
            else:
                foda = "Amenaza"
                the_style = style_bad

        self.txts_foda[self.selected_factor_index].user_text(foda)
        self.txts_foda[self.selected_factor_index].apply_style(the_style)

    def compute_recommendation(self):
        style_neutro = "background: #ffee78;"
        style_bad = "background: #ff9ec0;"
        style_good = "background: #9d9;"
        good = 0
        bad = 0
        ra = "Recomendación C: La organización debe de proporcionar los recursos necesarios que garanticen una adopción satisfactoria. Si se trata de factores internos deben de ser aspectos a mejorar dentro de la organización y si son factores externos, dedicar recursos de ingeniería para mejorar el software."
        rb = "Recomendación B: Es posible adoptar. A pesar que se han detectado amenazas y/o debilidades en factores cuya importancia relativa es opcional, por lo tanto, se sugiere revisar los criterios que no cumplen con lo mínimo requerido para adoptar. "
        rc = "Recomendación A: Adoptar. Todos los factores han sido identifcados como Oportunidades y/o Fortalezas. Esto quiere decir que la organización cumple satisfactoriamente con la mayoria de requisitos para adoptar la solución FLOSS."
        relative_list = []
        foda_list = []

        for foda, rel in zip(self.txts_foda, self.relative,):
            if not(foda.text == "" or foda.text == "Subfactores no evaluados."):
                relative_list.append(rel.text)
                foda_list.append(foda.text)

        opcional=0
        fundamental=0
        importante =0
        irrelevante=0
        amenaza=0
        debilidad=0
        oportunidad=0
        fortaleza=0

        for i in relative_list:
            if i=="Opcional":
                opcional += 1
            elif i == "Fundamental":
                fundamental += 1
            elif i == "Importante":
                importante += 1
            elif i == "Irrelevante":
                irrelevante += 1

        # totales = " TOTALES: opcional: {}  " \
        #                "fundamental: {} " \
        #                "importante : {} " \
        #                "irrelevante: {}".format(opcional, fundamental,importante, irrelevante )

        for txt_f in self.txts_foda:
            if str(txt_f.text) in ["Fortaleza"]:
                good += 1
                fortaleza += 1
            elif str(txt_f.text) in ["Oportunidad"]:
                good += 1
                oportunidad += 1
            elif str(txt_f.text) in ["Debilidad"]:
                bad += 1
                debilidad += 1
            elif str(txt_f.text) in ["Amenaza"]:
                bad += 1
                amenaza += 1

        # totales += " Fortaleza:{} Oportunidad:{} Debilidad:{} " \
        #            "Amenaza:{}".format(fortaleza, oportunidad,debilidad, amenaza )

        decision = "Adoptar, pues la cantidad de factores identificados como Fortalezas u Oportunidades ({}) supera a " \
                   "los identificados como Debilidad o Amenazas ({}).".format(good, bad)
        the_style = style_good
        if good < bad:
            decision = "No adoptar, pues la cantidad de factores identificados como Debilidades o Amenazas ({}) supera " \
                       "a los identificados como Fortalezas u Oportunidades ({}). ".format(bad, good )
            the_style = style_bad
        elif good == bad:
            decision = "Se deben considerar otros factores no analizados por GUIOSAD, pues existe la misma cantidad ({}) de " \
                       "factores identificados como Fortalezas u Oportunidades y aquellos identificados como Debilidades" \
                       " o Amenazas.".format(good)
            the_style = style_neutro

        #AUMENTADO POR KERLY
        a, b, c = False
        for r, f in zip(relative_list, foda_list):
            if (f == "Amenaza" or f == "Debilidad") and (r == "Importante" or r == "Fundamental"):
                a = True
            elif (f == "Amenaza" or f == "Debilidad") and (r == "Opcional"):
                b = True
            else:
                c = True
        ####################################3
        if a:
            decision = ra
            the_style = style_bad
        elif b:
            decision = rb
            the_style = style_neutro
        else:
            decision = rc
            the_style = style_good

        if not foda_list[0]:
            decision = ""



        #FIN AUMENTO KERLY

        self.recom.user_text(decision)
        self.recom.apply_style(the_style)


if __name__ == '__main__':
    a = flx.App(MainWidget, title="GUIOSAD v. 0.1.2")
    a.launch()
    a.export('~/guiosad.html', link=0)
    flx.run()
