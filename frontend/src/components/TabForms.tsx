import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, Upload, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Eye, Layers, ChevronRight, Server, Sparkles, Archive,
  TrendingUp, FileClock
} from 'lucide-react';
import FormpdAiUpload from './FormpdAiUpload';
import toast from 'react-hot-toast';

interface Props {
  companyId: number;
  cnpj: string;
}

interface ImportBatch {
  id: number;
  entity_type: string;
  file_name: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
  created_at: string;
}

interface StagingItem {
  id: number;
  batch_id: number;
  record_data: string;
  status: string;
  error_message?: string;
}

type View = 'dashboard' | 'upload' | 'review';

export default function TabImportacaoIA({ companyId, cnpj }: Props) {
  const [view, setView] = useState<View>('dashboard');
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [stagingItems, setStagingItems] = useState<StagingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await api.get('/imports/batches');
      // Filtrar apenas lotes do tipo IA deste módulo
      const formpdBatches = res.data.filter(
        (b: ImportBatch) => b.entity_type === 'FORMPD_AI_EXTRACTION'
      );
      setBatches(formpdBatches);
    } catch { /* silently fail */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchStagingItems = async (batch: ImportBatch) => {
    setLoadingItems(true);
    setSelectedBatch(batch);
    setView('review');
    try {
      const res = await api.get(`/imports/batches/${batch.id}/items`);
      setStagingItems(res.data.data || []);
    } catch {
      toast.error('Erro ao carregar dados de staging');
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    fetchBatches();
    socket.on('import:completed', () => fetchBatches());
    socket.on('import:progress', () => fetchBatches());
    return () => {
      socket.off('import:completed');
      socket.off('import:progress');
    };
  }, [fetchBatches]);

  const getStatusBadge = (status: string, size: 'sm' | 'md' = 'sm') => {
    const base = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
    switch (status) {
      case 'COMPLETED':
        return <span className={`${base} font-bold rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center gap-1`}><CheckCircle2 className="w-3 h-3" /> Concluído</span>;
      case 'PROCESSING':
        return <span className={`${base} font-bold rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 flex items-center gap-1.5`}><span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping" /> Processando</span>;
      case 'ERROR':
        return <span className={`${base} font-bold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 flex items-center gap-1`}><AlertCircle className="w-3 h-3" /> Erro</span>;
      default:
        return <span className={`${base} font-bold rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1`}><Clock className="w-3 h-3" /> Na fila</span>;
    }
  };

  // STATS
  const stats = {
    total: batches.length,
    completed: batches.filter(b => b.status === 'COMPLETED').length,
    processing: batches.filter(b => b.status === 'PROCESSING' || b.status === 'PENDING').length,
    errors: batches.filter(b => b.status === 'ERROR').length
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header com navegação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== 'dashboard' && (
            <button
              onClick={() => { setView('dashboard'); setSelectedBatch(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900 dark:text-slate-100">
                {view === 'upload' ? 'Nova Importação via IA' :
                  view === 'review' ? `Revisar Extração — Lote #${selectedBatch?.id}` :
                    'Importação de FORM via IA'}
              </h3>
              <p className="text-xs text-slate-500">
                {view === 'dashboard' ? 'Gerencie o fluxo de extração de PDFs externos' :
                  view === 'upload' ? 'Envie um PDF para extração automática pela IA' :
                    'Dados extraídos aguardando sua revisão'}
              </p>
            </div>
          </div>
        </div>

        {view === 'dashboard' && (
          <button
            onClick={() => setView('upload')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-xl shadow-lg shadow-violet-600/25 transition-all font-semibold text-sm"
          >
            <Upload className="w-4 h-4" /> Novo Upload de PDF
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* DASHBOARD */}
        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-6">

            {/* Explicação do fluxo */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/10 p-5 rounded-3xl border border-violet-100 dark:border-violet-800/50">
              <h4 className="font-bold text-violet-900 dark:text-violet-200 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Como funciona o fluxo de Importação via IA
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { step: '1', icon: Upload, label: 'Upload do PDF', desc: 'Envie o formulário FORMP&D ou folha em PDF' },
                  { step: '2', icon: BrainCircuit, label: 'Claude Analisa', desc: 'IA extrai dados estruturados automaticamente' },
                  { step: '3', icon: Eye, label: 'Você Revisa', desc: 'Confirme ou corrija os dados extraídos' },
                  { step: '4', icon: CheckCircle2, label: 'Promoção', desc: 'Dados aprovados alimentam os módulos do sistema' },
                ].map(({ step, icon: Icon, label, desc }) => (
                  <div key={step} className="flex items-start gap-3 p-3 bg-white/60 dark:bg-slate-900/60 rounded-2xl">
                    <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0">{step}</div>
                    <div>
                      <p className="font-bold text-violet-900 dark:text-violet-200 text-sm flex items-center gap-1">
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </p>
                      <p className="text-xs text-violet-600/80 dark:text-violet-400/80 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total de Extrações', value: stats.total, icon: Layers, color: 'blue' },
                { label: 'Concluídas', value: stats.completed, icon: CheckCircle2, color: 'emerald' },
                { label: 'Em Processamento', value: stats.processing, icon: FileClock, color: 'orange' },
                { label: 'Com Erro', value: stats.errors, icon: AlertCircle, color: 'red' },
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

            {/* Tabela de histórico */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between">
                <h4 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-500" /> Histórico de Extrações
                </h4>
                <button onClick={fetchBatches} className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                  <RefreshCw className="w-3 h-3" /> Atualizar
                </button>
              </div>

              {loading ? (
                <div className="p-10 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Carregando extrações...</p>
                </div>
              ) : batches.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-14 h-14 bg-violet-50 dark:bg-violet-900/20 rounded-2xl flex items-center justify-center">
                    <Archive className="w-7 h-7 text-violet-300 dark:text-violet-700" />
                  </div>
                  <p className="font-semibold text-blue-900 dark:text-slate-200">Nenhuma extração realizada</p>
                  <p className="text-sm text-slate-500">Clique em "Novo Upload de PDF" para começar a extrair dados com IA.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
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
                          <td className="px-5 py-4 text-sm font-bold text-slate-500 dark:text-slate-400">#{batch.id}</td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold text-blue-900 dark:text-slate-100 truncate max-w-[200px]">{batch.file_name}</p>
                            <p className="text-xs text-slate-500">{new Date(batch.created_at).toLocaleDateString('pt-BR')}</p>
                          </td>
                          <td className="px-5 py-4">{getStatusBadge(batch.status)}</td>
                          <td className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {new Date(batch.created_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {batch.status === 'COMPLETED' && (
                              <button
                                onClick={() => fetchStagingItems(batch)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" /> Revisar
                              </button>
                            )}
                            {batch.status === 'PROCESSING' || batch.status === 'PENDING' ? (
                              <span className="text-xs text-slate-400 flex items-center gap-1 justify-center">
                                <Clock className="w-3 h-3 animate-spin" /> Aguarde...
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* UPLOAD */}
        {view === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-violet-100 dark:border-violet-900/50 shadow-xl shadow-violet-500/10">
            <FormpdAiUpload
              companyId={companyId}
              cnpj={cnpj}
              onComplete={() => { fetchBatches(); setView('dashboard'); }}
            />
          </motion.div>
        )}

        {/* REVISÃO DO STAGING */}
        {view === 'review' && selectedBatch && (
          <motion.div key="review" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-5">

            <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-800">
              <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-violet-800 dark:text-violet-300">Dados extraídos pelo Claude — Lote #{selectedBatch.id}</p>
                <p className="text-xs text-violet-600 dark:text-violet-400">{selectedBatch.file_name}</p>
              </div>
              {getStatusBadge(selectedBatch.status, 'md')}
            </div>

            {loadingItems ? (
              <div className="p-10 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Carregando dados da IA...</p>
              </div>
            ) : stagingItems.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-slate-500">Nenhum dado encontrado neste lote.</p>
              </div>
            ) : (
              stagingItems.map(item => {
                let data: any = {};
                try { data = JSON.parse(item.record_data); } catch { data = {}; }
                const formData = data.form_data || data;

                return (
                  <div key={item.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800 overflow-hidden">
                    {/* Summary */}
                    <div className="p-5 border-b border-blue-50 dark:border-slate-800 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                        <p className="text-xs text-slate-500">Ano Fiscal</p>
                        <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{formData.fiscal_year || data.metadata?.base_year || '—'}</p>
                      </div>
                      <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                        <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Projetos</p>
                        <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{formData.projects?.length || 0}</p>
                      </div>
                      <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-2xl">
                        <p className="text-xs text-slate-500">Benefício Solicitado</p>
                        <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                          {formData.fiscal_summary?.total_benefit_requested
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.fiscal_summary.total_benefit_requested)
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* JSON raw para transparência */}
                    <div className="p-5">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Payload JSON extraído pela IA</p>
                      <pre className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-xs text-slate-600 dark:text-slate-300 overflow-auto max-h-80 font-mono">
                        {JSON.stringify(formData, null, 2)}
                      </pre>
                    </div>

                    {/* Ações */}
                    <div className="p-5 border-t border-blue-50 dark:border-slate-800 flex gap-3">
                      <button
                        onClick={() => { toast.error('Extração descartada.'); setView('dashboard'); }}
                        className="flex-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 font-bold text-sm transition-colors"
                      >
                        Descartar
                      </button>
                      <button
                        onClick={() => { toast.success('Dados aprovados! Encaminhados para promoção.'); setView('dashboard'); }}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all"
                      >
                        ✓ Aprovar e Promover
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
