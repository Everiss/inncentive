import { useEffect, useState } from 'react';
import api from '../../api/api';
import { X, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  batch: any;
  onClose: () => void;
  onReprocessed: () => void;
}

export function ImportBatchItemsModal({ batch, onClose, onReprocessed }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchItems = () => {
    setLoading(true);
    api.get(`/imports/batches/${batch.id}/items`, { params: { page, limit: 10 } })
      .then(res => {
        setItems(res.data.data);
        setTotalPages(res.data.totalPages);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchItems();
  }, [page]);

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await toast.promise(
        api.post(`/imports/batches/${batch.id}/reprocess`),
        {
          loading: 'Adicionando à fila...',
          success: 'Reprocessamento iniciado!',
          error: 'Falha ou sem itens para reprocessar.',
        }
      );
      onReprocessed();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setReprocessing(false);
    }
  };

  if (!batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/40 dark:bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl border border-blue-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-blue-50 dark:border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-blue-900 dark:text-slate-100">Detalhes do Lote #{batch.id}</h3>
            <p className="text-sm text-blue-500 dark:text-slate-400 mt-1">{batch.file_name}</p>
          </div>
          <div className="flex gap-3 items-center">
            {batch.error_count > 0 && (
              <button 
                onClick={handleReprocess}
                disabled={reprocessing}
                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-semibold rounded-xl text-sm flex items-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${reprocessing ? 'animate-spin' : ''}`} />
                Reprocessar Falhas
              </button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-blue-50 dark:border-slate-800 text-blue-600 dark:text-slate-400 uppercase text-xs font-semibold">
                <th className="pb-3 px-2">ID</th>
                <th className="pb-3 px-2">Registro (CNPJ)</th>
                <th className="pb-3 px-2">Status</th>
                <th className="pb-3 px-2">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50 dark:divide-slate-800/50 text-sm">
              {loading ? (
                 <tr><td colSpan={4} className="py-6 text-center text-slate-500">Carregando itens...</td></tr>
              ) : items.length === 0 ? (
                 <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nenhum item encontrado.</td></tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-2 text-slate-500">#{item.id}</td>
                    <td className="py-3 px-2 font-medium text-blue-900 dark:text-slate-200">{item.record_data}</td>
                    <td className="py-3 px-2">
                       {item.status === 'SUCCESS' && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4"/> OK</span>}
                       {item.status === 'ERROR' && <span className="flex items-center gap-1 text-red-600"><AlertCircle className="w-4 h-4"/> Erro</span>}
                       {item.status === 'PENDING' && <span className="flex items-center gap-1 text-slate-500"><Clock className="w-4 h-4"/> N/A</span>}
                    </td>
                    <td className="py-3 px-2 text-slate-500 text-xs">{item.error_message || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-blue-50 dark:border-slate-800 flex items-center justify-between text-sm bg-slate-50/50 dark:bg-slate-800/20">
          <button 
             disabled={page === 1} onClick={() => setPage(page - 1)}
             className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm disabled:opacity-50"
          >
             Anterior
          </button>
          <span className="text-slate-500">Pág {page} de {totalPages || 1}</span>
          <button 
             disabled={page >= totalPages} onClick={() => setPage(page + 1)}
             className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm disabled:opacity-50"
          >
             Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
