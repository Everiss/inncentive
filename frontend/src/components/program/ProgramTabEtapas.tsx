import { useState } from 'react';
import api from '../../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  CalendarDays,
  StickyNote,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ProgramSummary, Stage, StageStatus } from '../ProgramDetail';
import {
  StageIcon,
  STAGE_STATUS_LABELS,
} from '../ProgramDetail';

interface Props {
  program: ProgramSummary;
  onRefresh: () => void;
}

const STAGE_DESCRIPTIONS: Record<string, string> = {
  COLETA_DADOS: 'Coleta e organização dos dados técnicos e econômicos necessários para o programa.',
  ANALISE_ELEGIBILIDADE: 'Análise dos projetos e atividades para verificar elegibilidade perante a legislação de incentivo.',
  DEFINICAO_ESTRATEGIA: 'Definição da estratégia de enquadramento, alocação de despesas e apuração do benefício.',
  CALCULO_AGRUPAMENTO: 'Cálculo dos dispêndios, agrupamento por categorias e reconciliação com a escrita contábil.',
  ENTREGAVEIS_INICIAIS: 'Elaboração dos entregáveis iniciais: balancete analítico, relatórios por linha de pesquisa.',
  AUDITORIA_VALIDACAO: 'Auditoria interna, revisão da escrita técnica, validação cruzada das evidências.',
  EVIDENCIAS_FISCAIS: 'Consolidação das evidências fiscais: ECF, ECD, DIRBI, SPED, notas fiscais.',
  ELABORACAO_OBRIGACAO: 'Elaboração e revisão da obrigação acessória (FORMp&D, DIPJ, etc.) antes da submissão.',
};

const STATUS_CYCLE: StageStatus[] = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'NAO_APLICAVEL'];

function StageCard({
  stage,
  programId,
  onUpdated,
}: {
  stage: Stage;
  programId: number;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: stage.status,
    notes: stage.notes ?? '',
    dueDate: stage.due_date ? stage.due_date.slice(0, 10) : '',
  });

  const hasChanges =
    form.status !== stage.status ||
    form.notes !== (stage.notes ?? '') ||
    form.dueDate !== (stage.due_date ? stage.due_date.slice(0, 10) : '');

  const cycleStatus = async () => {
    const idx = STATUS_CYCLE.indexOf(form.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setForm((f) => ({ ...f, status: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/programs/${programId}/stages/${stage.stage_type}`, {
        status: form.status,
        notes: form.notes || null,
        dueDate: form.dueDate || null,
      });
      toast.success('Etapa atualizada');
      onUpdated();
    } catch {
      toast.error('Erro ao salvar etapa');
    } finally {
      setSaving(false);
    }
  };

  const isNA = form.status === 'NAO_APLICAVEL';

  const borderColor =
    form.status === 'CONCLUIDO'    ? 'border-green-200 dark:border-green-500/30' :
    form.status === 'EM_ANDAMENTO' ? 'border-blue-200 dark:border-blue-500/30'   :
                                     'border-slate-200 dark:border-slate-700';

  return (
    <div className={`bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden transition-all ${isNA ? 'opacity-50' : ''} ${borderColor}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Step number */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2 ${
            form.status === 'CONCLUIDO'
              ? 'bg-green-500 border-green-500 text-white'
              : form.status === 'EM_ANDAMENTO'
              ? 'bg-blue-500 border-blue-500 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
          }`}
        >
          {stage.sort_order + 1}
        </div>

        {/* Title & status */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isNA ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
            {stage.title ?? stage.stage_type}
          </p>
          {stage.due_date && (
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
              <CalendarDays className="w-3 h-3" />
              Prazo: {new Date(stage.due_date).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        {/* Status badge (click to cycle) */}
        <button
          onClick={cycleStatus}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80 ${
            form.status === 'CONCLUIDO'    ? 'bg-green-100 text-green-700' :
            form.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-700'  :
            form.status === 'NAO_APLICAVEL' ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' :
            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
          title="Clique para avançar o status"
        >
          <StageIcon status={form.status} className="w-3.5 h-3.5" />
          {STAGE_STATUS_LABELS[form.status]}
        </button>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-4">
              {/* Description */}
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
                {STAGE_DESCRIPTIONS[stage.stage_type] ?? '—'}
              </p>

              {/* Status selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_CYCLE.map((s) => (
                    <button
                      key={s}
                      onClick={() => setForm((f) => ({ ...f, status: s }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        form.status === s
                          ? s === 'CONCLUIDO'    ? 'bg-green-500 text-white border-green-500'
                          : s === 'EM_ANDAMENTO' ? 'bg-blue-500 text-white border-blue-500'
                          : s === 'NAO_APLICAVEL' ? 'bg-slate-500 text-white border-slate-500'
                          : 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <StageIcon status={s} className="w-3.5 h-3.5" />
                      {STAGE_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> Prazo
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <StickyNote className="w-3.5 h-3.5" /> Anotações
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Registre observações, impedimentos, decisões..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              {/* Completion info */}
              {stage.completed_at && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Concluída em {new Date(stage.completed_at).toLocaleDateString('pt-BR')}
                </p>
              )}

              {/* Save */}
              {hasChanges && (
                <div className="flex justify-end">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar alterações
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProgramTabEtapas({ program, onRefresh }: Props) {
  const done = program.stages.filter((s) => s.status === 'CONCLUIDO').length;
  const total = program.stages.filter((s) => s.status !== 'NAO_APLICAVEL').length;

  return (
    <div className="space-y-3 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Etapas Operacionais</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {done} de {total} concluídas · Clique em uma etapa para expandir e editar
          </p>
        </div>
        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {total > 0 ? Math.round((done / total) * 100) : 0}%
        </div>
      </div>

      {program.stages.map((stage) => (
        <StageCard
          key={stage.id}
          stage={stage}
          programId={program.id}
          onUpdated={onRefresh}
        />
      ))}
    </div>
  );
}
