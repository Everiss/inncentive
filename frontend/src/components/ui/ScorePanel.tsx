/**
 * ScorePanel.tsx
 * Shared extraction quality panel — used in FormsList (split-view review)
 * and TabForms (company extraction history).
 *
 * Displays: overall score %, band badge (HIGH/MEDIUM/LOW), mini-bars for
 * completeness / confidence / cross-validation, missing field tags, and
 * a collapsible CV-failure list.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export interface ExtractionScore {
  score_pct: number;
  score_band: 'HIGH' | 'MEDIUM' | 'LOW';
  completeness: number;
  confidence: number;
  cross_validation: number;
  missing_mandatory: string[];
  cv_results: Record<string, boolean | null>;
  needs_ai: boolean;
  ai_priority_fields: string[];
  profile: string;
}

const BAND_CONFIG = {
  HIGH: {
    label: 'Alta',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  MEDIUM: {
    label: 'Média',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  LOW: {
    label: 'Baixa',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    bar: 'bg-red-500',
  },
} as const;

const CV_LABELS: Record<string, string> = {
  'CV-01': 'CNPJ válido',
  'CV-02': 'Ano fiscal',
  'CV-03': 'Recibo completo',
  'CV-04': 'Despesas presentes',
  'CV-05': 'Qtd. projetos',
  'CV-06': 'Total financeiro',
  'CV-07': 'Cód. autenticidade',
  'CV-08': 'RH presente',
  'CV-09': 'Categoria válida',
};

function MiniBar({ value, barClass }: { value: number; barClass: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-slate-500 w-7 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

interface ScorePanelProps {
  score: ExtractionScore;
  detectedFamily?: string | null;
  /** When true, renders a compact single-row version (for pending banner rows) */
  compact?: boolean;
}

export function ScorePanel({ score, detectedFamily, compact = false }: ScorePanelProps) {
  const cfg = BAND_CONFIG[score.score_band] ?? BAND_CONFIG.LOW;
  const failedCVs = Object.entries(score.cv_results).filter(([, v]) => v === false);
  const [showCV, setShowCV] = useState(false);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${cfg.bg} ${cfg.border} ${cfg.text}`}
      >
        {score.score_pct.toFixed(0)}% · {cfg.label}
        {score.needs_ai && <Sparkles className="w-2.5 h-2.5" />}
      </span>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${cfg.bg} ${cfg.border}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-bold ${cfg.text}`}>Qualidade da Extração</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {score.profile && <span className="font-mono">{score.profile}</span>}
            {detectedFamily && score.profile !== detectedFamily && (
              <>
                {' '}· <span className="font-mono">{detectedFamily}</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-3xl font-black ${cfg.text}`}>
            {score.score_pct.toFixed(0)}
            <span className="text-base font-semibold">%</span>
          </p>
          <span
            className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${cfg.text} ${cfg.bg} border ${cfg.border}`}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Metric bars */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: 'Completude', value: score.completeness, barClass: cfg.bar },
          { label: 'Confiança', value: score.confidence, barClass: cfg.bar },
          { label: 'Validações', value: score.cross_validation, barClass: cfg.bar },
        ].map(({ label, value, barClass }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-slate-500 font-medium">{label}</span>
            <MiniBar value={value} barClass={barClass} />
          </div>
        ))}
      </div>

      {/* Missing mandatory fields */}
      {score.missing_mandatory.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1.5">Campos obrigatórios ausentes</p>
          <div className="flex flex-wrap gap-1.5">
            {score.ai_priority_fields.slice(0, 8).map((f) => (
              <span
                key={f}
                className="px-2 py-0.5 rounded-lg bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-400"
              >
                {f}
              </span>
            ))}
            {score.ai_priority_fields.length > 8 && (
              <span className="text-[10px] text-slate-400">
                +{score.ai_priority_fields.length - 8}
              </span>
            )}
          </div>
        </div>
      )}

      {/* CV failures (collapsible) */}
      {failedCVs.length > 0 && (
        <div>
          <button
            onClick={() => setShowCV((v) => !v)}
            className={`text-xs font-semibold flex items-center gap-1 ${cfg.text}`}
          >
            {showCV ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {failedCVs.length} validação{failedCVs.length > 1 ? 'ões' : ''} falharam
          </button>
          {showCV && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {failedCVs.map(([k]) => (
                <span
                  key={k}
                  className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-[10px] font-semibold text-red-700 dark:text-red-400"
                >
                  {CV_LABELS[k] ?? k}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {score.needs_ai && (
        <p className={`text-xs font-semibold flex items-center gap-1 ${cfg.text}`}>
          <Sparkles className="w-3 h-3" />
          IA recomendada para completar os campos faltantes
        </p>
      )}
    </div>
  );
}
