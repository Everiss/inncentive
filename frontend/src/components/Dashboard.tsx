import { useEffect, useState } from 'react';
import {
  Building2, Users, Briefcase, FolderKanban, Target, FileSpreadsheet,
  TrendingUp, CheckCircle2, Clock, XCircle, RefreshCw, Server,
  ArrowUpRight, Zap, Award,
} from 'lucide-react';
import api from '../api/api';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  companies: { total: number; active: number; newThisMonth: number };
  contacts: { total: number };
  collaborators: { total: number };
  projects: {
    total: number;
    byStatus: { PLANEJAMENTO: number; EM_EXECUCAO: number; CONCLUIDO: number; CANCELADO: number };
  };
  programs: {
    total: number;
    byStatus: { RASCUNHO: number; EM_ANDAMENTO: number; EM_REVISAO: number; FINALIZADO: number; SUBMETIDO: number };
    byType: { LEI_DO_BEM: number; LEI_DA_INFORMATICA: number; ROTA_2030: number };
  };
  forms: {
    total: number;
    byStatus: { NAO_PREENCHIDO: number; EM_PREENCHIMENTO: number; FINALIZADO: number; SUBMETIDO: number };
  };
  recentBatches: {
    id: number;
    entity_type: string;
    file_name: string;
    status: string;
    total_records: number;
    success_count: number;
    error_count: number;
    created_at: string;
    companies: { legal_name: string } | null;
  }[];
  recentCompanies: {
    id: number;
    legal_name: string;
    trade_name: string | null;
    cnpj: string;
    situation: string | null;
    created_at: string;
  }[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  badge,
  badgeColor,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  badge?: string;
  badgeColor?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm p-6 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-blue-500 dark:text-slate-400 truncate">{label}</p>
        <p className="text-3xl font-bold text-blue-900 dark:text-slate-100 mt-0.5 leading-none">{value.toLocaleString('pt-BR')}</p>
        {badge && (
          <span className={cn('inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full', badgeColor)}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-blue-800 dark:text-slate-300 font-medium">{label}</span>
        <span className="text-blue-500 dark:text-slate-400 font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 bg-blue-50 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETED: { label: 'Concluído', cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
    PROCESSING: { label: 'Processando', cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
    PENDING: { label: 'Pendente', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
    FAILED: { label: 'Falhou', cls: 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400' },
    PARTIAL: { label: 'Parcial', cls: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', entry.cls)}>
      {entry.label}
    </span>
  );
}

const ENTITY_LABELS: Record<string, string> = {
  COMPANIES: 'Empresas',
  CONTACTS: 'Contatos',
  COLLABORATORS: 'Colaboradores',
  PROJECTS: 'Projetos',
  FORMPD: 'FORMP&D',
};

function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.get<DashboardStats>('/dashboard/stats')
      .then((r) => setStats(r.data))
      .catch(() => setError('Não foi possível carregar os dados do dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-blue-400 dark:text-slate-500 text-sm font-medium">Carregando dados…</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <XCircle className="w-10 h-10 text-red-400" />
        <p className="text-red-500 text-sm font-medium">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { companies, contacts, collaborators, projects, programs, forms, recentBatches, recentCompanies } = stats;

  const projectsMax = Object.values(projects.byStatus).reduce((a, b) => a + b, 0) || 1;
  const formsMax = Object.values(forms.byStatus).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-8">

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={Building2}
          label="Empresas"
          value={companies.total}
          badge={companies.newThisMonth > 0 ? `+${companies.newThisMonth} este mês` : undefined}
          badgeColor="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          icon={Users}
          label="Contatos"
          value={contacts.total}
          color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
        />
        <KpiCard
          icon={Briefcase}
          label="Colaboradores"
          value={collaborators.total}
          badge="ativos"
          badgeColor="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
          color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          icon={FolderKanban}
          label="Projetos RDI"
          value={projects.total}
          badge={projects.byStatus.EM_EXECUCAO > 0 ? `${projects.byStatus.EM_EXECUCAO} em execução` : undefined}
          badgeColor="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
          color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={Target}
          label="Programas"
          value={programs.total}
          badge={programs.byStatus.EM_ANDAMENTO > 0 ? `${programs.byStatus.EM_ANDAMENTO} em andamento` : undefined}
          badgeColor="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
          color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
        />
        <KpiCard
          icon={FileSpreadsheet}
          label="FORMP&D"
          value={forms.total}
          badge={forms.byStatus.SUBMETIDO > 0 ? `${forms.byStatus.SUBMETIDO} submetidos` : undefined}
          badgeColor="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
          color="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
        />
      </div>

      {/* ── Breakdowns ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Projects by status */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">Projetos por Status</h3>
              <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">{projects.total} projetos RDI cadastrados</p>
            </div>
            <FolderKanban className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-4">
            <StatusBar label="Planejamento" value={projects.byStatus.PLANEJAMENTO} max={projectsMax} color="bg-slate-400" />
            <StatusBar label="Em Execução" value={projects.byStatus.EM_EXECUCAO} max={projectsMax} color="bg-amber-500" />
            <StatusBar label="Concluído" value={projects.byStatus.CONCLUIDO} max={projectsMax} color="bg-emerald-500" />
            <StatusBar label="Cancelado" value={projects.byStatus.CANCELADO} max={projectsMax} color="bg-red-400" />
          </div>
        </div>

        {/* Programs by type */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">Programas por Incentivo</h3>
              <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">{programs.total} programas ativos no sistema</p>
            </div>
            <Target className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="space-y-4">
            {[
              { key: 'LEI_DO_BEM' as const, label: 'Lei do Bem', color: 'bg-indigo-500', icon: Award },
              { key: 'LEI_DA_INFORMATICA' as const, label: 'Lei da Informática', color: 'bg-blue-500', icon: Zap },
              { key: 'ROTA_2030' as const, label: 'Rota 2030', color: 'bg-violet-500', icon: TrendingUp },
            ].map(({ key, label, color }) => {
              const v = programs.byType[key];
              const total = programs.total || 1;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-blue-800 dark:text-slate-300 font-medium truncate">{label}</span>
                      <span className="text-blue-500 dark:text-slate-400 font-semibold tabular-nums shrink-0 ml-2">{v}</span>
                    </div>
                    <div className="h-1.5 bg-blue-50 dark:bg-slate-800 rounded-full">
                      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.round((v / total) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-2 border-t border-blue-50 dark:border-slate-700/50 space-y-2">
            <p className="text-xs font-semibold text-blue-500 dark:text-slate-400 uppercase tracking-wider">Por etapa</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'RASCUNHO', label: 'Rascunho', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' },
                { key: 'EM_ANDAMENTO', label: 'Em andamento', cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
                { key: 'EM_REVISAO', label: 'Em revisão', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
                { key: 'FINALIZADO', label: 'Finalizado', cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
                { key: 'SUBMETIDO', label: 'Submetido', cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400' },
              ].map(({ key, label, cls }) => {
                const v = programs.byStatus[key as keyof typeof programs.byStatus];
                if (!v) return null;
                return (
                  <span key={key} className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', cls)}>
                    {v} {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Forms by status */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">FORMP&D por Status</h3>
              <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">{forms.total} formulários importados</p>
            </div>
            <FileSpreadsheet className="w-5 h-5 text-rose-500" />
          </div>
          <div className="space-y-4">
            <StatusBar label="Não preenchido" value={forms.byStatus.NAO_PREENCHIDO} max={formsMax} color="bg-slate-300 dark:bg-slate-600" />
            <StatusBar label="Em preenchimento" value={forms.byStatus.EM_PREENCHIMENTO} max={formsMax} color="bg-amber-400" />
            <StatusBar label="Finalizado" value={forms.byStatus.FINALIZADO} max={formsMax} color="bg-emerald-500" />
            <StatusBar label="Submetido" value={forms.byStatus.SUBMETIDO} max={formsMax} color="bg-violet-500" />
          </div>
          <div className="pt-4 border-t border-blue-50 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {forms.byStatus.FINALIZADO + forms.byStatus.SUBMETIDO}
                </p>
                <p className="text-xs text-blue-400 dark:text-slate-500 font-medium">Completos</p>
              </div>
              <div className="w-px h-10 bg-blue-100 dark:bg-slate-700" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-amber-500">
                  {forms.byStatus.NAO_PREENCHIDO + forms.byStatus.EM_PREENCHIMENTO}
                </p>
                <p className="text-xs text-blue-400 dark:text-slate-500 font-medium">Pendentes</p>
              </div>
              <div className="w-px h-10 bg-blue-100 dark:bg-slate-700" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                  {forms.total > 0 ? Math.round(((forms.byStatus.FINALIZADO + forms.byStatus.SUBMETIDO) / forms.total) * 100) : 0}%
                </p>
                <p className="text-xs text-blue-400 dark:text-slate-500 font-medium">Taxa conclusão</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Empresas recentes */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-blue-50 dark:border-slate-700/50 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">Empresas Recentes</h3>
              <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">Cadastradas no ano atual</p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('empresas')}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver todas <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {recentCompanies.length === 0 ? (
            <div className="p-8 text-center text-blue-400 dark:text-slate-500 text-sm">Nenhuma empresa cadastrada este ano.</div>
          ) : (
            <ul className="divide-y divide-blue-50 dark:divide-slate-800">
              {recentCompanies.map((c) => (
                <li key={c.id} className="px-6 py-4 flex items-center gap-3 hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-blue-900 dark:text-slate-100 truncate">{c.trade_name || c.legal_name}</p>
                    <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">{formatCnpj(c.cnpj)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      c.situation === 'ATIVA'
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
                    )}>
                      {c.situation ?? '—'}
                    </span>
                    <span className="text-xs text-blue-400 dark:text-slate-500">{formatDate(c.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent batches */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-blue-50 dark:border-slate-700/50 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">Processamentos Recentes</h3>
              <p className="text-xs text-blue-400 dark:text-slate-500 mt-0.5">Últimos lotes de importação</p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('processamentos')}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {recentBatches.length === 0 ? (
            <div className="p-8 text-center text-blue-400 dark:text-slate-500 text-sm">Nenhum processamento encontrado.</div>
          ) : (
            <ul className="divide-y divide-blue-50 dark:divide-slate-800">
              {recentBatches.map((b) => (
                <li key={b.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <Server className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-slate-100 truncate">
                      {ENTITY_LABELS[b.entity_type] ?? b.entity_type}
                      {b.companies && <span className="font-normal text-blue-400 dark:text-slate-500"> · {b.companies.legal_name}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {b.total_records > 0 && (
                        <>
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{b.success_count} ok</span>
                          {b.error_count > 0 && <span className="text-xs text-red-500 font-medium">{b.error_count} erros</span>}
                        </>
                      )}
                      <span className="text-xs text-blue-400 dark:text-slate-500">{formatDate(b.created_at)}</span>
                    </div>
                  </div>
                  <BatchStatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Quick actions footer ───────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-white font-bold text-lg">Empresas ativas: {companies.active}</p>
          <p className="text-blue-100 text-sm mt-0.5">
            {companies.total - companies.active > 0
              ? `${companies.total - companies.active} empresa(s) com situação diferente de ATIVA`
              : 'Todas as empresas estão com situação ativa'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span className="text-white text-sm font-semibold">{companies.active} ativas</span>
          </div>
          <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2.5">
            <Clock className="w-4 h-4 text-amber-300" />
            <span className="text-white text-sm font-semibold">+{companies.newThisMonth} este mês</span>
          </div>
        </div>
      </div>

    </div>
  );
}
