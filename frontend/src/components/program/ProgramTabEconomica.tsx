import { useEffect, useState } from 'react';
import api from '../../api/api';
import {
  Receipt,
  Wrench,
  Microscope,
  FileText,
  Loader2,
  Building2,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpenseAllocation {
  id: number;
  gross_amount: number;
  allocated_amount: number;
  expense_category: string;
  is_eligible: boolean;
  eligibility_notes: string | null;
  rdi_expense_documents: {
    id: number;
    doc_type: string;
    doc_number: string | null;
    doc_date: string | null;
    description: string | null;
    total_amount: number;
    supplier_cnpj: string | null;
    supplier_name: string | null;
    contacts: { id: number; name: string } | null;
  };
  rdi_projects: { id: number; title: string; code: string | null };
}

interface FormpdExpense {
  id: number;
  expense_category: string;
  description: string | null;
  supplier_name: string | null;
  supplier_cnpj_cpf: string | null;
  amount: number;
  reference_period: string | null;
  formpd_projects: { id: number; title: string; item_number: number | null };
}

interface FormpdEquipment {
  id: number;
  origin: string;
  description: string;
  ncm_code: string | null;
  quantity: number | null;
  unit_amount: number;
  total_amount: number | null;
  acquisition_date: string | null;
  supplier_cnpj: string | null;
  formpd_projects: { id: number; title: string; item_number: number | null };
}

interface FormpdPatent {
  id: number;
  asset_type: string;
  title: string;
  registration_number: string | null;
  registry_office: string | null;
  filing_date: string | null;
  grant_date: string | null;
  amount: number | null;
  formpd_projects: { id: number; title: string; item_number: number | null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined) {
  if (val == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR');
}

const CATEGORY_LABELS: Record<string, string> = {
  SERVICO_APOIO_PF: 'Serviço Apoio PF',
  SERVICO_APOIO_PJ: 'Serviço Apoio PJ',
  MATERIAL_CONSUMO: 'Material de Consumo',
  TIB: 'TIB',
  DESPESA_OPERACIONAL: 'Desp. Operacional',
  FOLHA_PAGAMENTO: 'Folha de Pagamento',
  TIMESHEET: 'Timesheet',
  OUTROS: 'Outros',
};

const EXPENSE_CAT_COLORS: Record<string, string> = {
  SERVICO_APOIO_PJ: 'bg-blue-100 text-blue-700',
  SERVICO_APOIO_PF: 'bg-violet-100 text-violet-700',
  MATERIAL_CONSUMO: 'bg-amber-100 text-amber-700',
  TIB: 'bg-teal-100 text-teal-700',
  DESPESA_OPERACIONAL: 'bg-slate-100 text-slate-600',
};

// ── Empty state helper ────────────────────────────────────────────────────────

function EmptyState({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">{sub}</p>
    </div>
  );
}

// ── Sub-tab: Despesas RDI ─────────────────────────────────────────────────────

function TabDespesasRdi({ programId }: { programId: number }) {
  const [data, setData] = useState<ExpenseAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/programs/${programId}/expenses`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar despesas'))
      .finally(() => setLoading(false));
  }, [programId]);

  const totalAllocated = data.reduce((s, e) => s + Number(e.allocated_amount), 0);
  const eligible = data.filter((e) => e.is_eligible);
  const totalEligible = eligible.reduce((s, e) => s + Number(e.allocated_amount), 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div>
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{data.length}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">lançamentos</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{fmt(totalAllocated)}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">total alocado</div>
        </div>
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(totalEligible)}</div>
          <div className="text-[10px] text-green-600 dark:text-green-500 uppercase tracking-wide">total elegível</div>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<Receipt className="w-10 h-10 text-slate-300 dark:text-slate-600" />} label="Nenhuma despesa lançada" sub="As despesas aparecem ao vincular projetos com alocações de documentos fiscais" />
      ) : (
        <div className="space-y-2">
          {data.map((e) => {
            const doc = e.rdi_expense_documents;
            return (
              <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EXPENSE_CAT_COLORS[e.expense_category] ?? 'bg-slate-100 text-slate-600'}`}>
                        {CATEGORY_LABELS[e.expense_category] ?? e.expense_category}
                      </span>
                      <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{doc.doc_type} {doc.doc_number ? `#${doc.doc_number}` : ''}</span>
                      {!e.is_eligible && (
                        <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> Inelegível
                        </span>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{doc.description}</p>
                    )}
                    {doc.supplier_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {doc.supplier_name}
                        {doc.supplier_cnpj && <span className="font-mono">{doc.supplier_cnpj}</span>}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Projeto: {e.rdi_projects.code ?? e.rdi_projects.title.slice(0, 30)}
                      {doc.doc_date && ` · ${fmtDate(doc.doc_date)}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmt(e.allocated_amount)}</div>
                    {Number(e.gross_amount) !== Number(e.allocated_amount) && (
                      <div className="text-xs text-slate-400 dark:text-slate-500">de {fmt(e.gross_amount)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: FORMp&D Expenses ────────────────────────────────────────────────

function TabFormpdExpenses({ programId }: { programId: number }) {
  const [data, setData] = useState<FormpdExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/programs/${programId}/formpd-expenses`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar despesas FORMp&D'))
      .finally(() => setLoading(false));
  }, [programId]);

  const total = data.reduce((s, e) => s + Number(e.amount), 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  const byCategory = new Map<string, FormpdExpense[]>();
  for (const e of data) {
    if (!byCategory.has(e.expense_category)) byCategory.set(e.expense_category, []);
    byCategory.get(e.expense_category)!.push(e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">{data.length} registros · {fmt(total)} total</p>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />} label="Nenhum serviço de terceiros encontrado" sub="Vincule um FORMp&D ao programa ou reprocesse o arquivo" />
      ) : (
        <div className="space-y-4">
          {Array.from(byCategory.entries()).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EXPENSE_CAT_COLORS[cat] ?? 'bg-slate-100 text-slate-600'}`}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{items.length} · {fmt(items.reduce((s, e) => s + Number(e.amount), 0))}</span>
              </div>
              <div className="space-y-1">
                {items.map((e) => (
                  <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      {e.supplier_name && (
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{e.supplier_name}</p>
                      )}
                      {e.supplier_cnpj_cpf && (
                        <p className="text-xs font-mono text-slate-400 dark:text-slate-500">{e.supplier_cnpj_cpf}</p>
                      )}
                      {e.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{e.description}</p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Proj. {e.formpd_projects.item_number} — {e.formpd_projects.title.slice(0, 40)}
                        {e.reference_period && ` · ${e.reference_period}`}
                      </p>
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">{fmt(e.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Equipamentos ─────────────────────────────────────────────────────

function TabEquipamentos({ programId }: { programId: number }) {
  const [data, setData] = useState<FormpdEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/programs/${programId}/formpd-equipment`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar equipamentos'))
      .finally(() => setLoading(false));
  }, [programId]);

  const total = data.reduce((s, e) => s + Number(e.total_amount ?? e.unit_amount), 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">{data.length} equipamento(s) · {fmt(total)} total</p>
      </div>
      {data.length === 0 ? (
        <EmptyState icon={<Wrench className="w-10 h-10 text-slate-300 dark:text-slate-600" />} label="Nenhum equipamento encontrado" sub="Equipamentos são importados do FORMp&D vinculado ao programa" />
      ) : (
        <div className="space-y-2">
          {data.map((e) => (
            <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.origin === 'IMPORTADO' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {e.origin}
                  </span>
                  {e.ncm_code && <span className="text-xs font-mono text-slate-400 dark:text-slate-500">NCM {e.ncm_code}</span>}
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{e.description}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Qtd: {e.quantity ?? 1} · Proj. {e.formpd_projects.item_number}
                  {e.acquisition_date && ` · ${fmtDate(e.acquisition_date)}`}
                  {e.supplier_cnpj && ` · ${e.supplier_cnpj}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmt(e.total_amount ?? e.unit_amount)}</div>
                {e.quantity && e.quantity > 1 && (
                  <div className="text-xs text-slate-400 dark:text-slate-500">{fmt(e.unit_amount)} / un</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Patentes / PI ────────────────────────────────────────────────────

function TabPatentes({ programId }: { programId: number }) {
  const [data, setData] = useState<FormpdPatent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/programs/${programId}/formpd-patents`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erro ao carregar patentes'))
      .finally(() => setLoading(false));
  }, [programId]);

  const ASSET_LABELS: Record<string, string> = {
    PATENTE: 'Patente',
    MODELO_UTILIDADE: 'Modelo de Utilidade',
    DESENHO_INDUSTRIAL: 'Desenho Industrial',
    MARCA: 'Marca',
    SOFTWARE: 'Software',
    OUTRO_INTANGIVEL: 'Outro Intangível',
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">{data.length} ativo(s) de PI</p>
      </div>
      {data.length === 0 ? (
        <EmptyState icon={<Microscope className="w-10 h-10 text-slate-300 dark:text-slate-600" />} label="Nenhum ativo de PI encontrado" sub="Patentes e intangíveis são importados do FORMp&D" />
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      {ASSET_LABELS[p.asset_type] ?? p.asset_type}
                    </span>
                    {p.registration_number && (
                      <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{p.registration_number}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.title}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {p.registry_office && `${p.registry_office} · `}
                    {p.filing_date && `Depósito: ${fmtDate(p.filing_date)}`}
                    {p.grant_date && ` · Concessão: ${fmtDate(p.grant_date)}`}
                  </p>
                </div>
                {p.amount != null && (
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">{fmt(p.amount)}</div>
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

type EconTab = 'despesas' | 'formpd_expenses' | 'equipamentos' | 'patentes';

const SUB_TABS: { key: EconTab; label: string; icon: any }[] = [
  { key: 'despesas',        label: 'Despesas RDI',    icon: Receipt },
  { key: 'formpd_expenses', label: 'Serv. Terceiros', icon: FileText },
  { key: 'equipamentos',    label: 'Equipamentos',    icon: Wrench },
  { key: 'patentes',        label: 'PI / Patentes',   icon: Microscope },
];

export default function ProgramTabEconomica({
  programId,
  baseYear: _baseYear,
  formdpdFormId,
}: {
  programId: number;
  baseYear: number;
  formdpdFormId?: number;
}) {
  const [sub, setSub] = useState<EconTab>('despesas');

  const hasFormpd = !!formdpdFormId;

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700 flex-wrap">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.key;
          const needsFormpd = t.key === 'formpd_expenses' || t.key === 'equipamentos' || t.key === 'patentes';
          return (
            <button
              key={t.key}
              onClick={() => setSub(t.key)}
              disabled={needsFormpd && !hasFormpd}
              title={needsFormpd && !hasFormpd ? 'Vincule um FORMp&D a este programa para ver estes dados' : undefined}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-all disabled:opacity-40 ${
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

      {!hasFormpd && (sub === 'formpd_expenses' || sub === 'equipamentos' || sub === 'patentes') && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 flex items-start gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Este programa não possui um FORMp&D vinculado. Vincule um formulário para visualizar serviços de terceiros, equipamentos e patentes.
          </p>
        </div>
      )}

      {sub === 'despesas'        && <TabDespesasRdi programId={programId} />}
      {sub === 'formpd_expenses' && hasFormpd && <TabFormpdExpenses programId={programId} />}
      {sub === 'equipamentos'    && hasFormpd && <TabEquipamentos programId={programId} />}
      {sub === 'patentes'        && hasFormpd && <TabPatentes programId={programId} />}
    </div>
  );
}
