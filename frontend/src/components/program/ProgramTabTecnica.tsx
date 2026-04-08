import { useEffect, useState } from 'react';
import api from '../../api/api';
import { motion } from 'framer-motion';
import {
  FolderKanban,
  Users,
  Clock,
  Plus,
  Link2,
  Link2Off,
  Loader2,
  Search,
  Briefcase,
  GraduationCap,
  Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RdiProject {
  id: number;
  code: string | null;
  title: string;
  category: string;
  project_status: string;
  eligibility_status: string;
  start_date: string | null;
  end_date: string | null;
  contacts: { id: number; name: string } | null;
  _count: { rdi_hr_allocations: number; rdi_expense_allocations: number; rdi_project_documents: number };
}

interface CollaboratorEntry {
  contact: {
    id: number;
    name: string;
    email: string | null;
    collaborator: {
      id: number;
      position: string | null;
      department: string | null;
      registration_number: string | null;
      is_active: boolean;
      employment_type: string;
      academic_degree: string;
      is_researcher: boolean;
    } | null;
  };
  projects: { id: number; title: string; code: string | null }[];
  totalAllocations: number;
}

interface TimesheetEntry {
  id: number;
  entry_date: string;
  hours: number;
  activity_desc: string | null;
  status: string;
  contacts: { id: number; name: string };
  rdi_projects: { id: number; title: string; code: string | null };
}

// ── Status helpers ─────────────────────────────────────────────────────────

const PROJECT_STATUS_COLORS: Record<string, string> = {
  PLANEJAMENTO: 'bg-slate-100 text-slate-600',
  EM_EXECUCAO: 'bg-blue-100 text-blue-700',
  CONCLUIDO: 'bg-green-100 text-green-700',
  CANCELADO: 'bg-red-100 text-red-600',
};

const ELIGIBILITY_COLORS: Record<string, string> = {
  NAO_AVALIADO: 'bg-slate-100 text-slate-500',
  ELEGIVEL: 'bg-emerald-100 text-emerald-700',
  PARCIALMENTE_ELEGIVEL: 'bg-amber-100 text-amber-700',
  INELEGIVEL: 'bg-red-100 text-red-600',
};

const DEGREE_LABELS: Record<string, string> = {
  NAO_INFORMADO: '—',
  GRADUACAO: 'Graduação',
  ESPECIALIZACAO: 'Especialização',
  MESTRADO: 'Mestrado',
  DOUTORADO: 'Doutorado',
  POS_DOUTORADO: 'Pós-Doc',
};

// ── Sub-tab: Projetos ─────────────────────────────────────────────────────────

function TabProjetos({
  programId,
  companyId,
}: {
  programId: number;
  companyId: number;
}) {
  const [linked, setLinked] = useState<RdiProject[]>([]);
  const [available, setAvailable] = useState<RdiProject[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState<number | null>(null);

  const loadLinked = async () => {
    setLoadingLinked(true);
    try {
      const r = await api.get(`/programs/${programId}/projects`);
      setLinked(r.data);
    } catch {
      toast.error('Erro ao carregar projetos');
    } finally {
      setLoadingLinked(false);
    }
  };

  const loadAvailable = async () => {
    try {
      const r = await api.get('/projects', { params: { companyId, limit: 100 } });
      setAvailable(r.data.data ?? r.data);
    } catch {
      toast.error('Erro ao carregar projetos disponíveis');
    }
  };

  useEffect(() => { loadLinked(); }, [programId]);
  useEffect(() => { if (showPicker) loadAvailable(); }, [showPicker]);

  const link = async (projectId: number) => {
    setLinking(projectId);
    try {
      await api.post(`/programs/${programId}/rdi-projects/${projectId}`);
      toast.success('Projeto vinculado');
      loadLinked();
    } catch {
      toast.error('Erro ao vincular projeto');
    } finally {
      setLinking(null);
    }
  };

  const unlink = async (projectId: number) => {
    setLinking(projectId);
    try {
      await api.delete(`/programs/${programId}/rdi-projects/${projectId}`);
      toast.success('Projeto desvinculado');
      loadLinked();
    } catch {
      toast.error('Erro ao desvincular projeto');
    } finally {
      setLinking(null);
    }
  };

  const linkedIds = new Set(linked.map((p) => p.id));
  const filtered = available.filter(
    (p) =>
      !linkedIds.has(p.id) &&
      (search === '' ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.code ?? '').toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">{linked.length} projeto(s) vinculado(s)</p>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Vincular Projeto
        </button>
      </div>

      {/* Project picker */}
      {showPicker && (
        <div className="mb-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Projetos disponíveis da empresa</p>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou código..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">Nenhum projeto disponível</p>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{p.title}</p>
                    {p.code && <p className="text-xs text-slate-400 dark:text-slate-500">{p.code}</p>}
                  </div>
                  <button
                    onClick={() => link(p.id)}
                    disabled={linking === p.id}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg ml-2 flex-shrink-0 disabled:opacity-50"
                  >
                    {linking === p.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Link2 className="w-3 h-3" />
                    )}
                    Vincular
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Linked projects */}
      {loadingLinked ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : linked.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <FolderKanban className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum projeto vinculado</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Vincule projetos RDI para compor este programa</p>
        </div>
      ) : (
        <div className="space-y-2">
          {linked.map((p) => (
            <motion.div
              key={p.id}
              layout
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {p.code && (
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">#{p.code}</span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLORS[p.project_status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {p.project_status.replace('_', ' ')}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ELIGIBILITY_COLORS[p.eligibility_status] ?? ''}`}>
                    {p.eligibility_status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {p.contacts && <span>{p.contacts.name}</span>}
                  <span>{p._count.rdi_hr_allocations} RH · {p._count.rdi_expense_allocations} despesas</span>
                </div>
              </div>
              <button
                onClick={() => unlink(p.id)}
                disabled={linking === p.id}
                title="Desvincular projeto"
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 flex-shrink-0 disabled:opacity-50"
              >
                {linking === p.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2Off className="w-4 h-4" />
                )}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Colaboradores ────────────────────────────────────────────────────

function TabColaboradores({ programId }: { programId: number }) {
  const [data, setData] = useState<CollaboratorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get(`/programs/${programId}/collaborators`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar colaboradores'))
      .finally(() => setLoading(false));
  }, [programId]);

  const filtered = data.filter(
    (e) =>
      search === '' ||
      e.contact.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.contact.collaborator?.department ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.contact.collaborator?.position ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} colaborador(es)</p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {data.length === 0 ? 'Nenhum colaborador encontrado' : 'Nenhum resultado para a busca'}
          </p>
          {data.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Vincule projetos com alocações de RH para ver os colaboradores</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((entry) => {
            const collab = entry.contact.collaborator;
            return (
              <div key={entry.contact.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {entry.contact.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.contact.name}</p>
                      {collab?.is_researcher && (
                        <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                          Pesquisador
                        </span>
                      )}
                      {collab && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${collab.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {collab.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      )}
                    </div>
                    {entry.contact.email && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{entry.contact.email}</p>
                    )}
                  </div>
                </div>

                {collab && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-1.5 text-xs">
                    {collab.position && (
                      <Detail icon={<Briefcase className="w-3 h-3" />} label={collab.position} />
                    )}
                    {collab.department && (
                      <Detail icon={<Hash className="w-3 h-3" />} label={collab.department} />
                    )}
                    {collab.registration_number && (
                      <Detail icon={<Hash className="w-3 h-3" />} label={`Mat. ${collab.registration_number}`} />
                    )}
                    <Detail
                      icon={<GraduationCap className="w-3 h-3" />}
                      label={DEGREE_LABELS[collab.academic_degree] ?? collab.academic_degree}
                    />
                    <Detail icon={<Briefcase className="w-3 h-3" />} label={collab.employment_type} />
                  </div>
                )}

                {/* Projects */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.projects.map((p) => (
                    <span key={p.id} className="text-[10px] bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full truncate max-w-[140px]" title={p.title}>
                      {p.code ?? p.title.slice(0, 20)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate">
      <span className="flex-shrink-0 text-slate-400 dark:text-slate-500">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

// ── Sub-tab: Timesheet ────────────────────────────────────────────────────────

function TabTimesheet({ programId, baseYear }: { programId: number; baseYear: number }) {
  const [data, setData] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(baseYear);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/programs/${programId}/timesheets`, { params: { year } })
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar timesheet'))
      .finally(() => setLoading(false));
  }, [programId, year]);

  const byContact = new Map<number, { name: string; entries: TimesheetEntry[]; totalHours: number }>();
  for (const e of data) {
    if (!byContact.has(e.contacts.id)) {
      byContact.set(e.contacts.id, { name: e.contacts.name, entries: [], totalHours: 0 });
    }
    const c = byContact.get(e.contacts.id)!;
    c.entries.push(e);
    c.totalHours += Number(e.hours);
  }

  const totalHours = data.reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <div>
      {/* Year selector */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ano</label>
        {[baseYear - 1, baseYear, baseYear + 1].map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-xl border transition-all ${
              year === y
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            {y}
          </button>
        ))}
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {data.length} lançamentos · {totalHours.toFixed(1)}h total
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum lançamento de horas em {year}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(byContact.entries()).map(([contactId, { name, entries, totalHours: hours }]) => (
            <div key={contactId} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
                </div>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  {hours.toFixed(1)}h
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.slice(0, 10).map((e) => (
                  <div key={e.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                    <span className="text-slate-400 dark:text-slate-500 w-20 flex-shrink-0">
                      {new Date(e.entry_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </span>
                    <span className="font-medium text-slate-600 dark:text-slate-300 flex-1 truncate">
                      {e.rdi_projects.code ?? e.rdi_projects.title.slice(0, 30)}
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 w-12 text-right">{Number(e.hours).toFixed(1)}h</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${
                      e.status === 'APROVADO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {e.status}
                    </span>
                  </div>
                ))}
                {entries.length > 10 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                    +{entries.length - 10} lançamentos
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

type TecnicaTab = 'projetos' | 'colaboradores' | 'timesheet';

const SUB_TABS: { key: TecnicaTab; label: string; icon: any }[] = [
  { key: 'projetos',      label: 'Projetos',      icon: FolderKanban },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users },
  { key: 'timesheet',     label: 'Timesheet',     icon: Clock },
];

export default function ProgramTabTecnica({
  programId,
  baseYear,
  companyId,
}: {
  programId: number;
  baseYear: number;
  companyId: number;
}) {
  const [sub, setSub] = useState<TecnicaTab>('projetos');

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSub(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-all ${
                active
                  ? 'text-blue-600 border-blue-600 bg-blue-50/50 dark:bg-blue-500/10'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === 'projetos'      && <TabProjetos programId={programId} companyId={companyId} />}
      {sub === 'colaboradores' && <TabColaboradores programId={programId} />}
      {sub === 'timesheet'     && <TabTimesheet programId={programId} baseYear={baseYear} />}
    </div>
  );
}
