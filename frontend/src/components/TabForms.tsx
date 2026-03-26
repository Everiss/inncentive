import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Clock, AlertCircle, RefreshCw,
  Eye, Layers, ChevronRight, Sparkles, Archive, FileClock,
  DollarSign, ChevronDown, ChevronUp, ClipboardList,
  ShieldAlert, ShieldCheck, ThumbsDown, ThumbsUp,
  TrendingUp, Users, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  companyId: number;
  cnpj: string;
}

type BatchStatus =
  | 'PENDING' | 'PROCESSING'
  | 'PENDING_REVIEW' | 'CNPJ_MISMATCH' | 'COMPANY_NOT_FOUND' | 'AWAITING_COMPANY'
  | 'APPROVED' | 'DISCARDED' | 'ERROR';

interface ImportBatch {
  id: number;
  entity_type: string;
  file_name: string;
  status: BatchStatus;
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
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

interface ReviewData {
  batch: ImportBatch;
  formData: any;
  cnpjFromForm: string | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  needsAi?: boolean;
  missingFields?: string[];
  detectedFamily?: string | null;
  submissionReceipt?: {
    sender_name?: string | null;
    sender_cpf?: string | null;
    expedition_at?: string | null;
    authenticity_code?: string | null;
  } | null;
  companyIdentification?: {
    fields?: Record<string, string>;
    qa?: Array<{ question: string; value: string }>;
    raw_text?: string;
  } | null;
  companyRegistry?: {
    fields?: Record<string, string>;
    raw_text?: string;
  } | null;
}

const fmt = (v?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtCnpj = (v: string) =>
  v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const normalizeSubmissionReceipt = (raw: any) => ({
  sender_name: raw?.sender_name ?? raw?.senderName ?? null,
  sender_cpf: raw?.sender_cpf ?? raw?.senderCpf ?? null,
  expedition_at: raw?.expedition_at ?? raw?.expeditionAt ?? null,
  authenticity_code: raw?.authenticity_code ?? raw?.authenticityCode ?? null,
});

const normalizeCompanyIdentification = (raw: any) => ({
  fields: (raw?.fields && typeof raw.fields === 'object') ? raw.fields : {},
  qa: Array.isArray(raw?.qa) ? raw.qa : [],
  raw_text: raw?.raw_text ?? '',
});

const normalizeCompanyRegistry = (raw: any) => ({
  fields: (raw?.fields && typeof raw.fields === 'object') ? raw.fields : {},
  raw_text: raw?.raw_text ?? '',
});

const COMPANY_IDENT_LABELS: Record<string, string> = {
  company_type: 'Tipo de Empresa',
  company_status: 'Situação da Empresa',
  benefits_law_11196_8248: 'Benefícios Lei 11.196/8.248',
  capital_origin: 'Origem do Capital',
  group_relationship: 'Relação com Grupo',
  gross_operational_revenue: 'Receita Operacional Bruta',
  net_revenue: 'Receita Líquida',
  employee_count_with_contract: 'Funcionários com Vínculo',
  closed_year_with_tax_loss: 'Fechou Ano com Prejuízo',
  irpj_csll_apportionment: 'Apuração IRPJ/CSLL',
  incentives_reason: 'Motivo Incentivos',
  rnd_organizational_structure: 'Estrutura Organizacional P&D',
};

const COMPANY_REGISTRY_LABELS: Record<string, string> = {
  situacao_na_receita: 'Situação na Receita',
  logradouro: 'Logradouro',
  numero: 'Número',
  sigla: 'Sigla',
  razao_social: 'Razão Social',
  natureza_juridica: 'Natureza Jurídica',
  data_fundacao: 'Data de Fundação',
  complemento: 'Complemento',
  tipo_endereco: 'Tipo de Endereço',
  representante_legal: 'Representante Legal',
  bairro: 'Bairro',
  cnae: 'CNAE',
  municipio: 'Município',
  cod_postal: 'Código Postal',
  cnpj: 'CNPJ',
  porte_da_empresa: 'Porte da Empresa',
};

const CATEGORY_LABELS: Record<string, string> = {
  PESQUISA_BASICA: 'Pesquisa Básica',
  PESQUISA_APLICADA: 'Pesquisa Aplicada',
  DESENVOLVIMENTO_EXPERIMENTAL: 'Desenvolvimento Experimental',
  INOVACAO_TECNOLOGICA: 'Inovação Tecnológica',
};

type View = 'dashboard' | 'review';

export default function TabImportacaoIA({ companyId, cnpj }: Props) {
  const [view, setView] = useState<View>('dashboard');
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [enqueueingAi, setEnqueueingAi] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await api.get('/imports/batches', {
        params: { companyId, entityType: 'FORMPD_AI_EXTRACTION', limit: 200 },
      });
      setBatches(res.data.data ?? res.data);
    } catch { /* silently fail */ } finally {
      setLoading(false);
    }
  }, [companyId]);

  const openReview = useCallback(async (batch: ImportBatch) => {
    setLoadingReview(true);
    setExpandedProject(null);
    try {
      const res = await api.get(`/imports/batches/${batch.id}/items`);
      const item = res.data.data?.[0];
      if (!item) { toast.error('Sem dados de extração neste lote.'); return; }

      let parsed: any = {};
      try { parsed = JSON.parse(item.record_data); } catch { /* */ }
      const formData = parsed.form_data || parsed;
      const submissionReceipt = normalizeSubmissionReceipt(
        parsed.submission_receipt || formData.submission_receipt || {},
      );
      const companyIdentification = normalizeCompanyIdentification(
        parsed.company_identification || formData.company_identification || {},
      );
      const companyRegistry = normalizeCompanyRegistry(
        parsed.company_registry || formData.company_registry || {},
      );
      const detectedFamily = parsed?.meta?.detected_version?.family ?? null;

      setReview({
        batch,
        formData,
        cnpjFromForm: parsed.cnpj_from_form ?? null,
        confidence: parsed.confidence ?? null,
        needsAi: Boolean(parsed.needs_ai),
        missingFields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
        detectedFamily,
        submissionReceipt,
        companyIdentification,
        companyRegistry,
      });
      setView('review');
    } catch {
      toast.error('Erro ao carregar dados da extração.');
    } finally {
      setLoadingReview(false);
    }
  }, []);

  const handleApprove = async () => {
    if (!review) return;
    setApproving(true);
    try {
      await api.post(`/imports/formpd/batches/${review.batch.id}/approve`);
      toast.success('FORMP&D aprovado e salvo com sucesso!');
      setView('dashboard');
      setReview(null);
      fetchBatches();
    } catch (e: any) {
      toast.error('Erro ao aprovar: ' + (e.response?.data?.message || e.message));
    } finally {
      setApproving(false);
    }
  };

  const handleDiscard = async () => {
    if (!review) return;
    setDiscarding(true);
    try {
      await api.post(`/imports/formpd/batches/${review.batch.id}/discard`);
      toast.success('Extração descartada.');
      setView('dashboard');
      setReview(null);
      fetchBatches();
    } catch (e: any) {
      toast.error('Erro ao descartar: ' + (e.response?.data?.message || e.message));
    } finally {
      setDiscarding(false);
    }
  };

  const handleEnqueueAi = async () => {
    if (!review) return;
    setEnqueueingAi(true);
    try {
      await api.post(`/imports/formpd/batches/${review.batch.id}/enqueue-ai`, {
        fields: review.missingFields || [],
      });
      toast.success('IA enfileirada para completar os campos faltantes.');
      fetchBatches();
    } catch (e: any) {
      toast.error('Erro ao enfileirar IA: ' + (e.response?.data?.message || e.message));
    } finally {
      setEnqueueingAi(false);
    }
  };

  useEffect(() => {
    fetchBatches();

    const handler = (payload: FormpdCompletedPayload) => {
      // Only react to events for batches belonging to this company
      if (payload.companyId !== companyId && payload.status !== 'CNPJ_MISMATCH') return;

      fetchBatches();

      if (payload.status === 'CNPJ_MISMATCH') {
        toast.error(
          `CNPJ do documento não pertence a esta empresa. Arquivo movido para a pasta de recusados.`,
          { duration: 8000 }
        );
      } else if (payload.status === 'PENDING_REVIEW') {
        toast.success('FORMP&D extraído! Clique em "Revisar" para validar os dados.', { duration: 6000 });
      } else if (payload.status === 'INVALID_FORMPD') {
        toast.error('O documento não foi reconhecido como um FORMP&D válido.', { duration: 8000 });
      } else if (payload.status === 'ERROR') {
        toast.error(`Erro na extração: ${payload.errorMessage || 'verifique o arquivo e tente novamente.'}`, { duration: 8000 });
      }
    };

    socket.on('formpd:completed', handler);
    return () => { socket.off('formpd:completed', handler); };
  }, [fetchBatches, companyId]);

  const getStatusBadge = (status: BatchStatus) => {
    switch (status) {
      case 'APPROVED': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Aprovado
        </span>
      );
      case 'PENDING_REVIEW': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 flex items-center gap-1">
          <Eye className="w-3 h-3" /> Aguardando revisão
        </span>
      );
      case 'PROCESSING': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping" /> Processando
        </span>
      );
      case 'CNPJ_MISMATCH': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> CNPJ divergente
        </span>
      );
      case 'DISCARDED': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 flex items-center gap-1">
          <ThumbsDown className="w-3 h-3" /> Descartado
        </span>
      );
      case 'ERROR': return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Erro
        </span>
      );
      default: return (
        <span className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Na fila
        </span>
      );
    }
  };

  const stats = {
    total: batches.length,
    approved: batches.filter(b => b.status === 'APPROVED').length,
    pending: batches.filter(b => b.status === 'PENDING_REVIEW').length,
    errors: batches.filter(b => b.status === 'ERROR' || b.status === 'CNPJ_MISMATCH').length,
  };

  return (
    <div className="flex flex-col gap-6">

      {view !== 'dashboard' && (
        <button
          onClick={() => { setView('dashboard'); setReview(null); }}
          className="self-start flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Voltar ao histórico
        </button>
      )}

      <AnimatePresence mode="wait">

        {/* ── DASHBOARD ── */}
        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-6">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total de Extrações', value: stats.total, icon: Layers, color: 'blue' },
                { label: 'Aprovados', value: stats.approved, icon: CheckCircle2, color: 'emerald' },
                { label: 'Aguardando Revisão', value: stats.pending, icon: FileClock, color: 'violet' },
                { label: 'Com Divergência/Erro', value: stats.errors, icon: AlertCircle, color: 'red' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-50 dark:border-slate-800 flex items-center gap-3">
                  <div className={`w-10 h-10 bg-${color}-50 dark:bg-${color}-900/30 rounded-xl flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 text-${color}-500`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">{label}</p>
                    <p className="text-xl font-black text-blue-900 dark:text-slate-100">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Histórico */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between">
                <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-500" /> Histórico de Extrações
                </h4>
                <button onClick={fetchBatches} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                  <RefreshCw className="w-3 h-3" /> Atualizar
                </button>
              </div>

              {loading ? (
                <div className="p-10 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Carregando...</p>
                </div>
              ) : batches.length === 0 ? (
                <div className="p-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-violet-50 dark:bg-violet-900/20 rounded-2xl flex items-center justify-center">
                    <Archive className="w-7 h-7 text-violet-300 dark:text-violet-700" />
                  </div>
                  <p className="font-semibold text-blue-900 dark:text-slate-200">Nenhuma extração para esta empresa</p>
                  <p className="text-sm text-slate-500">Acesse o menu FORMs para importar novos arquivos.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-blue-50/50 dark:bg-slate-800/50 border-b border-blue-50 dark:border-slate-800">
                      <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Lote</th>
                      <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Arquivo</th>
                      <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Data</th>
                      <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50 dark:divide-slate-800/60">
                    {batches.map(batch => (
                      <tr key={batch.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-4 text-sm font-bold text-slate-400">#{batch.id}</td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-blue-900 dark:text-slate-100 truncate max-w-[220px]">{batch.file_name}</p>
                        </td>
                        <td className="px-5 py-4">{getStatusBadge(batch.status)}</td>
                        <td className="px-5 py-4 text-sm text-slate-500">
                          {new Date(batch.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {batch.status === 'PENDING_REVIEW' && (
                            <button
                              onClick={() => openReview(batch)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> Revisar
                            </button>
                          )}
                          {batch.status === 'APPROVED' && (
                            <button
                              onClick={() => openReview(batch)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver
                            </button>
                          )}
                          {(batch.status === 'PROCESSING' || batch.status === 'PENDING') && (
                            <span className="text-xs text-slate-400 flex items-center gap-1 justify-center">
                              <Clock className="w-3 h-3 animate-pulse" /> Aguardando...
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {view === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-5">

            {loadingReview ? (
              <div className="p-16 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Carregando dados da IA...</p>
              </div>
            ) : review ? (
              <ReviewPanel
                review={review}
                cnpj={cnpj}
                expandedProject={expandedProject}
                setExpandedProject={setExpandedProject}
                approving={approving}
                discarding={discarding}
                enqueueingAi={enqueueingAi}
                onApprove={handleApprove}
                onDiscard={handleDiscard}
                onEnqueueAi={handleEnqueueAi}
              />
            ) : null}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ─── Review Panel ────────────────────────────────────────────────────────────

function ReviewPanel({
  review, cnpj, expandedProject, setExpandedProject, approving, discarding, enqueueingAi, onApprove, onDiscard, onEnqueueAi,
}: {
  review: ReviewData;
  cnpj: string;
  expandedProject: number | null;
  setExpandedProject: (i: number | null) => void;
  approving: boolean;
  discarding: boolean;
  enqueueingAi: boolean;
  onApprove: () => void;
  onDiscard: () => void;
  onEnqueueAi: () => void;
}) {
  const { formData, cnpjFromForm, submissionReceipt, companyIdentification, companyRegistry, confidence, needsAi, missingFields, detectedFamily } = review;
  const normalizedCnpj = cnpj.replace(/\D/g, '');
  const cnpjMatch = !!cnpjFromForm && cnpjFromForm === normalizedCnpj;
  const isApproved = review.batch.status === 'APPROVED';

  return (
    <>
      {/* Banner IA */}
      <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-800">
        <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-violet-800 dark:text-violet-300">
            Dados extraídos pelo Claude — Lote #{review.batch.id}
          </p>
          <p className="text-xs text-violet-600 dark:text-violet-400 truncate">{review.batch.file_name}</p>
        </div>
        {isApproved && (
          <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Aprovado
          </span>
        )}
      </div>

      {/* CNPJ validation banner */}
      {cnpjMatch ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">CNPJ validado — documento pertence a esta empresa</p>
            <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{fmtCnpj(normalizedCnpj)}</p>
          </div>
        </div>
      ) : cnpjFromForm ? (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 dark:text-red-400 text-sm">CNPJ divergente — documento não pertence a esta empresa</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
              Documento: <span className="font-mono font-bold">{fmtCnpj(cnpjFromForm)}</span> ·
              Esta empresa: <span className="font-mono font-bold">{fmtCnpj(normalizedCnpj)}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300 font-semibold">
            Não foi possível identificar o CNPJ no documento.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800">
          <p className="text-xs text-slate-500">Ano Fiscal</p>
          <p className="text-3xl font-black text-blue-900 dark:text-slate-100">{formData.fiscal_year || '—'}</p>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Projetos</p>
          <p className="text-3xl font-black text-blue-900 dark:text-slate-100">{formData.projects?.length ?? 0}</p>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800 col-span-2 md:col-span-1">
          <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Benefício Solicitado</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">
            {fmt(formData.fiscal_summary?.total_benefit_requested)}
          </p>
          {formData.fiscal_summary?.total_rnd_expenditure && (
            <p className="text-xs text-slate-500 mt-0.5">P&D: {fmt(formData.fiscal_summary.total_rnd_expenditure)}</p>
          )}
        </div>
      </div>

      {(needsAi || (missingFields?.length ?? 0) > 0) && (
        <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-800">
          <p className="text-sm font-bold text-violet-800 dark:text-violet-300">IA recomendada por política</p>
          <p className="text-xs text-violet-700/80 dark:text-violet-400 mt-1">
            Confiança: <span className="font-semibold">{confidence || 'N/A'}</span>
            {detectedFamily ? (
              <>
                {' '}· Família: <span className="font-mono">{detectedFamily}</span>
              </>
            ) : null}
          </p>
          {(missingFields?.length ?? 0) > 0 && (
            <p className="text-xs text-violet-700/80 dark:text-violet-400 mt-2 break-words">
              Campos faltantes: {(missingFields || []).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Recibo de Entrega */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800">
        <p className="text-sm font-bold text-blue-900 dark:text-slate-100 mb-3">Recibo de Entrega</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500">Remetente</p>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{submissionReceipt?.sender_name || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">CPF</p>
            <p className="font-mono text-slate-700 dark:text-slate-200">{submissionReceipt?.sender_cpf || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Expedição</p>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{submissionReceipt?.expedition_at || '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Código de Autenticidade</p>
            <p className="font-mono text-slate-700 dark:text-slate-200 break-all">{submissionReceipt?.authenticity_code || '—'}</p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800">
        <p className="text-sm font-bold text-blue-900 dark:text-slate-100 mb-3">Dados Pessoa Jurídica</p>
        {Object.keys(companyRegistry?.fields || {}).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Object.entries(companyRegistry?.fields || {}).map(([k, v]) => (
              <div key={k}>
                <p className="text-slate-500">{COMPANY_REGISTRY_LABELS[k] || k}</p>
                <p className="font-semibold text-slate-700 dark:text-slate-200">{String(v || '—')}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Sem campos estruturados para este bloco.</p>
        )}
      </div>

      {/* Identificação/Características da Empresa */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800">
        <p className="text-sm font-bold text-blue-900 dark:text-slate-100 mb-3">Identificação da Empresa</p>
        {Object.keys(companyIdentification?.fields || {}).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Object.entries(companyIdentification?.fields || {}).map(([k, v]) => (
              <div key={k}>
                <p className="text-slate-500">{COMPANY_IDENT_LABELS[k] || k}</p>
                <p className="font-semibold text-slate-700 dark:text-slate-200">{String(v || '—')}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Sem campos estruturados para este bloco.</p>
        )}
      </div>

      {/* Projetos */}
      {formData.projects?.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-500" />
            Projetos Extraídos ({formData.projects.length})
          </h4>

          {formData.projects.map((proj: any, i: number) => {
            const hrTotal = proj.human_resources?.reduce((s: number, hr: any) => s + (hr.annual_amount || 0), 0) ?? 0;
            const expTotal = proj.expenses?.reduce((s: number, e: any) => s + (e.amount || 0), 0) ?? 0;

            return (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50/40 dark:hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedProject(expandedProject === i ? null : i)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-sm font-black text-blue-600 shrink-0">{i + 1}</div>
                    <div>
                      <p className="font-bold text-blue-900 dark:text-slate-100 text-sm">{proj.title}</p>
                      <p className="text-xs text-slate-500">
                        {CATEGORY_LABELS[proj.category] || proj.category}
                        {proj.is_continuous && ' · Projeto Contínuo'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {hrTotal > 0 && (
                      <div className="hidden md:block text-right">
                        <p className="text-[10px] text-slate-400">RH</p>
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">{fmt(hrTotal)}</p>
                      </div>
                    )}
                    {expTotal > 0 && (
                      <div className="hidden md:block text-right">
                        <p className="text-[10px] text-slate-400">Despesas</p>
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{fmt(expTotal)}</p>
                      </div>
                    )}
                    {expandedProject === i
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedProject === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden border-t border-blue-50 dark:border-slate-800">
                      <div className="p-4 flex flex-col gap-4">
                        {proj.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{proj.description}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {proj.human_resources?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Recursos Humanos ({proj.human_resources.length})
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {proj.human_resources.slice(0, 5).map((hr: any, hi: number) => (
                                  <div key={hi} className="flex items-center justify-between p-2 bg-blue-50/50 dark:bg-slate-800/50 rounded-xl text-xs">
                                    <div>
                                      <p className="font-semibold text-blue-900 dark:text-slate-100 truncate max-w-[140px]">{hr.name}</p>
                                      {hr.role && <p className="text-slate-500">{hr.role}</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                      {hr.annual_amount && <p className="font-bold text-blue-700 dark:text-blue-300">{fmt(hr.annual_amount)}</p>}
                                      {hr.dedication_pct && <p className="text-slate-400">{hr.dedication_pct}%</p>}
                                    </div>
                                  </div>
                                ))}
                                {proj.human_resources.length > 5 && (
                                  <p className="text-xs text-slate-400 text-center">+{proj.human_resources.length - 5} colaboradores</p>
                                )}
                              </div>
                            </div>
                          )}
                          {proj.expenses?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <DollarSign className="w-3 h-3" /> Despesas ({proj.expenses.length})
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {proj.expenses.slice(0, 5).map((exp: any, ei: number) => (
                                  <div key={ei} className="flex items-center justify-between p-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl text-xs">
                                    <p className="text-slate-600 dark:text-slate-400 truncate max-w-[140px]">{exp.category || exp.description}</p>
                                    <p className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{fmt(exp.amount)}</p>
                                  </div>
                                ))}
                                {proj.expenses.length > 5 && (
                                  <p className="text-xs text-slate-400 text-center">+{proj.expenses.length - 5} despesas</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Ações */}
      {!isApproved && (
        <div className="flex gap-3 pt-2 sticky bottom-0 bg-transparent">
          {(needsAi || (missingFields?.length ?? 0) > 0) && (
            <button
              onClick={onEnqueueAi}
              disabled={enqueueingAi || discarding || approving}
              className="flex-1 py-3 rounded-2xl border-2 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/20 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {enqueueingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Enfileirar IA
            </button>
          )}
          <button
            onClick={onDiscard}
            disabled={discarding || approving}
            className="flex-1 py-3 rounded-2xl border-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {discarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
            Descartar
          </button>
          <button
            disabled={!cnpjMatch || approving || discarding}
            onClick={onApprove}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
            {!cnpjMatch && cnpjFromForm ? 'Aprovação Bloqueada — CNPJ divergente' : 'Aprovar e Salvar'}
          </button>
        </div>
      )}
    </>
  );
}
