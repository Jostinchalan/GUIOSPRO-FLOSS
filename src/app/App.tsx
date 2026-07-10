/**
 * GUIOSPRO FLOSS — Frontend React
 * ================================
 * Framework  : React 18 + TypeScript
 * Estilos    : Tailwind CSS v4
 * Build tool : Vite
 *
 * Backend Python (FastAPI) en: /backend/main.py
 *   Arrancar: cd backend && uvicorn main:app --reload --port 8000
 *
 * Puntos de integración API (buscar etiqueta en el código):
 *   API_PUNTO_1  → GET  /api/software-info       (auto-descripción del software)
 *   API_PUNTO_2  → GET  /api/factor-info          (info de factor según software)
 *   API_PUNTO_3  → POST /api/suggest-factors      (sugerencia IA de factores)
 *   API_PUNTO_4  → POST /api/analyze-file         (análisis de imagen o PDF)
 */

import { useState, useEffect, useRef } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FACTORS as DEFAULT_FACTORS,
  IMPORTANCE_LEVELS,
  SUB_IMPORTANCE_LEVELS,
  Factor,
} from "./data/guiosad-data";
import {
  Download, Upload, FileText, Plus, Trash2, X,
  ChevronRight, Save, Loader2, Info, ListChecks,
  Sparkles, CheckCircle2, AlertTriangle, ImageIcon, BookOpen, RotateCcw
} from "lucide-react";
import logoImage from "./assets/logo.png";

import jsPDF from "jspdf";
import "jspdf-autotable";

// URL base del backend Python
const API_BASE = (import.meta.env.VITE_API_BASE as string) || "http://localhost:8000/api";

// ──────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────

interface FactorEvaluation {
  decisorImportance: number;
  relativeImportance: string;
  isRelevant: boolean;
  scope: "Interno" | "Externo";
  subfactorWeights: number[];
  globalWeight: number;
  foda: string;
  suggestedImportance: number;
}

interface PDFHistory {
  id: string;
  idEvaluacion?: number;      // id en la base de datos PostgreSQL (si ya se guardó)
  softwareName: string;
  softwareDescription: string;
  evaluatorName: string;
  companyName: string;
  date: string;
  recommendation: string;
  factors: Factor[];
  evaluations: FactorEvaluation[];
  loadedFromDb?: boolean;     // true si vino de /api/evaluaciones y aún no se cargó el detalle completo
}

// Convierte el texto de recomendación en el código de una letra que
// guarda la BD (columna evaluacion.recomendacion_final VARCHAR(1)).
const recommendationToCode = (rec: string): "A" | "B" | "C" => {
  if (rec.includes("C:")) return "C";
  if (rec.includes("B:")) return "B";
  return "A";
};

interface LoadingOverlay {
  show: boolean;
  message: string;
  showLogo: boolean;
}

interface AIFactorSuggestion {
  factorName: string;
  reason: string;
}

// ──────────────────────────────────────────────────────────
// UTILIDAD: logo → Data URL para el PDF
// ──────────────────────────────────────────────────────────

const getImageDataUrl = (src: string): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")?.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });

// ──────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────

export default function App() {

  // ── Estado: flujo de bienvenida ──
  const [showWelcome, setShowWelcome] = useState(true);
  const [showSoftwareInput, setShowSoftwareInput] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");
  const [welcomeDesc, setWelcomeDesc] = useState("");
  const [welcomeEvaluator, setWelcomeEvaluator] = useState("");
  const [welcomeCompany, setWelcomeCompany] = useState("");

  // ── Estado: datos del software ──
  const [softwareName, setSoftwareName] = useState("");
  const [softwareDescription, setSoftwareDescription] = useState("");
  const [evaluatorName, setEvaluatorName] = useState("");
  const [companyName, setCompanyName] = useState("");

  // ── Estado: overlay de carga global ──
  const [loadingOverlay, setLoadingOverlay] = useState<LoadingOverlay>({
    show: false, message: "", showLogo: false,
  });

  // ── Estado: factores ──
  const [selectedFactors, setSelectedFactors] = useState<Factor[]>([]);
  const [customFactors, setCustomFactors] = useState<Factor[]>([]);
  const [tempSelectedFactors, setTempSelectedFactors] = useState<Factor[]>([]);

  // ── Estado: diálogos ──
  const [showFactorsDialog, setShowFactorsDialog] = useState(false);
  const [showAddFactorDialog, setShowAddFactorDialog] = useState(false);
  const [showFactorInfoDialog, setShowFactorInfoDialog] = useState(false);
  const [factorInfoTarget, setFactorInfoTarget] = useState<Factor | null>(null);
  const [factorInfoText, setFactorInfoText] = useState("");
  const [factorInfoLoading, setFactorInfoLoading] = useState(false);

  // ── Estado: evaluación incompleta ──
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [incompleteFactorsList, setIncompleteFactorsList] = useState<string[]>([]);

  // ── Estado: IA sugerencia de factores (API_PUNTO_3) ──
  const [isLoadingAISuggestion, setIsLoadingAISuggestion] = useState(false);
  const [aiFactorSuggestions, setAiFactorSuggestions] = useState<AIFactorSuggestion[]>([]);
  const [showAISuggestionPanel, setShowAISuggestionPanel] = useState(false);
  const [showSourcesDialog, setShowSourcesDialog] = useState(false);
  const [aiBibliography, setAiBibliography] = useState<any[]>([]);
  const [aiJustification, setAiJustification] = useState<string>("");

  // ── Estado: nuevo factor personalizado ──
  const [newFactorName, setNewFactorName] = useState("");
  const [newFactorSubfactors, setNewFactorSubfactors] = useState<string[]>([""]);

  // ── Estado: evaluaciones ──
  const allFactors = [...selectedFactors, ...customFactors];
  const [evaluations, setEvaluations] = useState<FactorEvaluation[]>([]);
  const [selectedFactorIndex, setSelectedFactorIndex] = useState(0);

  // ── Estado: resultado final ──
  const [recommendation, setRecommendation] = useState("");
  const [recommendationStyle, setRecommendationStyle] = useState("");

  // ── Estado: historial ──
  const [pdfHistory, setPdfHistory] = useState<PDFHistory[]>([]);

  // ── Estado: análisis IA de archivo (API_PUNTO_4) ──
  interface AnalyzedPDF {
    id: string;
    name: string;
    loading: boolean;
    recommendation?: string;
    error?: boolean;
  }
  const [analyzedPDFs, setAnalyzedPDFs] = useState<AnalyzedPDF[]>([]);
  const [activePDFReport, setActivePDFReport] = useState<AnalyzedPDF | null>(null);
  const [showPDFReportDialog, setShowPDFReportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado: navegación ──
  const [currentTab, setCurrentTab] = useState("tab0");

  // ── Derivados ──
  const relevantFactors = allFactors.filter((_, idx) => evaluations[idx]?.isRelevant);
  const relevantIndices = allFactors.map((_, idx) => idx).filter(idx => evaluations[idx]?.isRelevant);

  // ──────────────────────────────────────────────────────────
  // EFECTOS
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    setEvaluations(
      allFactors.map(f => ({
        decisorImportance: 1,
        relativeImportance: IMPORTANCE_LEVELS[0],
        isRelevant: false,
        scope: f.scope === "Ambos" ? "Interno" : f.scope,
        subfactorWeights: f.subfactors.map(() => 1),
        globalWeight: 0,
        foda: "",
        suggestedImportance: f.suggestedImportance,
      }))
    );
  }, [allFactors.map(f => f.name).join(",")]);

  // Asegurar que el selectedFactorIndex nunca quede fuera de rango
  useEffect(() => {
    if (selectedFactorIndex >= relevantFactors.length) {
      setSelectedFactorIndex(0);
    }
  }, [relevantFactors.length, selectedFactorIndex]);

  useEffect(() => {
    setEvaluations(prev =>
      prev.map((ev, idx) => {
        if (!allFactors[idx]) return ev;
        const ri = Math.floor((ev.suggestedImportance - 1 + ev.decisorImportance - 1) / 2);
        return { ...ev, relativeImportance: IMPORTANCE_LEVELS[ri], isRelevant: ri > 0 };
      })
    );
  }, [evaluations.map(e => `${e.decisorImportance}-${e.suggestedImportance}`).join(",")]);

  useEffect(() => {
    if (showFactorsDialog) {
      setTempSelectedFactors([...selectedFactors]);
      setShowAISuggestionPanel(false);
      setAiFactorSuggestions([]);
    }
  }, [showFactorsDialog]);

  // — Cargar historial guardado en PostgreSQL (pgAdmin4) al iniciar —
  //   Si el backend o la BD no están disponibles, simplemente se queda
  //   con el historial vacío (no rompe la app).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/evaluaciones`);
        if (!res.ok) throw new Error();
        const rows = await res.json();
        setPdfHistory(
          rows.map((r: any) => ({
            id: `db-${r.id_evaluacion}`,
            idEvaluacion: r.id_evaluacion,
            softwareName: r.softwareName,
            softwareDescription: r.softwareDescription || "",
            evaluatorName: r.evaluatorName || "",
            companyName: r.companyName || "",
            date: r.date ? new Date(r.date).toLocaleDateString() : "",
            recommendation: `Recomendación ${r.recommendationCode || "A"}`,
            factors: [],
            evaluations: [],
            loadedFromDb: true,
          }))
        );
      } catch {
        // Backend/BD no disponible: se mantiene el historial local (vacío).
      }
    })();
  }, []);

  // ──────────────────────────────────────────────────────────
  // MANEJADORES
  // ──────────────────────────────────────────────────────────

  const showLoader = (msg: string, logo: boolean, ms: number, cb?: () => void) => {
    setLoadingOverlay({ show: true, message: msg, showLogo: logo });
    setTimeout(() => { cb?.(); setLoadingOverlay({ show: false, message: "", showLogo: false }); }, ms);
  };

  const handleNavigateToTab = (tab: string) =>
    showLoader("Cargando...", false, 400, () => setCurrentTab(tab));

  // — Bienvenida —

  const handleWelcomeContinue = () => { setShowWelcome(false); setShowSoftwareInput(true); };

  const handleSoftwareInputContinue = () => {
    if (!welcomeName.trim()) return;
    setSoftwareName(welcomeName);
    setSoftwareDescription(welcomeDesc);
    setEvaluatorName(welcomeEvaluator);
    setCompanyName(welcomeCompany);
    setShowSoftwareInput(false);
  };

  // — Factores —

  const handleTempFactorToggle = (factor: Factor) =>
    setTempSelectedFactors(prev =>
      prev.find(f => f.name === factor.name)
        ? prev.filter(f => f.name !== factor.name)
        : [...prev, factor]
    );

  const handleConfirmFactorSelection = () => {
    setSelectedFactors(tempSelectedFactors);
    setShowFactorsDialog(false);
  };

  const handleRemoveSelectedFactor = (name: string) => {
    setSelectedFactors(prev => prev.filter(f => f.name !== name));
    setCustomFactors(prev => prev.filter(f => f.name !== name));
  };

  const handleAddCustomFactor = () => {
    if (!newFactorName.trim()) return;
    const nf: Factor = {
      name: newFactorName,
      suggestedImportance: 2,
      scope: "Interno",
      subfactors: newFactorSubfactors.filter(s => s.trim()).map(s => ({ name: s, weight: 1 })),
    };
    setShowAddFactorDialog(false);
    showLoader("Añadiendo Nuevo Factor", true, 1500, () => {
      setCustomFactors(prev => [...prev, nf]);
      setNewFactorName("");
      setNewFactorSubfactors([""]);
    });
  };

  // — API_PUNTO_3: Sugerencia IA de factores —

  const handleAISuggestFactors = async () => {
    if (!softwareName.trim()) return;
    setIsLoadingAISuggestion(true);
    setShowAISuggestionPanel(false);

    try {
      // ── Llamada real al backend Python ──────────────────
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s para sugerencias IA
      const res = await fetch(`${API_BASE}/suggest-factors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          softwareName,
          availableFactors: DEFAULT_FACTORS.map(f => f.name),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("Error en la API");
      const data = await res.json();
      setAiFactorSuggestions(data.suggestions);
      setAiBibliography(data.bibliography || []);
      setAiJustification(data.justification || "");
    } catch {
      // Fallback simulado cuando el backend no está disponible
      await new Promise(r => setTimeout(r, 1800));
      setAiFactorSuggestions(
        DEFAULT_FACTORS.slice(0, 6).map(f => ({
          factorName: f.name,
          reason: `Recomendado para evaluar "${softwareName}" (simulado — conectar backend Python).`,
        }))
      );
      setAiJustification(
        `La selección de factores para evaluar '${softwareName}' se sustenta en los modelos empíricos de aceptación y difusión tecnológica (TAM y TOE).`
      );
      setAiBibliography([
        {
          title: "Information technology adoption in organizations: A review of empirical studies",
          author: "Tornatzky, L. G., & Fleischer, M.",
          year: "1990",
          source: "The Processes of Technological Innovation, Lexington Books",
          relevance: `Sustenta los factores de Compatibilidad y Portabilidad para '${softwareName}'.`
        },
        {
          title: "Perceived usefulness, perceived ease of use, and user acceptance of information technology",
          author: "Davis, F. D.",
          year: "1989",
          source: "MIS Quarterly",
          relevance: `Sustenta la Usabilidad y Utilidad Percibida de '${softwareName}'.`
        }
      ]);
    }

    setIsLoadingAISuggestion(false);
    setShowAISuggestionPanel(true);
  };

  const handleAcceptAISuggestion = () => {
    const names = aiFactorSuggestions.map(s => s.factorName);
    const toAdd = DEFAULT_FACTORS.filter(f => names.includes(f.name));
    setTempSelectedFactors(prev => {
      const merged = [...prev];
      toAdd.forEach(f => { if (!merged.find(x => x.name === f.name)) merged.push(f); });
      return merged;
    });
    setShowAISuggestionPanel(false);
  };

  // — API_PUNTO_2: Info de factor —

  const handleOpenFactorInfo = async (factor: Factor) => {
    setFactorInfoTarget(factor);
    setFactorInfoText("");
    setFactorInfoLoading(true);
    setShowFactorInfoDialog(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `${API_BASE}/factor-info?factor=${encodeURIComponent(factor.name)}&software=${encodeURIComponent(softwareName)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFactorInfoText(data.description);
    } catch {
      clearTimeout(timeoutId);
      setFactorInfoText(
        `El factor "${factor.name}" evalúa aspectos clave de la viabilidad técnica y organizativa al adoptar "${softwareName || "el software evaluado"}" en la empresa. ` +
        "(Gemini no disponible en este momento — intenta de nuevo en unos segundos.)"
      );
    }
    setFactorInfoLoading(false);
  };

  // — Evaluaciones —

  const handleDecisorChange = (i: number, v: number) =>
    setEvaluations(p => { const n = [...p]; n[i] = { ...n[i], decisorImportance: v }; return n; });

  const handleSuggestedChange = (i: number, v: number) =>
    setEvaluations(p => { const n = [...p]; n[i] = { ...n[i], suggestedImportance: v }; return n; });

  const handleScopeChange = (i: number, scope: "Interno" | "Externo") =>
    setEvaluations(p => { const n = [...p]; n[i] = { ...n[i], scope }; return n; });

  const handleSubfactorChange = (fi: number, si: number, v: number) => {
    try {
      if (fi === undefined || !evaluations[fi] || !evaluations[fi].subfactorWeights) return;
      setEvaluations(p => {
        const n = [...p];
        if (!n[fi]) return p;
        const w = [...n[fi].subfactorWeights];
        w[si] = v;
        n[fi] = { ...n[fi], subfactorWeights: w };
        return n;
      });
    } catch (err) {
      console.error("Error in handleSubfactorChange:", err);
    }
  };

  const handleSaveSubfactors = () => {
    try {
      const fi = relevantIndices[selectedFactorIndex];
      console.log("[SaveSubfactors] selectedFactorIndex:", selectedFactorIndex, "fi:", fi);
      if (fi === undefined || !evaluations[fi]) {
        console.warn("[SaveSubfactors] Index or evaluation object not found for fi:", fi);
        return;
      }
      const weights = evaluations[fi].subfactorWeights;
      if (!weights || weights.length === 0) {
        console.warn("[SaveSubfactors] subfactorWeights array is empty or undefined");
        return;
      }
      const gw = weights.reduce((s, w) => s + w, 0) / weights.length;
      const foda = evaluations[fi].scope === "Interno"
        ? (gw >= 3 ? "Fortaleza" : "Debilidad")
        : (gw >= 3 ? "Oportunidad" : "Amenaza");
      setEvaluations(p => {
        const n = [...p];
        if (!n[fi]) return p;
        n[fi] = { ...n[fi], globalWeight: gw, foda };
        return n;
      });
    } catch (err: any) {
      console.error("[SaveSubfactors] Critical error saving:", err);
      alert("Error al guardar la evaluación del subfactor: " + err.message);
    }
  };

  const handleSaveSubfactorsWithLoading = () =>
    showLoader("Guardando", true, 600, handleSaveSubfactors);

  // — Validación de evaluación completa (Tab 2 → Tab 3) —
  //   Un factor relevante está "completo" cuando globalWeight > 0
  //   (es decir, el usuario hizo clic en Guardar para ese factor).

  const handleContinueFromTab2 = () => {
    const incomplete = relevantFactors
      .map((f, i) => evaluations[relevantIndices[i]]?.globalWeight === 0 ? f.name : null)
      .filter(Boolean) as string[];

    if (incomplete.length > 0) {
      setIncompleteFactorsList(incomplete);
      setShowIncompleteWarning(true);
      return;
    }
    handleNavigateToTab("tab3");
  };

  // — Recomendación final —

  const computeRecommendation = () => {
    const evals = evaluations.filter(e => e.foda);
    if (!evals.length) { setRecommendation(""); return; }
    let iw = false, ow = false;
    evals.forEach(e => {
      if ((e.foda === "Amenaza" || e.foda === "Debilidad") &&
          (e.relativeImportance === "Importante" || e.relativeImportance === "Fundamental")) iw = true;
      else if ((e.foda === "Amenaza" || e.foda === "Debilidad") && e.relativeImportance === "Opcional") ow = true;
    });
    if (iw) {
      setRecommendation("Recomendación C: La organización debe proporcionar los recursos necesarios que garanticen una adopción satisfactoria. Si se trata de factores internos, deben mejorarse dentro de la organización; si son externos, se deben dedicar recursos de ingeniería para mejorar el software.");
      setRecommendationStyle("#ff9ec0");
    } else if (ow) {
      setRecommendation("Recomendación B: Es posible adoptar. Se detectaron amenazas y/o debilidades en factores de importancia opcional. Se sugiere revisar los criterios que no cumplen con lo mínimo requerido.");
      setRecommendationStyle("#ffee78");
    } else {
      setRecommendation("Recomendación A: Adoptar. Todos los factores han sido identificados como Oportunidades y/o Fortalezas. La organización cumple los requisitos para adoptar la solución FLOSS.");
      setRecommendationStyle("#9d9");
    }
  };

  // — API_PUNTO_4: Análisis de imagen o PDF —

  // — API_PUNTO_4: Análisis de PDF —

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPDFs: AnalyzedPDF[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;

      const newId = `${file.name}-${Date.now()}-${i}`;
      newPDFs.push({
        id: newId,
        name: file.name,
        loading: true,
      });
    }

    if (newPDFs.length === 0) return;

    // Agregar todos los nuevos PDFs cargados
    setAnalyzedPDFs(prev => [...prev, ...newPDFs]);

    // Ejecutar llamada a la API para cada archivo subido
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;

      const targetId = newPDFs.find(p => p.name === file.name)?.id;
      if (!targetId) continue;

      try {
        const formData = new FormData();
        formData.append("file", file);
        const pdfController = new AbortController();
        const pdfTimeout = setTimeout(() => pdfController.abort(), 60000); // 1 min para analisis de PDF
        const res = await fetch(`${API_BASE}/analyze-file`, { method: "POST", body: formData, signal: pdfController.signal });
        clearTimeout(pdfTimeout);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAnalyzedPDFs(prev => {
          const updated = prev.map(p => p.id === targetId ? { ...p, loading: false, recommendation: data.recommendation } : p);
          const completedPdf = updated.find(p => p.id === targetId);
          if (completedPdf) {
            setActivePDFReport(completedPdf);
            setShowPDFReportDialog(true);
          }
          return updated;
        });
      } catch (err) {
        setAnalyzedPDFs(prev =>
          prev.map(p => p.id === targetId ? { ...p, loading: false, error: true, recommendation: "Error al realizar el análisis con Gemini." } : p)
        );
      }
    }

    // Limpiar input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ──────────────────────────────────────────────────────────
  // GENERACIÓN DEL PDF (con logo)
  // ──────────────────────────────────────────────────────────

  const generatePDFDocument = async (
    name: string, description: string,
    evaluator: string, company: string,
    factors: Factor[], evals: FactorEvaluation[], rec: string
  ) => {
    const doc = new jsPDF();
    const logoDataUrl = await getImageDataUrl(logoImage);

    try {
      let y = 15;

      if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 14, y, 25, 25);

      doc.setFontSize(20); doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text("GUIOSPRO FLOSS", logoDataUrl ? 45 : 105, y + 9, { align: logoDataUrl ? "left" : "center" });
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text("Análisis de Adopción de Software de Código Abierto", logoDataUrl ? 45 : 105, y + 17, { align: logoDataUrl ? "left" : "center" });

      y += 33;
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.7); doc.line(14, y, 196, y);
      y += 8;

      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 64, 175);
      doc.text("INFORMACIÓN DEL SOFTWARE EVALUADO", 14, y); y += 7;

      doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
      ([
        ["Nombre del Software", name || "Sin nombre"],
        ["Descripción", description || "Sin descripción"],
        ["Evaluador", evaluator || "No especificado"],
        ["Empresa", company || "No especificada"],
        ["Fecha de Evaluación", new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })],
      ] as [string, string][]).forEach(([label, value]) => {
        doc.setFont("helvetica", "bold"); doc.text(`${label}:`, 14, y);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(value, 140);
        doc.text(lines, 55, y);
        y += lines.length * 5 + 2;
      });

      y += 4;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(14, y, 196, y); y += 8;

      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 64, 175);
      doc.text("RESULTADOS DE LA EVALUACIÓN", 14, y); y += 6;

      (doc as any).autoTable({
        startY: y,
        head: [["Factor", "Imp. Decisor", "Imp. Relativa", "Ponderación", "Alcance", "FODA"]],
        body: factors.map((f, i) => {
          const ev = evals[i];
          return [f.name, ev?.decisorImportance?.toString() ?? "N/A", ev?.relativeImportance ?? "N/A",
            ev?.globalWeight > 0 ? ev.globalWeight.toFixed(2) : "N/A", ev?.scope ?? "N/A", ev?.foda || "Sin evaluar"];
        }),
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold", halign: "center" },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { halign: "center", cellWidth: 20 }, 2: { halign: "center", cellWidth: 25 }, 3: { halign: "center", cellWidth: 25 }, 4: { halign: "center", cellWidth: 22 }, 5: { halign: "center", cellWidth: 28 } },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      y = (doc as any).lastAutoTable?.finalY ?? y;
      y += 12;
      if (y > 248) { doc.addPage(); y = 20; }

      if (rec) {
        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 64, 175);
        doc.text("RECOMENDACIÓN DEL SISTEMA", 14, y); y += 7;
        let bg: [number, number, number] = [153, 221, 153];
        if (rec.includes("C:")) bg = [255, 158, 192];
        else if (rec.includes("B:")) bg = [255, 238, 120];
        const recLines = doc.splitTextToSize(rec, 162);
        const boxH = recLines.length * 5.5 + 10;
        doc.setFillColor(...bg);
        doc.roundedRect(13, y - 3, 184, boxH, 3, 3, "F");
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
        doc.text(recLines, 18, y + 4);
      }

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${pages}  ·  Generado por GUIOSPRO FLOSS  ·  ${new Date().toLocaleDateString()}`, 105, 287, { align: "center" });
      }
    } catch (err) { console.error("Error PDF:", err); }
    return doc;
  };

  const handleResetAndReevaluate = () => {
    setSoftwareName("");
    setSoftwareDescription("");
    setEvaluatorName("");
    setCompanyName("");
    setWelcomeName("");
    setWelcomeDesc("");
    setWelcomeEvaluator("");
    setWelcomeCompany("");
    setSelectedFactors([]);
    setCustomFactors([]);
    setTempSelectedFactors([]);
    setEvaluations([]);
    setSelectedFactorIndex(0);
    setRecommendation("");
    setRecommendationStyle("");
    setCurrentTab("tab0");
    setShowWelcome(true);
  };

  const handleSaveHistoryWithLoading = () => {
    showLoader("Guardando historial...", true, 800, handleDownloadPDF);
  };

  const handleDownloadPDF = async () => {
    const doc = await generatePDFDocument(
      softwareName || "Sin nombre", softwareDescription || "Sin descripción",
      evaluatorName, companyName, allFactors, evaluations, recommendation
    );
    const pdfFileName = `${softwareName || "software"}_analysis.pdf`;
    doc?.save(pdfFileName);

    const localEntry: PDFHistory = {
      id: Date.now().toString(),
      softwareName: softwareName || "Sin nombre",
      softwareDescription: softwareDescription || "Sin descripción",
      evaluatorName, companyName,
      date: new Date().toLocaleDateString(),
      recommendation, factors: [...allFactors],
      evaluations: evaluations.map(e => ({ ...e })),
    };
    setPdfHistory(prev => [localEntry, ...prev]);

    // — Guardar en PostgreSQL (pgAdmin4) vía backend Python —
    // Si el backend o la BD no están disponibles, el análisis igual
    // queda descargado localmente; solo no se guarda el historial en BD.
    try {
      const res = await fetch(`${API_BASE}/evaluaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          softwareName: softwareName || "Sin nombre",
          softwareDescription: softwareDescription || "Sin descripción",
          evaluatorName, companyName,
          recommendation,
          recommendationCode: recommendationToCode(recommendation),
          factors: allFactors.map(f => ({
            name: f.name,
            scope: f.scope,
            subfactors: f.subfactors.map(s => ({ name: s.name, weight: s.weight })),
          })),
          evaluations: evaluations.map(e => ({
            decisorImportance: e.decisorImportance,
            scope: e.scope,
            subfactorWeights: e.subfactorWeights,
            globalWeight: e.globalWeight,
            foda: e.foda || null,
          })),
          pdfFileName,
          pdfSizeBytes: null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPdfHistory(prev =>
          prev.map(h => (h.id === localEntry.id ? { ...h, idEvaluacion: data.id_evaluacion } : h))
        );
      }
    } catch {
      // Sin conexión a la BD: el PDF ya se descargó de todas formas.
    }
  };

  const drawBoldFormattedLine = (doc: jsPDF, text: string, x: number, y: number, fontSize: number) => {
    const parts = text.split("**");
    let currentX = x;
    
    parts.forEach((part, index) => {
      const isBold = index % 2 !== 0;
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.text(part, currentX, y);
      currentX += doc.getTextWidth(part);
    });
  };

  const drawFormattedText = (doc: jsPDF, text: string, startX: number, startY: number, maxWidth: number) => {
    let y = startY;
    const lines = text.split("\n");
    
    for (let line of lines) {
      line = line.trim();
      if (!line) {
        y += 4;
        continue;
      }
      
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      
      // 1. Blockquotes (line starting with >)
      if (line.startsWith(">")) {
        const cleanText = line.substring(1).trim();
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor(60, 64, 67);
        
        const linesWrapped = doc.splitTextToSize(cleanText, maxWidth - 16);
        const boxH = linesWrapped.length * 5.5 + 8;
        
        if (y + boxH > 265) {
          doc.addPage();
          y = 20;
        }
        
        // Background card for blockquote
        doc.setFillColor(243, 244, 246); // bg-gray-100
        doc.roundedRect(startX, y - 4, maxWidth, boxH, 1, 1, "F");
        
        // Accent bar on the left
        doc.setFillColor(139, 92, 246); // purple-500
        doc.rect(startX, y - 4, 2, boxH, "F");
        
        y += 1;
        for (const lw of linesWrapped) {
          if (y > 265) { doc.addPage(); y = 20; }
          drawBoldFormattedLine(doc, lw, startX + 6, y, 9.5);
          y += 5.5;
        }
        y += 3;
        continue;
      }
      
      // 2. Cabeceras (Heading 1, 2, 3)
      if (line.startsWith("#")) {
        const level = (line.match(/^#+/) || [""])[0].length;
        const cleanText = line.replace(/^#+\s*/, "");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(level === 1 ? 13.5 : level === 2 ? 11.5 : 10.5);
        
        if (level === 1) {
          doc.setTextColor(109, 40, 217); // Purple
        } else if (level === 2) {
          doc.setTextColor(30, 64, 175); // Blue
        } else {
          doc.setTextColor(55, 65, 81); // gray-700
        }
        
        const linesWrapped = doc.splitTextToSize(cleanText, maxWidth - 8);
        const headingH = linesWrapped.length * 6 + 4;
        
        if (y + headingH > 265) {
          doc.addPage();
          y = 20;
        }
        
        // Left accent block for Heading 1 and 2
        if (level <= 2) {
          const [hr, hg, hb]: [number, number, number] = level === 1 ? [109, 40, 217] : [30, 64, 175];
          doc.setFillColor(hr, hg, hb);
          doc.rect(startX, y - 4, 3, level === 1 ? 5.5 : 4.5, "F");
        }
        
        for (const lw of linesWrapped) {
          if (y > 265) { doc.addPage(); y = 20; }
          doc.text(lw, startX + (level <= 2 ? 7 : 0), y);
          y += level === 1 ? 6.5 : 5.5;
        }
        y += level === 1 ? 2.5 : 1.5; // Extra space
        continue;
      }
      
      // 3. Viñetas (Bullet points)
      if (line.startsWith("* ") || line.startsWith("- ")) {
        const cleanText = line.substring(2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(55, 65, 81);
        
        // Draw bullet character
        doc.text("•", startX + 3, y);
        
        const linesWrapped = doc.splitTextToSize(cleanText, maxWidth - 8);
        for (const lw of linesWrapped) {
          if (y > 265) { doc.addPage(); y = 20; }
          drawBoldFormattedLine(doc, lw, startX + 9, y, 9.5);
          y += 5.5;
        }
        continue;
      }
      
      // 4. Párrafo normal
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(75, 85, 99); // gray-600
      
      const linesWrapped = doc.splitTextToSize(line, maxWidth);
      for (const lw of linesWrapped) {
        if (y > 265) { doc.addPage(); y = 20; }
        drawBoldFormattedLine(doc, lw, startX, y, 9.5);
        y += 5.5;
      }
    }
    return y;
  };
 
  const handleDownloadPDFReport = async (pdf: AnalyzedPDF) => {
    if (!pdf.recommendation) return;
    
    const doc = new jsPDF();
    const logoDataUrl = await getImageDataUrl(logoImage);
    
    // Top banner/card with soft violet background
    doc.setFillColor(245, 243, 255); // soft violet (violet-50)
    doc.roundedRect(14, 15, 182, 30, 2, 2, "F");
    
    // Violet top accent line on the header card
    doc.setFillColor(139, 92, 246); // violet-500
    doc.rect(14, 15, 182, 1.5, "F");
    
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 20, 19, 22, 22);
    }
    
    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.setTextColor(109, 40, 217); // Purple
    doc.text("GUIOSPRO FLOSS", logoDataUrl ? 48 : 105, 29, { align: logoDataUrl ? "left" : "center" });
    
    doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); // slate-500
    doc.text("Informe de Recomendación de Adopción con IA (Gemini)", logoDataUrl ? 48 : 105, 36, { align: logoDataUrl ? "left" : "center" });
    
    // Metadata card box
    let y = 52;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.roundedRect(14, y, 182, 16, 1.5, 1.5, "FD");
    
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105); // slate-600
    doc.text("ARCHIVO EVALUADO:", 18, y + 10);
    doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42); // slate-900
    doc.text(pdf.name, 56, y + 10);
    
    doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105);
    doc.text("FECHA:", 145, y + 10);
    doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
    doc.text(new Date().toLocaleDateString("es-ES"), 160, y + 10);
    
    y += 26;
    
    // Draw formatted markdown text
    y = drawFormattedText(doc, pdf.recommendation, 14, y, 182);
    
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      
      // Page border line at the top of subsequent pages
      if (i > 1) {
        doc.setDrawColor(241, 245, 249); // slate-100
        doc.setLineWidth(0.3);
        doc.line(14, 12, 196, 12);
        
        doc.setFontSize(7.5); doc.setTextColor(148, 163, 184); // slate-400
        doc.text("GUIOSPRO FLOSS  ·  Recomendación de Adopción IA", 14, 9);
      }
      
      // Footer page numbering
      doc.setFontSize(7.5); doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Página ${i} de ${pages}  ·  Generado por GUIOSPRO FLOSS  ·  ${new Date().toLocaleDateString()}`, 105, 287, { align: "center" });
    }
    
    doc.save(`Gemini_Analysis_${pdf.name}`);
  };



  const handleDownloadHistoryPDF = async (item: PDFHistory) => {
    let full = item;

    // Si el historial vino solo de la BD (resumen), traer el detalle
    // completo (factores/subfactores/evaluación) antes de generar el PDF.
    if (item.loadedFromDb && item.factors.length === 0 && item.idEvaluacion) {
      try {
        const res = await fetch(`${API_BASE}/evaluaciones/${item.idEvaluacion}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        full = {
          ...item,
          softwareDescription: data.softwareDescription || item.softwareDescription,
          factors: data.factors.map((f: any) => ({
            name: f.name,
            suggestedImportance: 2,
            scope: f.scope,
            subfactors: f.subfactors,
          })),
          evaluations: data.evaluations.map((e: any) => ({
            decisorImportance: e.decisorImportance,
            relativeImportance: "",
            isRelevant: true,
            scope: e.scope,
            subfactorWeights: e.subfactorWeights,
            globalWeight: e.globalWeight,
            foda: e.foda || "",
            suggestedImportance: 2,
          })),
        };
      } catch {
        // Si falla, se intenta generar con lo que haya en memoria.
      }
    }

    const doc = await generatePDFDocument(
      full.softwareName, full.softwareDescription,
      full.evaluatorName, full.companyName,
      full.factors, full.evaluations, full.recommendation
    );
    doc?.save(`${full.softwareName}_analysis.pdf`);
  };

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────

  return (
    <div className="size-full overflow-auto bg-gradient-to-br from-blue-50 via-white to-gray-50">

      {/* ── Modal 1: Bienvenida ── */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-8 pt-10 pb-8 text-center">
              <img src={logoImage} alt="GUIOSPRO FLOSS" className="h-24 mx-auto mb-4 drop-shadow-lg" />
              <h1 className="text-3xl font-bold text-white">GUIOSPRO FLOSS</h1>
              <p className="text-blue-100 mt-1 text-sm">Guía para la Adopción de Software de Código Abierto</p>
            </div>
            <div className="px-8 py-7 text-center">
              <h2 className="text-xl font-bold text-gray-800 mb-3">¡Bienvenido al sistema!</h2>
              <p className="text-gray-600 text-sm mb-2 leading-relaxed">
                <strong>GUIOSPRO FLOSS</strong> le permite analizar la viabilidad de adoptar software libre
                en su organización mediante un proceso de 6 pasos estructurado.
              </p>
              <p className="text-gray-500 text-sm leading-relaxed mb-7">
                Evalúe factores clave, obtenga clasificaciones FODA y descargue un informe PDF profesional
                con logo institucional, datos del evaluador y recomendación del sistema.
              </p>
              <button onClick={handleWelcomeContinue} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2">
                Comenzar <ChevronRight size={18} />
              </button>
              <p className="text-xs text-gray-400 mt-4">Versión 2.0 · {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Datos de la evaluación ── */}
      {showSoftwareInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-6 flex items-center gap-4">
              <img src={logoImage} alt="GUIOSPRO FLOSS" className="h-12 drop-shadow" />
              <div>
                <h2 className="text-xl font-bold text-white">Datos de la Evaluación</h2>
                <p className="text-blue-100 text-xs mt-0.5">Complete los campos para comenzar</p>
              </div>
            </div>
            <div className="px-8 py-7 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Nombre del Software <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" value={welcomeName} autoFocus
                  onChange={e => setWelcomeName(e.target.value)}
                  placeholder="Ej: PostgreSQL, WordPress, Linux..."
                  className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Descripción
                </label>
                <input type="text" value={welcomeDesc} onChange={e => setWelcomeDesc(e.target.value)}
                  placeholder="Ej: Sistema de gestión de bases de datos..."
                  className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
              </div>
              <div className="border-t border-gray-100" />
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre del Evaluador</label>
                <input type="text" value={welcomeEvaluator} onChange={e => setWelcomeEvaluator(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Empresa que adopta el Software</label>
                <input type="text" value={welcomeCompany} onChange={e => setWelcomeCompany(e.target.value)}
                  placeholder="Ej: Empresa Tecnológica S.A."
                  className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
              </div>
              <button onClick={handleSoftwareInputContinue} disabled={!welcomeName.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                Continuar al Sistema <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay de carga global ── */}
      {loadingOverlay.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[240px]">
            {loadingOverlay.showLogo && <img src={logoImage} alt="GUIOSPRO FLOSS" className="h-16 mb-1" />}
            <div className="flex items-center gap-3">
              <Loader2 size={28} className="text-blue-600 animate-spin" />
              <span className="text-lg font-semibold text-gray-800">{loadingOverlay.message}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Evaluación incompleta ── */}
      <Dialog.Root open={showIncompleteWarning} onOpenChange={setShowIncompleteWarning}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content aria-describedby="incomplete-desc"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-[calc(100vw-2rem)] max-w-md">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3 bg-amber-100 rounded-xl shrink-0">
                <AlertTriangle size={24} className="text-amber-600" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold text-gray-800">Evaluación incompleta</Dialog.Title>
                <p id="incomplete-desc" className="text-sm text-gray-600 mt-1">
                  Los siguientes factores aún no han sido guardados. Por favor evalúe sus subfactores
                  y haga clic en <strong>Guardar</strong> para cada uno antes de continuar.
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {incompleteFactorsList.map(name => (
                <div key={name} className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-800">{name}</span>
                  <span className="ml-auto text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pendiente</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-all">
                  Volver a evaluar
                </button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <button
                  onClick={() => { setShowIncompleteWarning(false); handleNavigateToTab("tab3"); }}
                  className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm transition-all"
                >
                  Continuar de todos modos
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Dialog: Fuentes y Bases Científicas de la sugerencia IA ── */}
      <Dialog.Root open={showSourcesDialog} onOpenChange={setShowSourcesDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content aria-describedby="sources-desc"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-violet-100 rounded-lg"><BookOpen size={18} className="text-violet-600" /></div>
                <Dialog.Title className="text-lg font-bold text-gray-800">Fuentes Científicas y Justificación</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
              </Dialog.Close>
            </div>
            {softwareName && (
              <p className="text-xs text-violet-600 font-medium mb-3">Sustentación metodológica para la evaluación de: <strong>{softwareName}</strong></p>
            )}
            
            <div id="sources-desc" className="space-y-4">
              {aiJustification && (
                <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl text-sm text-gray-700 leading-relaxed">
                  <h4 className="font-bold text-violet-900 mb-1 text-xs uppercase tracking-wider">Justificación del Modelo:</h4>
                  <p>{aiJustification}</p>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">Referencias Bibliográficas (APA):</h4>
                {aiBibliography.length > 0 ? (
                  aiBibliography.map((bib, index) => (
                    <div key={index} className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                      <p className="text-sm font-semibold text-gray-800">{bib.title} ({bib.year})</p>
                      <p className="text-xs text-gray-600 italic">{bib.author} — {bib.source}</p>
                      <p className="text-xs text-gray-500 bg-white p-2 border border-gray-100 rounded-lg mt-1"><strong className="text-violet-700 font-semibold">Relación con {softwareName}:</strong> {bib.relevance}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 italic">No hay referencias disponibles para esta consulta.</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Dialog.Close asChild>
                <button className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md">
                  Cerrar
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Dialog: Info de factor ── */}
      <Dialog.Root open={showFactorInfoDialog} onOpenChange={setShowFactorInfoDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content aria-describedby="factor-info-desc"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-[calc(100vw-2rem)] max-w-lg">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg"><Info size={18} className="text-blue-600" /></div>
                <Dialog.Title className="text-lg font-bold text-gray-800">{factorInfoTarget?.name}</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
              </Dialog.Close>
            </div>
            {softwareName && (
              <p className="text-xs text-blue-600 font-medium mb-3">Análisis para: <strong>{softwareName}</strong></p>
            )}
            <div id="factor-info-desc" className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-gray-700 leading-relaxed min-h-[80px]">
              {factorInfoLoading
                ? <span className="flex items-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Consultando IA...</span>
                : factorInfoText}
            </div>
            <p className="text-xs text-amber-600 mt-3 font-medium">💡 Vía API_PUNTO_2 → GET /api/factor-info (backend Python)</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Header principal ── */}
      <div className="max-w-7xl mx-auto p-3 sm:p-6">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-6">
              <img src={logoImage} alt="GUIOSPRO FLOSS" className="h-14 sm:h-20 shrink-0" />
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-gray-800">GUIOSPRO FLOSS</h1>
                <p className="text-xs sm:text-base text-gray-600">Guía para la Adopción de Software de Código Abierto</p>
              </div>
            </div>
            <div className="sm:text-right text-xs text-gray-400">
              <p className="font-medium text-gray-500">Versión 2.0</p>
              <p>{new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            {[
              { label: "Nombre del Software", val: softwareName, set: setSoftwareName, ph: "Ej: PostgreSQL..." },
              { label: "Descripción", val: softwareDescription, set: setSoftwareDescription, ph: "Descripción breve..." },
              { label: "Evaluador", val: evaluatorName, set: setEvaluatorName, ph: "Ej: Juan Pérez" },
              { label: "Empresa", val: companyName, set: setCompanyName, ph: "Ej: Empresa S.A." },
            ].map(({ label, val, set, ph }) => (
              <div key={label}>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  className="w-full px-3 py-2 border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm" />
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <Tabs.Root value={currentTab} onValueChange={setCurrentTab} className="w-full flex flex-col md:flex-row gap-4 sm:gap-6 md:items-start">
          <Tabs.List className="flex flex-row md:flex-col bg-white rounded-xl shadow-lg p-2 md:min-w-[220px] md:shrink-0 md:sticky md:top-6 overflow-x-auto gap-1 md:gap-0">
            <div className="hidden md:block px-3 py-2 mb-1 text-xs font-bold text-gray-400 uppercase tracking-widest">Pasos</div>
            {[
              { value: "tab0", label: "Selección de Factores" },
              { value: "tab1", label: "Factores Relevantes" },
              { value: "tab2", label: "Factores Ponderados" },
              { value: "tab3", label: "Evaluación Final" },
            ].map((s, i) => (
              <Tabs.Trigger key={s.value} value={s.value}
                className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 rounded-lg text-sm font-medium text-left transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-blue-50 shrink-0 md:mb-1 whitespace-nowrap">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black/10 data-[state=active]:bg-white/20 text-xs font-bold shrink-0">{i}</span>
                <span>{s.label}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="flex-1 min-w-0">

            {/* ═══ PASO 0: Selección de Factores ═══ */}
            <Tabs.Content value="tab0" className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Selección de Factores a Evaluar</h2>
              <p className="text-gray-500 text-sm mb-6">
                Use el botón para ver todos los factores. La IA puede sugerir los más idóneos para el software ingresado.
              </p>

              <div className="flex flex-wrap gap-3 mb-6">
                <Dialog.Root open={showFactorsDialog} onOpenChange={setShowFactorsDialog}>
                  <Dialog.Trigger asChild>
                    <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md text-sm">
                      <ListChecks size={18} />
                      Ver Factores Disponibles
                      {allFactors.length > 0 && (
                        <span className="px-2 py-0.5 bg-white text-blue-600 rounded-full text-xs font-bold">{allFactors.length}</span>
                      )}
                    </button>
                  </Dialog.Trigger>

                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
                    <Dialog.Content aria-describedby="factors-desc"
                      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] flex flex-col">
                      {/* Cabecera */}
                      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                        <Dialog.Title className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <ListChecks size={20} className="text-blue-600" /> Factores Disponibles
                        </Dialog.Title>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setShowFactorsDialog(false); setShowAddFactorDialog(true); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold">
                            <Plus size={14} /> Añadir Personalizado
                          </button>
                          <Dialog.Close asChild>
                            <button className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                          </Dialog.Close>
                        </div>
                      </div>

                      {/* Cuerpo */}
                      <div id="factors-desc" className="overflow-y-auto flex-1 px-6 pt-5 pb-3">
                        {/* Banner IA */}
                        <div className="mb-5 p-4 bg-gradient-to-r from-violet-50 to-blue-50 border-2 border-violet-200 rounded-2xl">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Sparkles size={18} className="text-violet-600" />
                            <h3 className="font-bold text-gray-800 text-sm">Sugerencia automática con IA</h3>
                          </div>
                          <p className="text-xs text-gray-500 mb-3">
                            La IA analizará <strong>{softwareName || "el software ingresado"}</strong> y seleccionará los factores más idóneos.
                            Vía API_PUNTO_3 → POST /api/suggest-factors
                          </p>
                          {!showAISuggestionPanel && (
                            <button onClick={handleAISuggestFactors}
                              disabled={isLoadingAISuggestion || !softwareName.trim()}
                              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm shadow-md">
                              {isLoadingAISuggestion
                                ? <><Loader2 size={15} className="animate-spin" /> Analizando...</>
                                : <><Sparkles size={15} /> Obtener sugerencia de IA</>}
                            </button>
                          )}
                          {!softwareName.trim() && !isLoadingAISuggestion && (
                            <p className="text-xs text-amber-600 mt-2 font-medium">⚠ Ingrese el nombre del software primero.</p>
                          )}
                          {showAISuggestionPanel && aiFactorSuggestions.length > 0 && (
                            <div className="mt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <p className="text-xs font-semibold text-violet-700">
                                  ✦ {aiFactorSuggestions.length} factores recomendados para <strong>{softwareName}</strong>:
                                </p>
                                <button onClick={() => setShowSourcesDialog(true)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 font-bold rounded-lg text-xs transition-all hover:underline cursor-pointer shadow-sm border border-violet-200">
                                  <BookOpen size={12} className="text-violet-600 shrink-0" /> Fuentes y Bases Científicas
                                </button>
                              </div>
                              <div className="space-y-2 mb-3">
                                {aiFactorSuggestions.map(s => (
                                  <div key={s.factorName} className="flex items-start gap-2 p-2.5 bg-white border border-violet-200 rounded-xl">
                                    <Sparkles size={13} className="text-violet-500 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-sm font-semibold text-gray-800">{s.factorName}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={handleAcceptAISuggestion}
                                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm shadow-md">
                                  <CheckCircle2 size={15} /> Aceptar sugerencia de IA
                                </button>
                                <button onClick={() => { setShowAISuggestionPanel(false); setAiFactorSuggestions([]); }}
                                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium">
                                  Descartar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="text-sm text-gray-500 mb-3">
                          Marque los factores a incluir. Los marcados con ✦ son sugeridos por la IA.
                          ({tempSelectedFactors.length} seleccionado{tempSelectedFactors.length !== 1 ? "s" : ""})
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {DEFAULT_FACTORS.map(factor => {
                            const checked = !!tempSelectedFactors.find(f => f.name === factor.name);
                            const isAI = aiFactorSuggestions.some(s => s.factorName === factor.name);
                            return (
                              <label key={factor.name}
                                className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                                  checked && isAI ? "border-violet-500 bg-violet-50"
                                    : checked ? "border-blue-600 bg-blue-50"
                                    : isAI ? "border-violet-300 bg-violet-50/50 hover:border-violet-500"
                                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                                }`}>
                                <input type="checkbox" checked={checked} onChange={() => handleTempFactorToggle(factor)} className="w-4 h-4 accent-blue-600 shrink-0" />
                                <span className="text-sm font-medium text-gray-800 flex-1">{factor.name}</span>
                                {isAI && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full shrink-0">
                                    <Sparkles size={9} /> IA
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>

                        {customFactors.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-dashed border-gray-200">
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3">Factores Personalizados</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {customFactors.map(f => (
                                <div key={f.name} className="flex items-center gap-3 p-3 border-2 border-green-300 bg-green-50 rounded-xl">
                                  <div className="w-4 h-4 rounded bg-green-500 shrink-0 flex items-center justify-center">
                                    <span className="text-white text-[9px] font-bold">✓</span>
                                  </div>
                                  <span className="text-sm font-medium text-gray-800 flex-1">{f.name}</span>
                                  <span className="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">propio</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Pie */}
                      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between shrink-0 gap-3">
                        <span className="text-sm text-gray-600 font-medium">
                          {tempSelectedFactors.length + customFactors.length} factor{(tempSelectedFactors.length + customFactors.length) !== 1 ? "es" : ""} elegido{(tempSelectedFactors.length + customFactors.length) !== 1 ? "s" : ""}
                        </span>
                        <button onClick={handleConfirmFactorSelection}
                          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                          <CheckCircle2 size={16} /> Confirmar selección
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>

              {/* Factores elegidos */}
              {allFactors.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl">
                  <ListChecks size={36} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 text-sm font-medium">Aún no ha seleccionado factores.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">{allFactors.length}</span>
                    Factores elegidos para la evaluación
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allFactors.map((factor, idx) => {
                      const isCustom = !!customFactors.find(f => f.name === factor.name);
                      return (
                        <div key={factor.name}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border-2 ${isCustom ? "border-green-300 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
                          <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${isCustom ? "bg-green-500 text-white" : "bg-blue-600 text-white"}`}>{idx + 1}</span>
                          <span className="flex-1 text-sm font-semibold text-gray-800 leading-tight">
                            {factor.name}
                            {isCustom && <span className="ml-2 text-[10px] font-normal text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">personalizado</span>}
                          </span>
                          <button onClick={() => handleOpenFactorInfo(factor)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all text-xs font-medium shrink-0">
                            <Info size={13} /> Info
                          </button>
                          <button onClick={() => handleRemoveSelectedFactor(factor.name)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-300 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all text-xs font-medium shrink-0">
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`mt-6 p-4 rounded-xl border-2 ${allFactors.length > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                <p className={`font-semibold text-sm ${allFactors.length > 0 ? "text-blue-900" : "text-gray-500"}`}>
                  Factores seleccionados: {allFactors.length}
                </p>
              </div>

              <button onClick={() => handleNavigateToTab("tab1")} disabled={allFactors.length === 0}
                className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                Continuar al siguiente paso <ChevronRight size={18} />
              </button>
            </Tabs.Content>

            {/* ═══ PASO 1: Factores Relevantes ═══ */}
            <Tabs.Content value="tab1" className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Paso 1 y 2. Obtención de factores relevantes</h2>
              <p className="mb-6 text-gray-600 text-sm">
                Determine qué factores resultan relevantes. Evalúe la importancia para su organización
                y clasifique el alcance (interno o externo).
              </p>
              {allFactors.length === 0 ? (
                <div className="p-8 text-center bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                  <p className="text-yellow-800 font-semibold text-sm">No hay factores. Regrese al Paso 0.</p>
                  <button onClick={() => handleNavigateToTab("tab0")} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm">Ir al Paso 0</button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <div className="min-w-[640px] border-2 border-gray-200 rounded-xl overflow-hidden mx-4 sm:mx-0">
                      <div className="grid grid-cols-7 gap-2 p-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white font-semibold text-xs">
                        <div className="col-span-2">Factor</div>
                        <div>Imp. Sugerida</div>
                        <div>Evaluación</div>
                        <div>Imp. Decisor</div>
                        <div>Imp. Relativa</div>
                        <div>Alcance</div>
                      </div>
                      {allFactors.map((factor, idx) => {
                        const ev = evaluations[idx];
                        if (!ev) return null;
                        return (
                          <div key={idx} className="grid grid-cols-7 gap-2 p-3 border-b border-gray-200 items-center text-xs hover:bg-blue-50">
                            <div className="col-span-2 font-medium text-gray-800">{factor.name}</div>
                            <select value={ev.suggestedImportance} onChange={e => handleSuggestedChange(idx, parseInt(e.target.value))} className="px-1 py-1 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-xs">
                              {IMPORTANCE_LEVELS.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
                            </select>
                            <input type="range" min="1" max="4" step="1" value={ev.decisorImportance} onChange={e => handleDecisorChange(idx, parseInt(e.target.value))} className="w-full accent-blue-600" />
                            <input type="text" value={IMPORTANCE_LEVELS[ev.decisorImportance - 1]} disabled className="px-1 py-1 border border-gray-300 rounded-lg bg-gray-50 text-center font-medium text-xs" />
                            <input type="text" value={ev.relativeImportance} disabled className={`px-1 py-1 border-2 rounded-lg text-center font-semibold text-xs ${ev.isRelevant ? "bg-green-100 border-green-400 text-green-800" : "bg-gray-100 border-gray-300 text-gray-500"}`} />
                            <select value={ev.scope} onChange={e => handleScopeChange(idx, e.target.value as "Interno" | "Externo")} className="px-1 py-1 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-xs">
                              <option value="Interno">Interno</option>
                              <option value="Externo">Externo</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={() => handleNavigateToTab("tab2")} className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold flex items-center justify-center gap-2">
                    Continuar al siguiente paso <ChevronRight size={18} />
                  </button>
                </>
              )}
            </Tabs.Content>

            {/* ═══ PASO 2: Factores Ponderados ═══ */}
            <Tabs.Content value="tab2" className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Paso 3 y 4. Obtención de factores ponderados</h2>
              <p className="mb-6 text-gray-600 text-sm">
                Evalúe los subfactores de cada factor relevante y haga clic en <strong>Guardar</strong> para registrar cada ponderación.
                Todos los factores deben guardarse antes de continuar.
              </p>

              {relevantFactors.length === 0 ? (
                <div className="p-8 text-center bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                  <p className="text-yellow-800 font-semibold text-sm">No hay factores relevantes. Ajuste las importancias en el Paso 1 y 2.</p>
                  <button onClick={() => handleNavigateToTab("tab1")} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm">Ir al Paso 1</button>
                </div>
              ) : (
                <>
                  {/* Indicador de progreso de guardado */}
                  <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Progreso de evaluación:</p>
                    <div className="flex flex-wrap gap-2">
                      {relevantFactors.map((f, i) => {
                        const saved = evaluations[relevantIndices[i]]?.globalWeight > 0;
                        return (
                          <span key={f.name}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                              saved ? "bg-green-100 text-green-700 border border-green-300" : "bg-amber-100 text-amber-700 border border-amber-300"
                            }`}>
                            {saved ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                            {f.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                    <label className="font-semibold text-gray-800 text-sm shrink-0">Seleccione el Factor:</label>
                    <select value={selectedFactorIndex} onChange={e => setSelectedFactorIndex(parseInt(e.target.value))}
                      className="flex-1 min-w-[160px] px-4 py-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none font-medium text-sm">
                      {relevantFactors.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
                    </select>
                    <button onClick={handleSaveSubfactorsWithLoading}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow-md text-sm flex items-center gap-2">
                      <Save size={15} /> Guardar
                    </button>
                  </div>

                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <div className="min-w-[480px] border-2 border-gray-200 rounded-xl overflow-hidden mx-4 sm:mx-0">
                      <div className="grid grid-cols-5 gap-3 p-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white font-semibold text-xs">
                        <div className="col-span-3">Subfactor</div>
                        <div>Evaluación</div>
                        <div>Resultado</div>
                      </div>
                      {relevantIndices[selectedFactorIndex] !== undefined &&
                        allFactors[relevantIndices[selectedFactorIndex]]?.subfactors?.map((sub, si) => {
                          const ev = evaluations[relevantIndices[selectedFactorIndex]];
                          if (!ev || !ev.subfactorWeights) return null;
                          const weightVal = ev.subfactorWeights[si] || 1;
                          return (
                            <div key={si} className="grid grid-cols-5 gap-3 p-3 border-b border-gray-200 items-center text-xs hover:bg-blue-50">
                              <div className="col-span-3 font-medium text-gray-800">{sub.name}</div>
                              <input type="range" min="1" max="4" step="1" value={weightVal}
                                onChange={e => handleSubfactorChange(relevantIndices[selectedFactorIndex], si, parseInt(e.target.value))}
                                className="w-full accent-blue-600" />
                              <input type="text" value={SUB_IMPORTANCE_LEVELS[weightVal - 1] || ""} disabled
                                className="px-2 py-1 border-2 border-gray-300 rounded-lg bg-gray-50 text-center font-medium text-xs" />
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Botón continuar con validación */}
                  <button onClick={handleContinueFromTab2}
                    className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold flex items-center justify-center gap-2">
                    Continuar al siguiente paso <ChevronRight size={18} />
                  </button>
                </>
              )}
            </Tabs.Content>

            {/* ═══ PASO 3: Evaluación Final ═══ */}
            <Tabs.Content value="tab3" className="space-y-4 sm:space-y-6">
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">Paso 5 y 6. Evaluación y recomendación</h2>
                <p className="mb-6 text-gray-600 text-sm">Clasificación FODA de cada factor según importancia global y alcance.</p>

                {allFactors.length === 0 ? (
                  <div className="p-8 text-center bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                    <p className="text-yellow-800 font-semibold text-sm">No hay factores. Regrese al Paso 0.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto -mx-4 sm:mx-0 mb-6">
                      <div className="min-w-[480px] border-2 border-gray-200 rounded-xl overflow-hidden mx-4 sm:mx-0">
                        <div className="grid grid-cols-5 gap-3 p-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white font-semibold text-xs">
                          <div className="col-span-2">Factor</div>
                          <div>Ponderación</div>
                          <div>Alcance</div>
                          <div>FODA</div>
                        </div>
                        {allFactors.map((factor, idx) => {
                          const ev = evaluations[idx];
                          if (!ev) return null;
                          return (
                            <div key={idx} className="grid grid-cols-5 gap-3 p-3 border-b border-gray-200 items-center text-xs hover:bg-blue-50">
                              <div className="col-span-2 font-medium text-gray-800">{factor.name}</div>
                              <input type="text" value={ev.globalWeight > 0 ? ev.globalWeight.toFixed(1) : ""} disabled className="px-2 py-1 border border-gray-300 rounded-lg bg-gray-50 text-center font-semibold text-xs" />
                              <input type="text" value={ev.globalWeight > 0 ? ev.scope : ""} disabled className="px-2 py-1 border border-gray-300 rounded-lg bg-gray-50 text-center text-xs" />
                              <input type="text" value={ev.foda || (ev.isRelevant && ev.globalWeight === 0 ? "Sin evaluar" : "")} disabled
                                className="px-2 py-1 border-2 rounded-lg text-center font-semibold text-xs"
                                style={{
                                  backgroundColor: ev.foda ? (ev.foda === "Fortaleza" || ev.foda === "Oportunidad" ? "#9d9" : "#ff9ec0") : "#fff",
                                  borderColor: ev.foda ? (ev.foda === "Fortaleza" || ev.foda === "Oportunidad" ? "#4ade80" : "#f87171") : "#d1d5db",
                                }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button onClick={computeRecommendation} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-md">
                        🔍 Ver Recomendación
                      </button>
                      <button onClick={handleDownloadPDF} disabled={allFactors.length === 0}
                        className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold shadow-md disabled:bg-gray-300 flex items-center justify-center gap-2">
                        <Download size={18} /> Descargar PDF
                      </button>
                    </div>

                    {recommendation && (
                      <div className="mt-6 p-5 rounded-xl border-2 shadow-lg"
                        style={{
                          backgroundColor: recommendationStyle,
                          borderColor: recommendationStyle === "#9d9" ? "#4ade80" : recommendationStyle === "#ff9ec0" ? "#f87171" : "#fbbf24",
                        }}>
                        <h3 className="font-bold text-base mb-2 text-gray-900">Recomendación del Sistema:</h3>
                        <p className="text-gray-900 font-medium leading-relaxed text-sm">{recommendation}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 pt-6 border-t border-gray-200">
                      <button onClick={handleSaveHistoryWithLoading} disabled={allFactors.length === 0}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold shadow-md disabled:bg-gray-300 flex items-center justify-center gap-2 transition-all">
                        <Save size={18} /> Guardar Historial
                      </button>
                      <button onClick={handleResetAndReevaluate}
                        className="px-6 py-3 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-semibold shadow-md flex items-center justify-center gap-2 transition-all">
                        <RotateCcw size={18} /> Volver a evaluar
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Historial */}
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <Dialog.Root>
                  <Dialog.Trigger asChild>
                    <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-md">
                      <FileText size={18} /> Ver Historial
                      {pdfHistory.length > 0 && <span className="px-2 py-0.5 bg-white text-blue-600 rounded-full text-xs font-bold">{pdfHistory.length}</span>}
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
                    <Dialog.Content aria-describedby={undefined}
                      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] flex flex-col">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                        <Dialog.Title className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <FileText size={20} className="text-blue-600" /> Historial de Análisis
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                        </Dialog.Close>
                      </div>
                      <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                        {pdfHistory.length === 0 ? (
                          <div className="py-12 text-center">
                            <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">No hay análisis previos guardados.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {pdfHistory.map((item, i) => (
                              <div key={item.id} className="flex items-center gap-3 p-3 bg-blue-50 border-2 border-blue-100 rounded-xl hover:border-blue-300 transition-all">
                                <div className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-lg shrink-0 font-bold text-sm">{i + 1}</div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-800 truncate text-sm">{item.softwareName}</h4>
                                  <p className="text-xs text-gray-500 mt-0.5">{item.date}{item.evaluatorName && ` · ${item.evaluatorName}`}{item.companyName && ` · ${item.companyName}`}</p>
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-1">{item.recommendation.substring(0, 60)}...</p>
                                </div>
                                <button onClick={() => handleDownloadHistoryPDF(item)} className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-xs font-medium">
                                  <Download size={14} /> PDF
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>

              {/* ── API_PUNTO_4: Análisis de PDF con IA ── */}
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <Sparkles size={22} className="text-violet-600" />
                  Análisis de Evaluación con IA
                </h3>
                <p className="text-gray-600 mb-4 text-sm">
                  Suba uno o más archivos <strong>PDF</strong> de evaluaciones previas.
                  La IA de Google Gemini analizará el contenido del documento y generará una recomendación de adopción detallada para cada uno.
                </p>

                <div className="space-y-4">
                  <input ref={fileInputRef} type="file" accept=".pdf" multiple
                    onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full px-6 py-4 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-xl hover:from-violet-700 hover:to-blue-700 font-semibold shadow-lg transition-all flex items-center justify-center gap-3 text-sm sm:text-base">
                    <Upload size={20} />
                    Subir PDF para análisis con IA
                  </button>
                  
                  <p className="text-xs text-gray-400 text-center">
                    Formatos aceptados: PDF · Analizado con la API de Google Gemini (Google AI Studio)
                  </p>

                  {analyzedPDFs.length > 0 && (
                    <div className="space-y-2 mt-6">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Archivos Analizados con IA:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {analyzedPDFs.map((pdf) => (
                          <div key={pdf.id} className="flex items-center justify-between p-3 bg-violet-50/50 border-2 border-violet-100 rounded-xl hover:border-violet-300 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 bg-violet-100 rounded-lg text-violet-700 shrink-0">
                                <FileText size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-xs truncate">{pdf.name}</p>
                                {pdf.loading ? (
                                  <span className="text-[10px] text-violet-600 font-medium flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> Analizando con IA...
                                  </span>
                                ) : pdf.error ? (
                                  <span className="text-[10px] text-red-500 font-medium">⚠ Fallido</span>
                                ) : (
                                  <span className="text-[10px] text-green-600 font-medium">✓ Analizado</span>
                                )}
                              </div>
                            </div>
                            
                            {!pdf.loading && !pdf.error && (
                              <button onClick={() => { setActivePDFReport(pdf); setShowPDFReportDialog(true); }}
                                className="shrink-0 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-semibold text-xs transition-all shadow-sm">
                                🔍 Ver Informe
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Tabs.Content>

          </div>
        </Tabs.Root>
      </div>

      {/* ── Dialog: Añadir Factor Personalizado ── */}
      <Dialog.Root open={showAddFactorDialog} onOpenChange={setShowAddFactorDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-auto">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><Plus size={18} className="text-green-600" /></div>
                <Dialog.Title className="text-xl font-bold text-gray-800">Añadiendo Nuevo Factor</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </Dialog.Close>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Factor</label>
                <input type="text" value={newFactorName} onChange={e => setNewFactorName(e.target.value)}
                  placeholder="Ej: Integración con sistemas legados"
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Subfactores</label>
                {newFactorSubfactors.map((sub, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" value={sub} onChange={e => { const s = [...newFactorSubfactors]; s[idx] = e.target.value; setNewFactorSubfactors(s); }}
                      placeholder={`Subfactor ${idx + 1}`}
                      className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none" />
                    {newFactorSubfactors.length > 1 && (
                      <button onClick={() => setNewFactorSubfactors(prev => prev.filter((_, i) => i !== idx))}
                        className="px-3 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setNewFactorSubfactors(prev => [...prev, ""])}
                  className="mt-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm">
                  + Añadir Subfactor
                </button>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleAddCustomFactor}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold">
                  Guardar Factor
                </button>
                <Dialog.Close asChild>
                  <button className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300">Cancelar</button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Dialog: Informe de Análisis IA de PDF ── */}
      <Dialog.Root open={showPDFReportDialog} onOpenChange={setShowPDFReportDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content aria-describedby="pdf-report-desc"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-6 w-[calc(100vw-2rem)] max-w-3xl flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-violet-100 rounded-xl text-violet-700">
                  <Sparkles size={20} />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-bold text-gray-800">Recomendación IA del Sistema</Dialog.Title>
                  <p className="text-xs text-gray-500 mt-0.5">Archivo analizado: <strong className="text-violet-600">{activePDFReport?.name}</strong></p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-all"><X size={18} /></button>
              </Dialog.Close>
            </div>
            
            {/* Body */}
            <div id="pdf-report-desc" className="overflow-y-auto flex-1 py-5 pr-1 text-sm text-gray-700 leading-relaxed font-normal whitespace-pre-wrap">
              {activePDFReport?.recommendation}
            </div>
            
            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3 shrink-0">
              <button onClick={() => activePDFReport && handleDownloadPDFReport(activePDFReport)}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-all">
                <Download size={16} /> Descargar Informe (PDF)
              </button>
              <Dialog.Close asChild>
                <button className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-all">
                  Cerrar
                </button>
              </Dialog.Close>
            </div>
            
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
