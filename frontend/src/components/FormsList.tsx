import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet, BrainCircuit, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Eye, Calendar, TrendingUp, Sparkles,
  Bell, Loader2, ShieldCheck, X, ThumbsUp, ThumbsDown,
  Layers, DollarSign, ChevronDown, ChevronUp, ClipboardList, Users,
  HelpCircle, Send, FileClock, FileCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FormpdAiUpload from './FormpdAiUpload';

// ─── Types from DB ────────────────────────────────────────────────────────────

interface FormpdForm {
  id: number;
  company_id: number;
  base_year: number;
  status: 'NAO_PREENCHIDO' | 'EM_PREENCHIMENTO' | 'FINALIZADO' | 'SUBMETIDO';
  fiscal_loss: boolean;
  submission_status: 'PENDENTE' | 'EM_ANALISE' | 'ANALISADO' | 'ENCERRADO' | null;
  created_at: string;
  companies: {
    id: number;
    legal_name: string;
    trade_name: string | null;
    cnpj: string;
  };
  formpd_projects: { id: number }[];
  formpd_fiscal_incentives: {
    total_benefit: number | null;
    total_rnd_expenditure: number | null;
  } | null;
}

type PendingBatchStatus = 'PENDING_REVIEW' | 'COMPANY_NOT_FOUND' | 'AWAITING_COMPANY';

interface PendingBatch {
  id: number;
  file_name: string;
  status: PendingBatchStatus;
  company_id: number | null;
  created_at: string;
}

interface FormpdCompletedPayload {
  batchId: number;
  status: 'PENDING_REVIEW' | 'CNPJ_MISMATCH' | 'COMPANY_NOT_FOUND' | 'INVALID_FORMPD' | 'ERROR';
  cnpjFromForm: string | null;
  companyId: number | null;
  companyName: string | null;
  errorMessage?: string;
}

interface FormpdCompanyRegisteredPayload {
  batchId: number;
  companyId: number;
  companyName: string;
  cnpj: string;
}

interface ReviewItem {
  batchId: number;
  batchStatus: string;
  fileName: string;
  fiscal_year?: number;
  projects?: any[];
  fiscal_summary?: any;
  itemStatus: string;
  cnpjFromForm?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  hasPdf?: boolean;
}

interface PendingDecision {
  batchId: number;
  cnpj: string;
  fileName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtCnpj = (v: string) =>
  v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const CATEGORY_LABELS: Record<string, string> = {
  PESQUISA_BASICA: 'Pesquisa Básica',
  PESQUISA_APLICADA: 'Pesquisa Aplicada',
  DESENVOLVIMENTO_EXPERIMENTAL: 'Desenvolvimento Experimental',
  INOVACAO_TECNOLOGICA: 'Inovação Tecnológica',
};

const FORM_STATUS_CONFIG: Record<FormpdForm['status'], { label: string; color: string; icon: any }> = {
  NAO_PREENCHIDO:    { label: 'Não preenchido',    color: 'slate',   icon: Clock },
  EM_PREENCHIMENTO:  { label: 'Em preenchimento',  color: 'blue',    icon: FileClock },
  FINALIZADO:        { label: 'Finalizado',         color: 'emerald', icon: FileCheck },
  SUBMETIDO:         { label: 'Submetido',          color: 'violet',  icon: Send },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function FormsList({ onSelectCompany }: { onSelectCompany?: (id: number) => void }) {
  const [forms, setForms] = useState<FormpdForm[]>([]);
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [reviewItem, setReviewItem] = useState<ReviewItem | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [registering, setRegistering] = useState(false);
  const [declining, setDeclining] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchForms = useCallback(async () => {
    try {
      const res = await api.get('/formpd/all');
      setForms(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchPendingBatches = useCallback(async () => {
    try {
      const res = await api.get('/imports/batches', {
        params: { entityType: 'FORMPD_AI_EXTRACTION', limit: 200 },
      });
      const rows: any[] = res.data.data ?? res.data;
      const pending = rows.filter(b =>
        ['PENDING_REVIEW', 'COMPANY_NOT_FOUND', 'AWAITING_COMPANY'].includes(b.status)
      );
      setPendingBatches(pending);
    } catch { /* ignore */ }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchForms(), fetchPendingBatches()]);
    setLoading(false);
  }, [fetchForms, fetchPendingBatches]);

  // ── Open batch review ──────────────────────────────────────────────────────

  const openBatchReview = useCallback(async (batchId: number) => {
    try {
      const [batchRes, itemsRes] = await Promise.all([
        api.get('/imports/batches', { params: { entityType: 'FORMPD_AI_EXTRACTION', limit: 200 } }),
        api.get(`/imports/batches/${batchId}/items`),
      ]);
      const batchRows: any[] = batchRes.data.data ?? batchRes.data;
      const batch = batchRows.find((b: any) => b.id === batchId);
      const item = itemsRes.data.data?.[0];
      if (!item) { toast.error('Dados não disponíveis.'); return; }

      let parsed: any = {};
      try { parsed = JSON.parse(item.record_data); } catch { /* */ }
      const formData = parsed.form_data || parsed;

      setReviewItem({
        batchId,
        batchStatus: batch?.status ?? 'PENDING_REVIEW',
        fileName: batch?.file_name ?? `Lote #${batchId}`,
        fiscal_year: formData.fiscal_year,
        projects: formData.projects || [],
        fiscal_summary: formData.fiscal_summary,
        itemStatus: item.status,
        cnpjFromForm: parsed.cnpj_from_form ?? null,
        companyId: parsed.company_id ?? null,
        companyName: parsed.company_name ?? null,
      });
      setExpandedProject(null);
    } catch {
      toast.error('Erro ao abrir extração.');
    }
  }, []);

  // ── Approve / Discard batch ────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!reviewItem) return;
    setApproving(true);
    try {
      await api.post(`/imports/formpd/batches/${reviewItem.batchId}/approve`);
      toast.success('FORMP&D aprovado e salvo nos formulários!');
      setReviewItem(null);
      fetchAll();
    } catch (e: any) {
      toast.error('Erro ao aprovar: ' + (e.response?.data?.message || e.message));
    } finally {
      setApproving(false);
    }
  };

  const handleDiscard = async () => {
    if (!reviewItem) return;
    setDiscarding(true);
    try {
      await api.post(`/imports/formpd/batches/${reviewItem.batchId}/discard`);
      toast.success('Documento movido para recusados.');
      setReviewItem(null);
      fetchAll();
    } catch (e: any) {
      toast.error('Erro ao recusar: ' + (e.response?.data?.message || e.message));
    } finally {
      setDiscarding(false);
    }
  };

  // ── Company registration decision ──────────────────────────────────────────

  const handleRegisterCompany = async () => {
    if (!pendingDecision) return;
    setRegistering(true);
    try {
      await api.post(`/imports/formpd/batches/${pendingDecision.batchId}/register-company`);
      toast.success('Empresa enfileirada para cadastro. Você será notificado quando concluído.', { duration: 7000 });
      setPendingDecision(null);
      fetchPendingBatches();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleDecline = async () => {
    if (!pendingDecision) return;
    setDeclining(true);
    try {
      await api.post(`/imports/formpd/batches/${pendingDecision.batchId}/discard`);
      toast.success('Documento recusado.');
      setPendingDecision(null);
      fetchPendingBatches();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message);
    } finally {
      setDeclining(false);
    }
  };

  // ── WebSocket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchAll();

    // formpd:completed
    const onCompleted = (payload: FormpdCompletedPayload) => {
      fetchPendingBatches();

      if (payload.status === 'INVALID_FORMPD' || payload.status === 'ERROR') {
        toast.error(payload.errorMessage || 'Extração falhou.', { duration: 8000 });
        return;
      }
      if (payload.status === 'CNPJ_MISMATCH') return; // handled in company-scoped tab

      if (payload.status === 'COMPANY_NOT_FOUND') {
        // Need the file name — will be available in pendingBatches after refetch
        fetchPendingBatches().then(() => {
          setPendingBatches(prev => {
            const batch = prev.find(b => b.id === payload.batchId);
            setPendingDecision({
              batchId: payload.batchId,
              cnpj: payload.cnpjFromForm ?? '',
              fileName: batch?.file_name ?? `Lote #${payload.batchId}`,
            });
            return prev;
          });
        });
        return;
      }

      if (payload.status === 'PENDING_REVIEW') {
        toast.custom((t) => (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex items-start gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-blue-100 dark:border-slate-700 max-w-sm w-full ${t.visible ? '' : 'opacity-0'}`}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl flex items-center justify-center shrink-0">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-blue-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> FORMP&D Extraído!
              </p>
              {payload.companyName && <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5 truncate">{payload.companyName}</p>}
              {payload.cnpjFromForm && <p className="text-xs font-mono text-slate-500">{fmtCnpj(payload.cnpjFromForm)}</p>}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => { toast.dismiss(t.id); openBatchReview(payload.batchId); }}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors">
                  Revisar e Aprovar →
                </button>
                <button onClick={() => toast.dismiss(t.id)} className="text-slate-400 text-xs hover:underline">Dispensar</button>
              </div>
            </div>
            <button onClick={() => toast.dismiss(t.id)} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-4 h-4" /></button>
          </motion.div>
        ), { duration: Infinity, position: 'top-right' });
      }
    };

    // formpd:company-registered
    const onCompanyRegistered = (payload: FormpdCompanyRegisteredPayload) => {
      fetchPendingBatches();
      toast.custom((t) => (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-start gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-100 dark:border-emerald-800 max-w-sm w-full ${t.visible ? '' : 'opacity-0'}`}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-blue-900 dark:text-slate-100 text-sm">Empresa Cadastrada!</p>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">{payload.companyName}</p>
            <p className="text-xs font-mono text-slate-500">{fmtCnpj(payload.cnpj)}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { toast.dismiss(t.id); openBatchReview(payload.batchId); }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors">
                Revisar FORM →
              </button>
              <button onClick={() => toast.dismiss(t.id)} className="text-slate-400 text-xs hover:underline">Dispensar</button>
            </div>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-4 h-4" /></button>
        </motion.div>
      ), { duration: Infinity, position: 'top-right' });
    };

    // formpd:approved (after approve, refresh the real forms list)
    const onApproved = () => fetchForms();

    socket.on('formpd:completed', onCompleted);
    socket.on('formpd:company-registered', onCompanyRegistered);
    socket.on('formpd:approved', onApproved);
    return () => {
      socket.off('formpd:completed', onCompleted);
      socket.off('formpd:company-registered', onCompanyRegistered);
      socket.off('formpd:approved', onApproved);
    };
  }, [fetchAll, fetchForms, fetchPendingBatches, openBatchReview]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = {
    total: forms.length,
    finalizados: forms.filter(f => f.status === 'FINALIZADO' || f.status === 'SUBMETIDO').length,
    emPreenchimento: forms.filter(f => f.status === 'EM_PREENCHIMENTO').length,
    pendentes: pendingBatches.length,
  };

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total de FORMs',      value: stats.total,           icon: FileSpreadsheet, color: 'blue' },
          { label: 'Finalizados/Submetidos', value: stats.finalizados,  icon: CheckCircle2,    color: 'emerald' },
          { label: 'Em preenchimento',    value: stats.emPreenchimento, icon: FileClock,        color: 'violet' },
          { label: 'Aguardando revisão',  value: stats.pendentes,       icon: Bell,            color: 'amber' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-50 dark:border-slate-800 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-${color}-50 dark:bg-${color}-900/30 flex items-center justify-center`}>
              <Icon className={`w-5 h-5 text-${color}-500`} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pending imports banner ── */}
      {pendingBatches.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">
              {pendingBatches.length} extração{pendingBatches.length > 1 ? 'ões' : ''} aguardando revisão
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {pendingBatches.map(batch => (
              <div key={batch.id} className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-800/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-slate-400 shrink-0">#{batch.id}</span>
                  <p className="text-sm font-semibold text-blue-900 dark:text-slate-100 truncate">{batch.file_name}</p>
                  {batch.status === 'AWAITING_COMPANY' && (
                    <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 shrink-0">
                      <Loader2 className="w-3 h-3 animate-spin" /> Cadastrando empresa...
                    </span>
                  )}
                  {batch.status === 'COMPANY_NOT_FOUND' && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">Empresa desconhecida</span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {batch.status === 'PENDING_REVIEW' && (
                    <button onClick={() => openBatchReview(batch.id)}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Revisar
                    </button>
                  )}
                  {batch.status === 'COMPANY_NOT_FOUND' && (
                    <button
                      onClick={() => setPendingDecision({ batchId: batch.id, cnpj: '', fileName: batch.file_name })}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" /> Decidir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header: Import button + title ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-blue-900 dark:text-slate-100">Formulários FORMP&D</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Bell className="w-3 h-3" /> Extraídos por IA e aprovados pelo consultor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="w-9 h-9 flex items-center justify-center rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 hover:bg-blue-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-xl shadow-lg shadow-violet-600/25 transition-all font-bold text-sm">
            <Sparkles className="w-4 h-4" /> Importar via IA
          </button>
        </div>
      </div>

      {/* ── Forms Table ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Carregando formulários...</p>
          </div>
        ) : forms.length === 0 ? (
          <div className="p-14 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-violet-50 dark:bg-violet-900/20 rounded-2xl flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-violet-300 dark:text-violet-700" />
            </div>
            <div>
              <p className="font-bold text-blue-900 dark:text-slate-100">Nenhum FORMP&D cadastrado</p>
              <p className="text-sm text-slate-500 mt-1">
                Use <strong>Importar via IA</strong> para enviar um PDF e extrair automaticamente os dados.
              </p>
            </div>
            <button onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-colors">
              <Sparkles className="w-4 h-4" /> Importar via IA
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-blue-50/50 dark:bg-slate-800/50 border-b border-blue-50 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Empresa</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Ano Base</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Projetos</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Benefício</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50 dark:divide-slate-800/60">
                {forms.map(form => {
                  const cfg = FORM_STATUS_CONFIG[form.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={form.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-blue-900 dark:text-slate-100 text-sm truncate max-w-[200px]">
                          {form.companies?.trade_name || form.companies?.legal_name}
                        </p>
                        <p className="text-xs font-mono text-slate-500">{fmtCnpj(form.companies?.cnpj || '')}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-2xl font-black text-blue-900 dark:text-slate-100">{form.base_year}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 text-xs font-bold rounded-lg bg-${cfg.color}-100 text-${cfg.color}-700 dark:bg-${cfg.color}-900/40 dark:text-${cfg.color}-400 flex items-center gap-1 w-fit`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-blue-900 dark:text-slate-100 text-sm">{form.formpd_projects.length}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {form.formpd_fiscal_incentives?.total_benefit
                          ? fmt(Number(form.formpd_fiscal_incentives.total_benefit))
                          : <span className="text-slate-400 font-normal text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(form.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => onSelectCompany?.(form.company_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Company Not Found Decision Modal ── */}
      <AnimatePresence>
        {pendingDecision && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center shrink-0">
                  <HelpCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-blue-900 dark:text-slate-100 text-lg">Empresa não cadastrada</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    O CNPJ{pendingDecision.cnpj && <> <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{fmtCnpj(pendingDecision.cnpj)}</span></>} extraído do documento não está no sistema.
                  </p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-slate-800 rounded-2xl p-4 text-sm text-blue-800 dark:text-blue-200">
                Deseja cadastrar esta empresa via ReceitaWS e prosseguir para a revisão do FORMP&D?
              </div>
              <div className="flex gap-3">
                <button onClick={handleDecline} disabled={declining || registering}
                  className="flex-1 py-3 rounded-2xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {declining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                  Não — Recusar
                </button>
                <button onClick={handleRegisterCompany} disabled={registering || declining}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                  Sim — Cadastrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Batch Review Modal (split-view) ── */}
      <AnimatePresence>
        {reviewItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-stretch bg-black/60 backdrop-blur-sm"
            onClick={() => setReviewItem(null)}
          >
            <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
              className="relative flex w-full h-full"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Left: PDF preview ── */}
              <div className="flex-1 min-w-0 bg-slate-800 flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/80 border-b border-slate-700">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-xs font-mono text-slate-400 truncate">{reviewItem.fileName}</span>
                </div>
                <iframe
                  src={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/imports/formpd/batches/${reviewItem.batchId}/pdf`}
                  className="flex-1 w-full border-none"
                  title="FORMP&D PDF"
                />
              </div>

              {/* ── Right: Review panel ── */}
              <div className="w-[420px] shrink-0 bg-white dark:bg-slate-900 flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-blue-50 dark:border-slate-800 flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-blue-900 dark:text-slate-100 text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-violet-500" /> Extração #{reviewItem.batchId}
                    </h3>
                  </div>
                  <button onClick={() => setReviewItem(null)} className="w-9 h-9 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors text-slate-400 flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                  {/* Company badge */}
                  {reviewItem.companyName ? (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">{reviewItem.companyName}</p>
                        {reviewItem.cnpjFromForm && <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{fmtCnpj(reviewItem.cnpjFromForm)}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Empresa não identificada — aprovação bloqueada</p>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                      <p className="text-xs text-slate-500">Ano Fiscal</p>
                      <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{reviewItem.fiscal_year || '—'}</p>
                    </div>
                    <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Projetos</p>
                      <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{reviewItem.projects?.length || 0}</p>
                    </div>
                    <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Benefício</p>
                      <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                        {fmt(reviewItem.fiscal_summary?.total_benefit_requested)}
                      </p>
                    </div>
                  </div>

                  {/* Projects */}
                  {reviewItem.projects && reviewItem.projects.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-blue-500" /> Projetos ({reviewItem.projects.length})
                      </p>
                      {reviewItem.projects.map((p: any, i: number) => {
                        const hrTotal = p.human_resources?.reduce((s: number, hr: any) => s + (hr.annual_amount || 0), 0) ?? 0;
                        const expTotal = p.expenses?.reduce((s: number, e: any) => s + (e.amount || 0), 0) ?? 0;
                        return (
                          <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-blue-50 dark:border-slate-700 overflow-hidden">
                            <button className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-50/40 dark:hover:bg-slate-700/30 transition-colors"
                              onClick={() => setExpandedProject(expandedProject === i ? null : i)}>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-blue-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-xs font-black text-blue-600 shrink-0">{i + 1}</div>
                                <div>
                                  <p className="font-bold text-blue-900 dark:text-slate-100 text-sm">{p.title}</p>
                                  <p className="text-xs text-slate-500">{CATEGORY_LABELS[p.category] || p.category}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {hrTotal > 0 && <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{fmt(hrTotal)}</span>}
                                {expTotal > 0 && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{fmt(expTotal)}</span>}
                                {expandedProject === i ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </button>
                            <AnimatePresence>
                              {expandedProject === i && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                  className="overflow-hidden border-t border-blue-50 dark:border-slate-700">
                                  <div className="p-4 grid grid-cols-2 gap-3">
                                    {p.human_resources?.length > 0 && (
                                      <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> RH</p>
                                        <div className="flex flex-col gap-1.5">
                                          {p.human_resources.slice(0, 4).map((hr: any, hi: number) => (
                                            <div key={hi} className="flex items-center justify-between p-2 bg-blue-50/50 dark:bg-slate-800 rounded-lg text-xs">
                                              <div>
                                                <p className="font-semibold truncate max-w-[80px]">{hr.name}</p>
                                                {hr.role && <p className="text-slate-500">{hr.role}</p>}
                                              </div>
                                              <div className="text-right shrink-0">
                                                {hr.annual_amount && <p className="font-bold text-blue-700 dark:text-blue-300">{fmt(hr.annual_amount)}</p>}
                                                {hr.dedication_pct && <p className="text-slate-400">{hr.dedication_pct}%</p>}
                                              </div>
                                            </div>
                                          ))}
                                          {p.human_resources.length > 4 && <p className="text-xs text-slate-400 text-center">+{p.human_resources.length - 4}</p>}
                                        </div>
                                      </div>
                                    )}
                                    {p.expenses?.length > 0 && (
                                      <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Layers className="w-3 h-3" /> Despesas</p>
                                        <div className="flex flex-col gap-1.5">
                                          {p.expenses.slice(0, 4).map((exp: any, ei: number) => (
                                            <div key={ei} className="flex items-center justify-between p-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg text-xs">
                                              <p className="text-slate-600 dark:text-slate-400 truncate max-w-[80px]">{exp.category || exp.description}</p>
                                              <p className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{fmt(exp.amount)}</p>
                                            </div>
                                          ))}
                                          {p.expenses.length > 4 && <p className="text-xs text-slate-400 text-center">+{p.expenses.length - 4}</p>}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions — pinned at bottom */}
                <div className="p-5 border-t border-blue-50 dark:border-slate-800 flex gap-3">
                  <button onClick={handleDiscard} disabled={discarding || approving}
                    className="flex-1 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                    {discarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />} Recusar
                  </button>
                  <button
                    disabled={!reviewItem.companyId || approving || discarding}
                    onClick={handleApprove}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-teal-700 transition-all">
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    {!reviewItem.companyId ? 'Bloqueado' : 'Aprovar e Salvar FORM'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload Modal ── */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <h3 className="font-black text-blue-900 dark:text-slate-100 text-xl flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" /> Importar FORM via IA
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Claude identifica empresa e ano-base do PDF. Se a empresa não estiver cadastrada, você será consultado.
                  </p>
                </div>
                <button onClick={() => setShowUploadModal(false)}
                  className="w-10 h-10 rounded-full hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8">
                <FormpdAiUpload onComplete={() => { setShowUploadModal(false); fetchPendingBatches(); }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
