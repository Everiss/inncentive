import { useEffect, useState, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import {
  Server, CheckCircle2, AlertCircle, Clock, Eye, Pause, Play,
  RefreshCw, RotateCcw, Send, GitBranch, Search, ChevronLeft, ChevronRight, PauseCircle,
} from 'lucide-react';
import { ImportBatchItemsModal } from './modals/ImportBatchItemsModal';
import { ImportBatchTraceModal } from './modals/ImportBatchTraceModal';

interface ImportBatch {
  id: number;
  entity_type: string;
  file_name: string;
  status:
    | 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED'
    | 'PENDING_REVIEW' | 'APPROVED' | 'DISCARDED'
    | 'CNPJ_MISMATCH' | 'COMPANY_NOT_FOUND' | 'AWAITING_COMPANY' | 'ERROR';
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
  created_at: string;
}

const QUEUE_NAMES = [
  { key: 'formpd-extraction', label: 'FORMPD' },
  { key: 'import-cnpjs',      label: 'CNPJs'  },
] as const;
type QueueName = typeof QUEUE_NAMES[number]['key'];

export default function ImportBatchesList() {
  const [batches, setBatches]           = useState<ImportBatch[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [loading, setLoading]           = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [traceBatch, setTraceBatch]     = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeQueue, setActiveQueue]   = useState<QueueName>('formpd-extraction');
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueInfo, setQueueInfo]       = useState<Record<QueueName, { paused: boolean; counts: Record<string, number> } | null>>({
    'formpd-extraction': null,
    'import-cnpjs':      null,
  });

  const LIMIT = 20;
  const totalPages = Math.ceil(total / LIMIT);

  const fetchBatches = useCallback((p = page, s = search) => {
    setLoading(true);
    const params: Record<string, any> = { page: p, limit: LIMIT };
    if (s) params.search = s;
    api.get('/imports/batches', { params })
      .then(res => {
        setBatches(res.data.data ?? res.data);
        setTotal(res.data.total ?? res.data.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search]);

  const fetchQueueStatus = useCallback((name: QueueName = activeQueue) => {
    setQueueLoading(true);
    api.get(`/queue-admin/queues/${name}/status`)
      .then(res => setQueueInfo(prev => ({ ...prev, [name]: res.data })))
      .catch(console.error)
      .finally(() => setQueueLoading(false));
  }, [activeQueue]);

  const pauseQueue = async () => {
    setActionLoading('pause');
    try { await api.post(`/queue-admin/queues/${activeQueue}/pause`); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const resumeQueue = async () => {
    setActionLoading('resume');
    try { await api.post(`/queue-admin/queues/${activeQueue}/resume`); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const pauseBatchJob = async (batchId: number, entityType: string) => {
    const queue = entityType?.includes('FORMPD') ? 'formpd-extraction' : 'import-cnpjs';
    setActionLoading(`pause-job-${batchId}`);
    try { await api.post(`/queue-admin/batches/${batchId}/pause-job?queue=${queue}`); fetchBatches(); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const resumeBatchJob = async (batchId: number, entityType: string) => {
    const queue = entityType?.includes('FORMPD') ? 'formpd-extraction' : 'import-cnpjs';
    setActionLoading(`resume-job-${batchId}`);
    try { await api.post(`/queue-admin/batches/${batchId}/resume-job?queue=${queue}`); fetchBatches(); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const requeuePending = async (batchId: number, entityType: string) => {
    const queue = entityType === 'FORMPD_AI_EXTRACTION' ? 'formpd-extraction' : 'import-cnpjs';
    setActionLoading(`requeue-${batchId}`);
    try { await api.post(`/queue-admin/batches/${batchId}/requeue-pending?queue=${queue}`); fetchBatches(); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const retryFailed = async (batchId: number, entityType: string) => {
    const queue = entityType === 'FORMPD_AI_EXTRACTION' ? 'formpd-extraction' : 'import-cnpjs';
    setActionLoading(`retry-${batchId}`);
    try { await api.post(`/queue-admin/batches/${batchId}/retry-failed?queue=${queue}`); fetchBatches(); fetchQueueStatus(); }
    catch (e) { console.error(e); } finally { setActionLoading(null); }
  };

  const reparseFormpd = async (batchId: number) => {
    setActionLoading(`reparse-formpd-${batchId}`);
    try {
      await api.post(`/imports/formpd/batches/${batchId}/reparse`);
      fetchBatches();
      fetchQueueStatus('formpd-extraction');
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  // Search: debounce 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { fetchBatches(page, search); }, [page, search]);

  useEffect(() => {
    fetchQueueStatus('formpd-extraction');
    fetchQueueStatus('import-cnpjs');

    const interval = setInterval(() => {
      fetchBatches();
      fetchQueueStatus('formpd-extraction');
      fetchQueueStatus('import-cnpjs');
    }, 15000);

    socket.on('import:progress', () => { fetchBatches(); });
    socket.on('import:completed', () => { fetchBatches(); });

    return () => {
      clearInterval(interval);
      socket.off('import:progress');
      socket.off('import:completed');
    };
  }, []);

  const activeQueueInfo = queueInfo[activeQueue];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':        return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">Concluído</span>;
      case 'PROCESSING':       return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping" /> Processando</span>;
      case 'FAILED':           return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Falhou</span>;
      case 'PENDING_REVIEW':   return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400">Ag. Revisão</span>;
      case 'APPROVED':         return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">Aprovado</span>;
      case 'PAUSED':           return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 flex items-center gap-1.5"><PauseCircle className="w-3 h-3" /> Pausado</span>;
      case 'DISCARDED':        return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Descartado</span>;
      case 'CNPJ_MISMATCH':    return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">CNPJ Divergente</span>;
      case 'COMPANY_NOT_FOUND': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">Empresa N/C</span>;
      case 'AWAITING_COMPANY': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">Ag. Cadastro</span>;
      case 'ERROR':            return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Erro</span>;
      default:                 return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Na Fila</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Queue control ── */}
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            <h4 className="text-sm font-bold text-blue-900 dark:text-slate-100">Controle da Fila Redis</h4>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${activeQueueInfo?.paused ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {activeQueueInfo?.paused ? 'Pausada' : 'Ativa'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Queue selector */}
            <div className="flex rounded-lg overflow-hidden border border-blue-200 dark:border-slate-700 text-xs font-semibold">
              {QUEUE_NAMES.map(q => (
                <button
                  key={q.key}
                  onClick={() => { setActiveQueue(q.key); fetchQueueStatus(q.key); }}
                  className={`px-3 py-1.5 transition-colors ${activeQueue === q.key
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
                >{q.label}</button>
              ))}
            </div>

            <button
              onClick={() => fetchQueueStatus()}
              disabled={queueLoading || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Atualizar</span>
            </button>
            <button
              onClick={pauseQueue}
              disabled={!!activeQueueInfo?.paused || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> Pausar</span>
            </button>
            <button
              onClick={resumeQueue}
              disabled={!activeQueueInfo?.paused || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Retomar</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {(['waiting','active','delayed','completed','failed','paused'] as const).map(k => (
            <div key={k} className={`rounded-lg px-2 py-1.5 ${
              k === 'completed' ? 'bg-emerald-50 dark:bg-slate-800' :
              k === 'failed'    ? 'bg-red-50 dark:bg-slate-800' :
              k === 'paused'    ? 'bg-amber-50 dark:bg-slate-800' :
                                  'bg-blue-50 dark:bg-slate-800'
            }`}>
              <span className={`font-semibold capitalize ${
                k === 'completed' ? 'text-emerald-700 dark:text-emerald-300' :
                k === 'failed'    ? 'text-red-700 dark:text-red-300' :
                k === 'paused'    ? 'text-amber-700 dark:text-amber-300' :
                                    'text-blue-700 dark:text-slate-300'
              }`}>{k.charAt(0).toUpperCase() + k.slice(1)}:</span>{' '}
              {activeQueueInfo?.counts?.[k] ?? 0}
            </div>
          ))}
        </div>
      </div>

      {/* ── Batches table ── */}
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-blue-50 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-500" />
            Lotes de Carga
            <span className="text-xs font-normal text-slate-400">({total} total)</span>
          </h3>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Buscar arquivo, tipo, status..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
              />
            </div>
            <button
              onClick={() => fetchBatches(page, search)}
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-blue-50 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">ID</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Arquivo</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Progresso</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-right">Data</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50 dark:divide-slate-800/60">
              {loading && batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-blue-400 dark:text-slate-500">Carregando...</td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-blue-400 dark:text-slate-500">
                    {search ? `Nenhum lote encontrado para "${search}"` : 'Nenhum lote foi processado ainda.'}
                  </td>
                </tr>
              ) : (
                batches.map(batch => {
                  const pct = batch.total_records > 0 ? (batch.processed_records / batch.total_records) * 100 : 0;
                  const isSuccess = batch.status === 'COMPLETED' || batch.status === 'APPROVED';
                  const isError   = batch.status === 'FAILED' || batch.status === 'ERROR' || batch.status === 'CNPJ_MISMATCH';
                  const isFormpd  = batch.entity_type?.includes('FORMPD');
                  const isCnpj    = ['COMPANIES','CONTACTS','COLLABORATORS','PROJECTS'].includes(batch.entity_type);
                  const canPause  = isFormpd && (batch.status === 'PENDING' || batch.status === 'PROCESSING');
                  const canResume = isFormpd && batch.status === 'PAUSED';
                  const canReparseFormpd = isFormpd && !['PENDING', 'PROCESSING', 'PAUSED'].includes(batch.status);
                  const canRequeuePending = isCnpj && (batch.processed_records < batch.total_records || batch.status === 'PENDING');
                  const canRetryFailed = isCnpj && (batch.error_count > 0 || batch.status === 'FAILED' || batch.status === 'ERROR');

                  return (
                    <tr key={batch.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">#{batch.id}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-blue-900 dark:text-slate-100 truncate w-48">{batch.file_name}</p>
                        <p className="text-xs text-slate-500">{batch.entity_type}</p>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(batch.status)}</td>
                      <td className="px-6 py-4 w-64">
                        <div className="flex items-center justify-between text-xs mb-1 font-semibold">
                          <span className="text-slate-600 dark:text-slate-300">{pct.toFixed(0)}%</span>
                          <span className="text-slate-500">{batch.processed_records} / {batch.total_records}</span>
                        </div>
                        <div className="w-full h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full transition-all duration-700 ease-out relative ${isSuccess ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
                            style={{ width: `${pct}%` }}
                          >
                            {batch.status === 'PROCESSING' && (
                              <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] font-semibold">
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> {batch.success_count}</span>
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertCircle className="w-3 h-3" /> {batch.error_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-500 dark:text-slate-400">
                        {new Date(batch.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex flex-wrap items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedBatch(batch)}
                            className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /><span className="text-xs font-bold hidden sm:inline">Ver Itens</span>
                          </button>
                          <button
                            onClick={() => setTraceBatch(batch)}
                            className="p-2 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Ver timeline de processamento"
                          >
                            <GitBranch className="w-4 h-4" />
                          </button>
                          {canPause && (
                            <button
                              onClick={() => pauseBatchJob(batch.id, batch.entity_type)}
                              disabled={!!actionLoading}
                              className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Pausar este lote (remove da fila)"
                            >
                              <PauseCircle className="w-4 h-4" />
                            </button>
                          )}
                          {canResume && (
                            <button
                              onClick={() => resumeBatchJob(batch.id, batch.entity_type)}
                              disabled={!!actionLoading}
                              className="p-2 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Retomar este lote"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {canReparseFormpd && (
                            <button
                              onClick={() => reparseFormpd(batch.id)}
                              disabled={!!actionLoading}
                              className="p-2 text-fuchsia-600 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Reprocessar apenas o parse determinístico (FORMPD)"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {(canRequeuePending || canRetryFailed) && (
                            <>
                              {canRequeuePending && (
                                <button
                                  onClick={() => requeuePending(batch.id, batch.entity_type)}
                                  disabled={!!actionLoading}
                                  className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
                                  title="Reenfileirar PENDING"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                              {canRetryFailed && (
                                <button
                                  onClick={() => retryFailed(batch.id, batch.entity_type)}
                                  disabled={!!actionLoading}
                                  className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                                  title="Reprocessar ERROR"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-blue-50 dark:border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-500 text-xs">
              Página {page} de {totalPages} — {total} lotes
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-blue-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                      p === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-blue-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800'
                    }`}
                  >{p}</button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-blue-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedBatch && (
        <ImportBatchItemsModal
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
          onReprocessed={() => fetchBatches()}
          onDeleted={() => { setSelectedBatch(null); fetchBatches(); }}
        />
      )}
      {traceBatch && (
        <ImportBatchTraceModal
          batch={traceBatch}
          onClose={() => setTraceBatch(null)}
        />
      )}
    </div>
  );
}
