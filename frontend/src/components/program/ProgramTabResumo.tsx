import {
  FolderKanban,
  Users,
  Receipt,
  FileText,
  CheckCircle2,
  CalendarClock,
  AlertCircle,
} from 'lucide-react';
import type { ProgramSummary } from '../ProgramDetail';
import {
  StageIcon,
  STAGE_STATUS_LABELS,
  INCENTIVE_LABELS,
  PROGRAM_STATUS_LABELS,
} from '../ProgramDetail';

interface Props {
  program: ProgramSummary;
  onRefresh: () => void;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function ProgramTabResumo({ program }: Props) {
  const { stats, stages } = program;

  const stagesByStatus = {
    CONCLUIDO: stages.filter((s) => s.status === 'CONCLUIDO'),
    EM_ANDAMENTO: stages.filter((s) => s.status === 'EM_ANDAMENTO'),
    PENDENTE: stages.filter((s) => s.status === 'PENDENTE'),
    NAO_APLICAVEL: stages.filter((s) => s.status === 'NAO_APLICAVEL'),
  };

  const nextStage = stages.find(
    (s) => s.status === 'EM_ANDAMENTO' || s.status === 'PENDENTE',
  );

  return (
    <div className="space-y-6 pb-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={FolderKanban}
          label="Projetos vinculados"
          value={stats.projects}
          color="bg-blue-50 dark:bg-blue-500/15 text-blue-600"
        />
        <KpiCard
          icon={Users}
          label="Colaboradores"
          value={stats.collaborators}
          color="bg-violet-50 dark:bg-violet-500/15 text-violet-600"
        />
        <KpiCard
          icon={Receipt}
          label="Despesas lançadas"
          value={stats.expenses}
          color="bg-amber-50 dark:bg-amber-500/15 text-amber-600"
        />
        <KpiCard
          icon={FileText}
          label="Documentos / evidências"
          value={stats.documents}
          color="bg-teal-50 dark:bg-teal-500/15 text-teal-600"
        />
      </div>

      {/* Stage progress overview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pipeline Operacional</h3>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {stats.completedStages}/{stats.totalStages} etapas concluídas
          </span>
        </div>

        {/* Visual pipeline */}
        <div className="flex items-center gap-0 mb-4">
          {stages
            .filter((s) => s.status !== 'NAO_APLICAVEL')
            .map((stage, i, arr) => (
              <div key={stage.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                      stage.status === 'CONCLUIDO'
                        ? 'bg-green-500 border-green-500 text-white'
                        : stage.status === 'EM_ANDAMENTO'
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {stage.status === 'CONCLUIDO' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <span className="text-[10px] font-bold">{i + 1}</span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 text-center mt-1 leading-tight max-w-[60px]">
                    {(stage.title ?? stage.stage_type)
                      .replace('ELABORACAO_', '')
                      .replace('_', ' ')
                      .slice(0, 20)}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1 -mt-4 ${
                      stage.status === 'CONCLUIDO' ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
              </div>
            ))}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-700"
            style={{ width: `${stats.progressPct}%` }}
          />
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400 mt-1">{stats.progressPct}% concluído</div>
      </div>

      {/* Two column: status counts + next action */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Status das Etapas</h3>
          <div className="space-y-2">
            {(
              [
                ['CONCLUIDO', 'text-green-600 bg-green-50 dark:bg-green-500/15'],
                ['EM_ANDAMENTO', 'text-blue-600 bg-blue-50 dark:bg-blue-500/15'],
                ['PENDENTE', 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'],
                ['NAO_APLICAVEL', 'text-slate-400 bg-slate-50 dark:bg-slate-800'],
              ] as const
            ).map(([status, cls]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StageIcon status={status} />
                  <span className="text-sm text-slate-600 dark:text-slate-300">{STAGE_STATUS_LABELS[status]}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
                  {stagesByStatus[status].length}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Next action + program info */}
        <div className="space-y-3">
          {nextStage && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-0.5">
                    Próxima etapa
                  </p>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {nextStage.title ?? nextStage.stage_type}
                  </p>
                  {nextStage.due_date && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      Prazo: {new Date(nextStage.due_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Sobre o Programa</h3>
            <Row label="Produto">{INCENTIVE_LABELS[program.incentive_type]}</Row>
            <Row label="Ano-base">{program.base_year}</Row>
            <Row label="Status">{PROGRAM_STATUS_LABELS[program.status]}</Row>
            <Row label="Empresa">{program.companies.legal_name}</Row>
            {program.contacts && <Row label="Responsável">{program.contacts.name}</Row>}
            {program.formpd_forms && (
              <Row label="FORMp&D">Form #{program.formpd_forms.id} · {program.formpd_forms.status}</Row>
            )}
            <Row label="Criado em">
              {new Date(program.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </Row>
          </div>

          {program.notes && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Observações</p>
              <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">{program.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-medium text-right">{children}</span>
    </div>
  );
}
