import { useEffect, useState } from 'react';
import api from '../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ClipboardList,
  Briefcase,
  DollarSign,
  FileText,
  Target,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  Circle,
  Minus,
  Building2,
  Calendar,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProgramTabResumo from './program/ProgramTabResumo';
import ProgramTabEtapas from './program/ProgramTabEtapas';
import ProgramTabTecnica from './program/ProgramTabTecnica';
import ProgramTabEconomica from './program/ProgramTabEconomica';
import ProgramTabDocumentos from './program/ProgramTabDocumentos';

// ── Types ────────────────────────────────────────────────────────────────────

export type StageType =
  | 'COLETA_DADOS'
  | 'ANALISE_ELEGIBILIDADE'
  | 'DEFINICAO_ESTRATEGIA'
  | 'CALCULO_AGRUPAMENTO'
  | 'ENTREGAVEIS_INICIAIS'
  | 'AUDITORIA_VALIDACAO'
  | 'EVIDENCIAS_FISCAIS'
  | 'ELABORACAO_OBRIGACAO';

export type StageStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'NAO_APLICAVEL';
export type IncentiveType = 'LEI_DO_BEM' | 'LEI_DA_INFORMATICA' | 'ROTA_2030';
export type ProgramStatus = 'RASCUNHO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'FINALIZADO' | 'SUBMETIDO';

export interface Stage {
  id: number;
  stage_type: StageType;
  title: string | null;
  status: StageStatus;
  notes: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  contacts?: { id: number; name: string } | null;
}

export interface ProgramSummary {
  id: number;
  company_id: number;
  incentive_type: IncentiveType;
  base_year: number;
  status: ProgramStatus;
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  stages: Stage[];
  companies: { id: number; cnpj: string; legal_name: string; trade_name: string | null };
  contacts: { id: number; name: string } | null;
  formpd_forms: { id: number; base_year: number; status: string; submission_status: string | null } | null;
  stats: {
    projects: number;
    documents: number;
    collaborators: number;
    expenses: number;
    completedStages: number;
    totalStages: number;
    progressPct: number;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

type ProgramTab = 'resumo' | 'etapas' | 'tecnica' | 'economica' | 'documentos';

const TABS: { key: ProgramTab; label: string; icon: any }[] = [
  { key: 'resumo',     label: 'Resumo',      icon: ClipboardList },
  { key: 'etapas',     label: 'Etapas',      icon: Target },
  { key: 'tecnica',    label: 'Técnica',     icon: Briefcase },
  { key: 'economica',  label: 'Econômica',   icon: DollarSign },
  { key: 'documentos', label: 'Documentos',  icon: FileText },
];

export const INCENTIVE_LABELS: Record<IncentiveType, string> = {
  LEI_DO_BEM: 'Lei do Bem',
  LEI_DA_INFORMATICA: 'Lei da Informática',
  ROTA_2030: 'Rota 2030',
};

export const INCENTIVE_COLORS: Record<IncentiveType, string> = {
  LEI_DO_BEM: 'bg-blue-100 text-blue-700 border-blue-200',
  LEI_DA_INFORMATICA: 'bg-violet-100 text-violet-700 border-violet-200',
  ROTA_2030: 'bg-teal-100 text-teal-700 border-teal-200',
};

export const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_ANDAMENTO: 'Em andamento',
  EM_REVISAO: 'Em revisão',
  FINALIZADO: 'Finalizado',
  SUBMETIDO: 'Submetido',
};

export const PROGRAM_STATUS_COLORS: Record<ProgramStatus, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  EM_REVISAO: 'bg-amber-100 text-amber-700',
  FINALIZADO: 'bg-green-100 text-green-700',
  SUBMETIDO: 'bg-emerald-100 text-emerald-700',
};

export const STAGE_STATUS_COLORS: Record<StageStatus, string> = {
  PENDENTE: 'text-slate-400',
  EM_ANDAMENTO: 'text-blue-500',
  CONCLUIDO: 'text-green-500',
  NAO_APLICAVEL: 'text-slate-300 dark:text-slate-600',
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  NAO_APLICAVEL: 'N/A',
};

export function StageIcon({ status, className }: { status: StageStatus; className?: string }) {
  const cls = `w-5 h-5 flex-shrink-0 ${STAGE_STATUS_COLORS[status]} ${className ?? ''}`;
  if (status === 'CONCLUIDO') return <CheckCircle2 className={cls} />;
  if (status === 'EM_ANDAMENTO') return <Clock className={cls} />;
  if (status === 'NAO_APLICAVEL') return <Minus className={cls} />;
  return <Circle className={cls} />;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProgramDetail({
  programId,
  onBack,
}: {
  programId: number;
  onBack: () => void;
}) {
  const [program, setProgram] = useState<ProgramSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProgramTab>('resumo');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await api.get(`/programs/${programId}/summary`);
      setProgram(r.data);
    } catch {
      toast.error('Erro ao carregar programa');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [programId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!program) return null;

  const { stats } = program;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Programas
        </button>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate font-mono">
          {program.title}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Program header card ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 mb-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${INCENTIVE_COLORS[program.incentive_type]}`}>
                {INCENTIVE_LABELS[program.incentive_type]}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PROGRAM_STATUS_COLORS[program.status]}`}>
                {PROGRAM_STATUS_LABELS[program.status]}
              </span>
              {program.formpd_forms && (
                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  FORMp&D #{program.formpd_forms.id}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 font-mono tracking-tight">
              {program.title}
            </h1>
            <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {program.companies.legal_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Ano-base {program.base_year}
              </span>
              {program.contacts && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {program.contacts.name}
                </span>
              )}
            </div>
          </div>

          {/* KPI mini grid */}
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">
            {[
              { label: 'Projetos',      value: stats.projects      },
              { label: 'Colaboradores', value: stats.collaborators  },
              { label: 'Despesas',      value: stats.expenses       },
              { label: 'Documentos',    value: stats.documents      },
              { label: 'Etapas',        value: `${stats.completedStages}/${stats.totalStages}` },
              { label: 'Progresso',     value: `${stats.progressPct}%` },
            ].map((kpi) => (
              <div key={kpi.label} className="text-center px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{kpi.value}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Progresso das etapas operacionais</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{stats.progressPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${stats.progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-700 pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all rounded-t-lg border-b-2 -mb-px ${
                active
                  ? 'text-blue-600 border-blue-600 bg-blue-50/50 dark:bg-blue-500/10'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === 'resumo'     && <ProgramTabResumo program={program} onRefresh={() => load(true)} />}
            {activeTab === 'etapas'     && <ProgramTabEtapas program={program} onRefresh={() => load(true)} />}
            {activeTab === 'tecnica'    && <ProgramTabTecnica programId={programId} baseYear={program.base_year} companyId={program.company_id} />}
            {activeTab === 'economica'  && <ProgramTabEconomica programId={programId} baseYear={program.base_year} formdpdFormId={program.formpd_forms?.id} />}
            {activeTab === 'documentos' && <ProgramTabDocumentos programId={programId} onRefresh={() => load(true)} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
