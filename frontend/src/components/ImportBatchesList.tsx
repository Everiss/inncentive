import { useEffect, useState } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { Server, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react';
import { ImportBatchItemsModal } from './modals/ImportBatchItemsModal';

interface ImportBatch {
  id: number;
  entity_type: string;
  file_name: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
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

  useEffect(() => {
    fetchBatches();
    
    // Fallback polling just in case
    const interval = setInterval(() => {
      fetchBatches();
    }, 15000);

    // Real-time socket updates
    socket.on('import:progress', () => fetchBatches());
    socket.on('import:completed', () => fetchBatches());

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
      default: return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Na Fila</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
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
                            className={`h-full transition-all duration-700 ease-out relative ${batch.status === 'COMPLETED' ? 'bg-emerald-500' : batch.status === 'FAILED' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} 
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
                        <button 
                          onClick={() => setSelectedBatch(batch)}
                          className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" /> <span className="text-xs font-bold hidden sm:inline">Ver Items</span>
                        </button>
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
        />
      )}
    </div>
  );
}
