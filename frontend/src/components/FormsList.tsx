import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet, BrainCircuit, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Eye, Building2, Calendar, TrendingUp, Filter, Sparkles,
  Search, Bell, Loader2, ShieldCheck, ShieldAlert, X, ThumbsUp, ThumbsDown,
  Layers, DollarSign, ChevronDown, ChevronUp, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FormpdAiUpload from './FormpdAiUpload';

interface FormsBatch {
  id: number;
  company_id?: number;
  entity_type: string;
  file_name: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
  created_at: string;
}

interface FormpdCompletedPayload {
  batchId: number;
  isValidFormpd: boolean;
  validationError?: string;
  cnpjFromForm: string | null;
  companyId: number | null;
  companyName: string | null;
  companyRegistrationQueued: boolean;
}

interface ExtractedForm {
  batchId: number;
  fileName: string;
  fiscal_year?: number;
  projects?: any[];
  fiscal_summary?: any;
  status: string;
  created_at: string;
  cnpjFromForm?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  companyRegistrationQueued?: boolean;
}

const fmt = (v?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtCnpj = (v: string) =>
  v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const CATEGORY_LABELS: Record<string, string> = {
  PESQUISA_BASICA: 'Pesquisa Básica',
  PESQUISA_APLICADA: 'Pesquisa Aplicada',
  DESENVOLVIMENTO_EXPERIMENTAL: 'Desenvolvimento Experimental',
  INOVACAO_TECNOLOGICA: 'Inovação Tecnológica',
};

export default function FormsList() {
  const [batches, setBatches] = useState<FormsBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selected, setSelected] = useState<ExtractedForm | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await api.get('/imports/batches');
      const forms = res.data.filter(
        (b: FormsBatch) => b.entity_type === 'FORMPD_AI_EXTRACTION'
      );
      setBatches(forms);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Open the review modal for a given batchId
  const openDetailById = useCallback(async (batchId: number) => {
    try {
      const [batchRes, itemsRes] = await Promise.all([
        api.get('/imports/batches'),
        api.get(`/imports/batches/${batchId}/items`),
      ]);
      const batch = batchRes.data.find((b: FormsBatch) => b.id === batchId);
      const item = itemsRes.data.data?.[0];
      if (!item) return;

      let parsed: any = {};
      try { parsed = JSON.parse(item.record_data); } catch { /* */ }

      const formData = parsed.form_data || parsed;
      setSelected({
        batchId,
        fileName: batch?.file_name ?? `Lote #${batchId}`,
        fiscal_year: formData.fiscal_year,
        projects: formData.projects || [],
        fiscal_summary: formData.fiscal_summary,
        status: item.status,
        created_at: batch?.created_at ?? new Date().toISOString(),
        cnpjFromForm: parsed.cnpj_from_form ?? null,
        companyId: parsed.company_id ?? null,
        companyName: parsed.company_name ?? null,
        companyRegistrationQueued: parsed.company_registration_queued ?? false,
      });
      setExpandedProject(null);
    } catch {
      toast.error('Erro ao abrir formulário.');
    }
  }, []);

  // Global formpd:completed handler — shows persistent notification toast
  useEffect(() => {
    const handler = (payload: FormpdCompletedPayload) => {
      fetchAll();

      if (!payload.isValidFormpd) {
        toast.error(
          payload.validationError || 'Documento não reconhecido como FORMP&D válido.',
          { duration: 8000 }
        );
        return;
      }

      // Rich persistent notification
      toast.custom(
        (t) => (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex items-start gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-black/10 border border-blue-100 dark:border-slate-700 max-w-sm w-full ${t.visible ? '' : 'opacity-0'}`}
          >
            {/* Icon */}
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-blue-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                FORMP&D Extraído!
              </p>

              {payload.companyName && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate font-semibold">
                  {payload.companyName}
                </p>
              )}

              {payload.cnpjFromForm && (
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {fmtCnpj(payload.cnpjFromForm)}
                </p>
              )}

              {payload.companyRegistrationQueued && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    Cadastrando empresa automaticamente...
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    openDetailById(payload.batchId);
                  }}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Revisar Dados →
                </button>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Dispensar
                </button>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ),
        { duration: Infinity, position: 'top-right' }
      );
    };

    socket.on('formpd:completed', handler);
    return () => { socket.off('formpd:completed', handler); };
  }, [fetchAll, openDetailById]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = batches.filter(b => {
    const matchesSearch = search === '' || b.file_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || b.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: batches.length,
    completed: batches.filter(b => b.status === 'COMPLETED').length,
    processing: batches.filter(b => b.status === 'PROCESSING' || b.status === 'PENDING').length,
    errors: batches.filter(b => b.status === 'ERROR').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <span className="px-2 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Concluído</span>;
      case 'PROCESSING': return <span className="px-2 py-1 text-xs font-bold rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" /> Processando</span>;
      case 'ERROR': return <span className="px-2 py-1 text-xs font-bold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Erro</span>;
      default: return <span className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Na fila</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Forms', value: stats.total, icon: FileSpreadsheet, color: 'blue' },
          { label: 'Extraídos', value: stats.completed, icon: CheckCircle2, color: 'emerald' },
          { label: 'Em processamento', value: stats.processing, icon: Clock, color: 'orange' },
          { label: 'Com erros', value: stats.errors, icon: AlertCircle, color: 'red' },
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

      {/* IA Banner + Import Button */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-blue-900 dark:text-blue-200 text-sm">Motor IA — Extração Assíncrona por BullMQ</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mt-0.5">
            <Bell className="w-3 h-3" />
            Você será notificado quando a análise do FORMP&D terminar.
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all font-bold text-sm"
        >
          <Sparkles className="w-4 h-4 text-blue-200" /> Importar novo FORM
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome de arquivo..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="ALL">Todos</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="PROCESSING">Processando</option>
            <option value="PENDING">Na fila</option>
            <option value="ERROR">Com erro</option>
          </select>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-blue-600 hover:bg-blue-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Carregando formulários...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-14 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 bg-violet-50 dark:bg-violet-900/20 rounded-2xl flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-violet-300 dark:text-violet-700" />
              </div>
              <div>
                <p className="font-bold text-blue-900 dark:text-slate-100">Nenhum FORM encontrado</p>
                <p className="text-sm text-slate-500 mt-1">Clique em <strong>Importar novo FORM</strong> para enviar um PDF via IA.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-blue-50/50 dark:bg-slate-800/50 border-b border-blue-50 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Lote</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Arquivo</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Empresa</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50 dark:divide-slate-800/60">
                {filtered.map(batch => (
                  <tr key={batch.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-slate-400">#{batch.id}</td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-blue-900 dark:text-slate-100 text-sm truncate max-w-[200px]">{batch.file_name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> extraído pelo Claude
                      </span>
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(batch.status)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(batch.created_at).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {batch.status === 'COMPLETED' && (
                        <button
                          onClick={() => openDetailById(batch.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Review Modal ── */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-blue-50 dark:border-slate-800 flex items-start justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                <div>
                  <h3 className="font-bold text-blue-900 dark:text-slate-100 text-lg">FORM #{selected.batchId}</h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs mt-0.5">{selected.fileName}</p>
                </div>
                <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors text-slate-400 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-5">
                {/* Company status */}
                {selected.companyRegistrationQueued ? (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
                    <Loader2 className="w-5 h-5 text-amber-600 shrink-0 animate-spin mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-700 dark:text-amber-300 text-sm">Empresa em Cadastramento Automático</p>
                      {selected.cnpjFromForm && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          CNPJ <span className="font-mono font-bold">{fmtCnpj(selected.cnpjFromForm)}</span> — consulta ReceitaWS enfileirada com alta prioridade.
                        </p>
                      )}
                    </div>
                  </div>
                ) : selected.companyName ? (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">{selected.companyName}</p>
                      {selected.cnpjFromForm && (
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{fmtCnpj(selected.cnpjFromForm)}</p>
                      )}
                    </div>
                  </div>
                ) : selected.status === 'INVALID_FORMPD' ? (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-700 dark:text-red-400 text-sm">Documento não reconhecido como FORMP&D</p>
                      <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">O documento não possui a estrutura esperada de um formulário FORMP&D.</p>
                    </div>
                  </div>
                ) : null}

                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-xs text-slate-500">Ano Fiscal</p>
                    <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{selected.fiscal_year || '—'}</p>
                  </div>
                  <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Projetos</p>
                    <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{selected.projects?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl col-span-2 md:col-span-1">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Benefício Req.</p>
                    <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                      {fmt(selected.fiscal_summary?.total_benefit_requested)}
                    </p>
                  </div>
                </div>

                {/* Projects */}
                {selected.projects && selected.projects.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-blue-500" /> Projetos Extraídos
                    </p>
                    {selected.projects.map((p: any, i: number) => (
                      <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-blue-50 dark:border-slate-700 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50/40 dark:hover:bg-slate-700/30 transition-colors"
                          onClick={() => setExpandedProject(expandedProject === i ? null : i)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-xs font-black text-blue-600 dark:text-blue-400 shrink-0">
                              {i + 1}
                            </div>
                            <div>
                              <p className="font-bold text-blue-900 dark:text-slate-100 text-sm">{p.title}</p>
                              <p className="text-xs text-slate-500">{CATEGORY_LABELS[p.category] || p.category}</p>
                            </div>
                          </div>
                          {expandedProject === i ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        <AnimatePresence>
                          {expandedProject === i && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                              className="overflow-hidden border-t border-blue-50 dark:border-slate-700">
                              <div className="p-4">
                                <p className="text-sm text-slate-600 dark:text-slate-400">{p.description}</p>
                                {(p.hr_summary || p.expenses) && (
                                  <div className="grid grid-cols-2 gap-3 mt-3">
                                    {p.hr_summary && (
                                      <div className="flex items-center gap-2 p-3 bg-blue-50/50 dark:bg-slate-800 rounded-xl">
                                        <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                                        <div>
                                          <p className="text-xs text-slate-500">Total RH</p>
                                          <p className="font-bold text-sm text-blue-900 dark:text-slate-100">{fmt(p.hr_summary.total_amount)}</p>
                                        </div>
                                      </div>
                                    )}
                                    {p.expenses && (
                                      <div className="flex items-center gap-2 p-3 bg-blue-50/50 dark:bg-slate-800 rounded-xl">
                                        <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
                                        <div>
                                          <p className="text-xs text-slate-500">Total Despesas</p>
                                          <p className="font-bold text-sm text-blue-900 dark:text-slate-100">{fmt(p.expenses.total_amount)}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setSelected(null)}
                    className="flex-1 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                    <ThumbsDown className="w-4 h-4" /> Descartar
                  </button>
                  <button
                    disabled={selected.status === 'INVALID_FORMPD'}
                    onClick={() => {
                      toast.success('Formulário aprovado para promoção!');
                      setSelected(null);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-teal-700 transition-all"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    {selected.status === 'INVALID_FORMPD' ? 'Aprovação Bloqueada' : 'Aprovar FORM'}
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
              className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <h3 className="font-black text-blue-900 dark:text-slate-100 text-xl flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" /> Importar FORM via IA
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    O Claude identifica empresa e ano-base diretamente do PDF.
                  </p>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="w-10 h-10 rounded-full hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8">
                <FormpdAiUpload
                  onComplete={() => setShowUploadModal(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
