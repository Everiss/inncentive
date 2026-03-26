import { useEffect, useState } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { Server, CheckCircle2, AlertCircle, Clock, Eye, Pause, Play, RefreshCw, RotateCcw, Send, GitBranch } from 'lucide-react';
import { ImportBatchItemsModal } from './modals/ImportBatchItemsModal';
import { ImportBatchTraceModal } from './modals/ImportBatchTraceModal';

interface ImportBatch {
  id: number;
  entity_type: string;
  file_name: string;
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'DISCARDED'
    | 'CNPJ_MISMATCH'
    | 'COMPANY_NOT_FOUND'
    | 'AWAITING_COMPANY'
    | 'ERROR';
  total_records: number;
  processed_records: number;
  success_count: number;
  error_count: number;
  created_at: string;
}

export default function ImportBatchesList() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [traceBatch, setTraceBatch] = useState<any>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<{
    paused: boolean;
    counts: {
      waiting?: number;
      active?: number;
      completed?: number;
      failed?: number;
      delayed?: number;
      paused?: number;
    };
  } | null>(null);

  const fetchBatches = () => {
    api.get('/imports/batches')
      .then(res => {
        setBatches(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const fetchQueueStatus = () => {
    setQueueLoading(true);
    api.get('/queue-admin/queues/import-cnpjs/status')
      .then((res) => setQueueInfo(res.data))
      .catch((err) => console.error(err))
      .finally(() => setQueueLoading(false));
  };

  const pauseQueue = async () => {
    setActionLoading('pause');
    try {
      await api.post('/queue-admin/queues/import-cnpjs/pause');
      fetchQueueStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const resumeQueue = async () => {
    setActionLoading('resume');
    try {
      await api.post('/queue-admin/queues/import-cnpjs/resume');
      fetchQueueStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const requeuePending = async (batchId: number) => {
    setActionLoading(`requeue-${batchId}`);
    try {
      await api.post(`/queue-admin/batches/${batchId}/requeue-pending`);
      fetchBatches();
      fetchQueueStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const retryFailed = async (batchId: number) => {
    setActionLoading(`retry-${batchId}`);
    try {
      await api.post(`/queue-admin/batches/${batchId}/retry-failed`);
      fetchBatches();
      fetchQueueStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchQueueStatus();
    
    // Fallback polling just in case
    const interval = setInterval(() => {
      fetchBatches();
      fetchQueueStatus();
    }, 15000);

    // Real-time socket updates
    socket.on('import:progress', () => { fetchBatches(); fetchQueueStatus(); });
    socket.on('import:completed', () => { fetchBatches(); fetchQueueStatus(); });

    return () => {
      clearInterval(interval);
      socket.off('import:progress');
      socket.off('import:completed');
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'COMPLETED': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">Concluído</span>;
      case 'PROCESSING': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping" /> Processando</span>;
      case 'FAILED': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Falhou</span>;
      case 'PENDING_REVIEW': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400">Aguardando Revisão</span>;
      case 'APPROVED': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">Aprovado</span>;
      case 'DISCARDED': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Descartado</span>;
      case 'CNPJ_MISMATCH': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">CNPJ Divergente</span>;
      case 'COMPANY_NOT_FOUND': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">Empresa Não Cadastrada</span>;
      case 'AWAITING_COMPANY': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">Aguardando Cadastro</span>;
      case 'ERROR': return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Erro</span>;
      default: return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Na Fila</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            <h4 className="text-sm font-bold text-blue-900 dark:text-slate-100">Controle da Fila Redis</h4>
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${queueInfo?.paused ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {queueInfo?.paused ? 'Pausada' : 'Ativa'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchQueueStatus}
              disabled={queueLoading || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-slate-700 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Atualizar</span>
            </button>
            <button
              onClick={pauseQueue}
              disabled={queueInfo?.paused || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> Pausar</span>
            </button>
            <button
              onClick={resumeQueue}
              disabled={!queueInfo?.paused || !!actionLoading}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Retomar</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <div className="rounded-lg bg-blue-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-blue-700 dark:text-slate-300">Waiting:</span> {queueInfo?.counts?.waiting ?? 0}</div>
          <div className="rounded-lg bg-blue-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-blue-700 dark:text-slate-300">Active:</span> {queueInfo?.counts?.active ?? 0}</div>
          <div className="rounded-lg bg-blue-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-blue-700 dark:text-slate-300">Delayed:</span> {queueInfo?.counts?.delayed ?? 0}</div>
          <div className="rounded-lg bg-emerald-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-emerald-700 dark:text-emerald-300">Completed:</span> {queueInfo?.counts?.completed ?? 0}</div>
          <div className="rounded-lg bg-red-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-red-700 dark:text-red-300">Failed:</span> {queueInfo?.counts?.failed ?? 0}</div>
          <div className="rounded-lg bg-amber-50 dark:bg-slate-800 px-2 py-1.5"><span className="font-semibold text-amber-700 dark:text-amber-300">Paused:</span> {queueInfo?.counts?.paused ?? 0}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-500" />
            Lotes de Carga
          </h3>
          <button onClick={fetchBatches} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Atualizar
          </button>
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
                  <td colSpan={6} className="px-6 py-12 text-center text-blue-400 dark:text-slate-500">Caregando filas...</td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-blue-400 dark:text-slate-500">Nenhum lote foi processado ainda.</td>
                </tr>
              ) : (
                batches.map(batch => {
                  const percentage = batch.total_records > 0 ? (batch.processed_records / batch.total_records) * 100 : 0;
                  const isSuccess = batch.status === 'COMPLETED' || batch.status === 'APPROVED';
                  const isError = batch.status === 'FAILED' || batch.status === 'ERROR' || batch.status === 'CNPJ_MISMATCH';
                  
                  return (
                    <tr key={batch.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        #{batch.id}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-blue-900 dark:text-slate-100 truncate w-48">{batch.file_name}</p>
                        <p className="text-xs text-slate-500">{batch.entity_type}</p>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(batch.status)}
                      </td>
                      <td className="px-6 py-4 w-64">
                        <div className="flex items-center justify-between text-xs mb-1 font-semibold">
                          <span className="text-slate-600 dark:text-slate-300">{percentage.toFixed(0)}%</span>
                          <span className="text-slate-500">{batch.processed_records} / {batch.total_records}</span>
                        </div>
                        <div className="w-full h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                          <div 
                            className={`h-full transition-all duration-700 ease-out relative ${isSuccess ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} 
                            style={{ width: `${percentage}%` }}
                          >
                             {batch.status === 'PROCESSING' && (
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
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
                            <Eye className="w-4 h-4" /> <span className="text-xs font-bold hidden sm:inline">Ver Itens</span>
                          </button>
                          <button
                            onClick={() => setTraceBatch(batch)}
                            className="p-2 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-2"
                            title="Ver timeline de processamento"
                          >
                            <GitBranch className="w-4 h-4" />
                          </button>
                          {['COMPANIES', 'CONTACTS', 'COLLABORATORS', 'PROJECTS'].includes(batch.entity_type) && (
                            <>
                              <button
                                onClick={() => requeuePending(batch.id)}
                                disabled={!!actionLoading}
                                className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                                title="Reenfileirar PENDING"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => retryFailed(batch.id)}
                                disabled={!!actionLoading}
                                className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                                title="Reprocessar ERROR"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
