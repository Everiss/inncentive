import { useEffect, useState } from 'react';
import api from '../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Plus, ChevronRight, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────

type IncentiveType = 'LEI_DO_BEM' | 'LEI_DA_INFORMATICA' | 'ROTA_2030';
type ProgramStatus = 'RASCUNHO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'FINALIZADO' | 'SUBMETIDO';
type StageStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'NAO_APLICAVEL';

interface Stage {
  id: number;
  status: StageStatus;
  title: string | null;
  stage_type: string;
}

interface Program {
  id: number;
  incentive_type: IncentiveType;
  base_year: number;
  status: ProgramStatus;
  title: string | null;
  notes: string | null;
  created_at: string;
  stages: Stage[];
  _count?: { documents: number; rdi_projects: number };
}

// ── Labels / colors ────────────────────────────────────────────────────────

const INCENTIVE_LABELS: Record<IncentiveType, string> = {
  LEI_DO_BEM: 'Lei do Bem',
  LEI_DA_INFORMATICA: 'Lei da Informática',
  ROTA_2030: 'Rota 2030',
};

const INCENTIVE_COLORS: Record<IncentiveType, string> = {
  LEI_DO_BEM: 'bg-blue-100 text-blue-700 border-blue-200',
  LEI_DA_INFORMATICA: 'bg-violet-100 text-violet-700 border-violet-200',
  ROTA_2030: 'bg-teal-100 text-teal-700 border-teal-200',
};

const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_ANDAMENTO: 'Em andamento',
  EM_REVISAO: 'Em revisão',
  FINALIZADO: 'Finalizado',
  SUBMETIDO: 'Submetido',
};

const PROGRAM_STATUS_COLORS: Record<ProgramStatus, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  EM_REVISAO: 'bg-amber-100 text-amber-700',
  FINALIZADO: 'bg-green-100 text-green-700',
  SUBMETIDO: 'bg-emerald-100 text-emerald-700',
};

// ── Helpers ────────────────────────────────────────────────────────────────

const INCENTIVE_ABBREV: Record<IncentiveType, string> = {
  LEI_DO_BEM:         'LDB',
  LEI_DA_INFORMATICA: 'LDI',
  ROTA_2030:          'R2030',
};

function buildProgramTitle(incentiveType: IncentiveType, baseYear: number, companyName: string): string {
  const abbrev = INCENTIVE_ABBREV[incentiveType];
  const normalized = companyName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${abbrev}_${baseYear}_${normalized}`;
}

function stageProgress(stages: Stage[]) {
  const active = stages.filter((s) => s.status !== 'NAO_APLICAVEL');
  const done   = active.filter((s) => s.status === 'CONCLUIDO');
  return { done: done.length, total: active.length };
}

// ── Create Modal ───────────────────────────────────────────────────────────

function CreateModal({
  companyId,
  companyName,
  onCreated,
  onClose,
}: {
  companyId: number;
  companyName: string;
  onCreated: (id: number) => void;
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [incentiveType, setIncentiveType] = useState<IncentiveType>('LEI_DO_BEM');
  const [baseYear, setBaseYear] = useState(currentYear - 1);
  const [saving, setSaving] = useState(false);

  const preview = buildProgramTitle(incentiveType, baseYear, companyName);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const r = await api.post('/programs', { companyId, incentiveType, baseYear });
      toast.success('Programa criado');
      onCreated(r.data.id);
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Erro ao criar programa';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Novo Programa</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Incentive type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Produto de Incentivo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(INCENTIVE_LABELS) as IncentiveType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setIncentiveType(t)}
                  className={`px-2 py-2 text-xs font-medium rounded-xl border transition-all text-center ${
                    incentiveType === t
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  {INCENTIVE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Base year */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Ano-base
            </label>
            <div className="flex gap-2 flex-wrap">
              {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                <button
                  key={y}
                  onClick={() => setBaseYear(y)}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
                    baseYear === y
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  {y}
                </button>
              ))}
              <input
                type="number"
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                className="w-24 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                placeholder="Outro"
              />
            </div>
          </div>

          {/* Auto-generated name preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Identificador do Programa
            </label>
            <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-700 dark:text-slate-200 break-all">
              {preview}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Gerado automaticamente: Produto · Ano-base · Empresa
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar Programa
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── ProgramsList ───────────────────────────────────────────────────────────

export default function ProgramsList({
  companyId,
  companyName,
  onOpenProgram,
}: {
  companyId: number;
  companyName: string;
  onOpenProgram: (id: number) => void;
}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const r = await api.get('/programs', { params: { companyId } });
      setPrograms(r.data);
    } catch {
      toast.error('Erro ao carregar programas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      {showCreate && (
        <CreateModal
          companyId={companyId}
          companyName={companyName}
          onCreated={(id) => { load(); onOpenProgram(id); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Programas de Incentivo</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Ciclos operacionais que antecedem a obrigação fiscal
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Programa
          </button>
        </div>

        {programs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-500/15 rounded-2xl flex items-center justify-center mb-4">
              <Target className="w-7 h-7 text-blue-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-medium mb-1">Nenhum programa cadastrado</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-4 max-w-xs">
              Crie um programa para organizar o ciclo de trabalho de cada incentivo fiscal.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Criar primeiro programa
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {programs.map((p) => {
                const { done, total } = stageProgress(p.stages ?? []);
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => onOpenProgram(p.id)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${INCENTIVE_COLORS[p.incentive_type]}`}>
                            {INCENTIVE_LABELS[p.incentive_type]}
                          </span>
                          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{p.base_year}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PROGRAM_STATUS_COLORS[p.status]}`}>
                            {PROGRAM_STATUS_LABELS[p.status]}
                          </span>
                        </div>
                        {/* Title */}
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate font-mono">
                          {p.title ?? `${INCENTIVE_LABELS[p.incentive_type]} ${p.base_year}`}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors mt-0.5" />
                    </div>

                    {/* Stage pills */}
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {(p.stages ?? []).map((s) => (
                        <div
                          key={s.id}
                          title={s.title ?? s.stage_type}
                          className={`w-5 h-2 rounded-full ${
                            s.status === 'CONCLUIDO'     ? 'bg-green-400'  :
                            s.status === 'EM_ANDAMENTO'  ? 'bg-blue-400'   :
                            s.status === 'NAO_APLICAVEL' ? 'bg-slate-200 dark:bg-slate-700' :
                                                           'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                        {done}/{total} etapas
                      </span>
                      {p._count && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          · {p._count.rdi_projects} proj · {p._count.documents} docs
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  );
}
