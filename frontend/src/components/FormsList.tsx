import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileSpreadsheet, BrainCircuit, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Eye, Building2, Search, Calendar, TrendingUp, Filter, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import FormpdAiUpload from './FormpdAiUpload';

// Modulo IA

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
  // expandida com JOIN depois
  company?: { legal_name: string; cnpj: string };
}

interface ExtractedForm {
  batchId: number;
  fileName: string;
  company?: { legal_name: string; cnpj: string };
  fiscal_year?: number;
  projects?: any[];
  fiscal_summary?: any;
  status: string;
  created_at: string;
  cnpj_validation?: 'VALID' | 'MISMATCH' | 'UNKNOWN';
}

export default function FormsList() {
  const [batches, setBatches] = useState<FormsBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selected, setSelected] = useState<ExtractedForm | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<{id: number, cnpj: string, name: string} | null>(null);

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

  useEffect(() => {
    fetchAll();
    // Buscar empresas para o modal de importação
    api.get('/companies').then(res => setCompanies(res.data)).catch(() => {});
    
    socket.on('import:completed', fetchAll);
    return () => { socket.off('import:completed', fetchAll); };
  }, [fetchAll]);

  const openDetail = async (batch: FormsBatch) => {
    try {
      const res = await api.get(`/imports/batches/${batch.id}/items`);
      const item = res.data.data?.[0];
      if (!item) { toast.error('Sem dados de extração neste lote.'); return; }
      let data: any = {};
      try { data = JSON.parse(item.record_data); } catch { data = {}; }
      const formData = data.form_data || data;
      setSelected({
        batchId: batch.id,
        fileName: batch.file_name,
        fiscal_year: formData.fiscal_year,
        projects: formData.projects || [],
        fiscal_summary: formData.fiscal_summary,
        status: batch.status,
        created_at: batch.created_at,
        cnpj_validation: (item as any).cnpj_validation || 'UNKNOWN',
      });
    } catch { toast.error('Erro ao abrir formulário.'); }
  };

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

  const getValidationBadge = (v?: string) => {
    if (v === 'VALID') return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">✓ CNPJ Validado</span>;
    if (v === 'MISMATCH') return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">⚠ CNPJ Divergente</span>;
    return null;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header + KPIs */}
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

      {/* Base Badge - IA */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-blue-900 dark:text-blue-200 text-sm">Motor IA — Inteligência Artificial InnCentive</p>
          <p className="text-xs text-blue-600 dark:text-blue-400">Extrai, valida e estrutura dados de documentos externos com garantia de conformidade fiscal.</p>
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
                <p className="text-sm text-slate-500 mt-1">Acesse uma empresa, vá para a aba <strong>FORMs</strong> e faça o upload via IA.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-blue-50/50 dark:bg-slate-800/50 border-b border-blue-50 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Lote</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">Arquivo / Empresa</th>
                  <th className="px-5 py-3 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider">CNPJ</th>
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
                      <p className="font-bold text-blue-900 dark:text-slate-100 text-sm truncate max-w-[220px]">{batch.file_name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> Empresa ID {(batch as any).company_id || '—'}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-mono text-slate-600 dark:text-slate-400">—</span>
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(batch.status)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(batch.created_at).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {batch.status === 'COMPLETED' && (
                        <button
                          onClick={() => openDetail(batch)}
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

      {/* Modal de detalhe */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-blue-50 dark:border-slate-800 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-blue-900 dark:text-slate-100">FORM #{selected.batchId}</h3>
                    {getValidationBadge(selected.cnpj_validation)}
                  </div>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{selected.fileName}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors text-slate-400">✕</button>
              </div>

              <div className="p-6 flex flex-col gap-4">
                {selected.cnpj_validation === 'MISMATCH' && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-700 dark:text-red-400 text-sm">⚠ CNPJ da Empresa não confere com o documento!</p>
                      <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">O CNPJ extraído do PDF pela IA diverge da empresa selecionada. Este formulário pode pertencer a outra empresa. Aprovação bloqueada até correção.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-xs text-slate-500">Ano Fiscal</p>
                    <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{selected.fiscal_year || '—'}</p>
                  </div>
                  <div className="p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Projetos</p>
                    <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{selected.projects?.length || 0}</p>
                  </div>
                </div>

                {selected.projects && selected.projects.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Projetos Extraídos</p>
                    {selected.projects.map((p: any, i: number) => (
                      <div key={i} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-blue-50 dark:border-slate-700">
                        <p className="font-bold text-sm text-blue-900 dark:text-slate-100">{p.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.category}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setSelected(null)}
                    className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    Fechar
                  </button>
                  <button
                    disabled={selected.cnpj_validation === 'MISMATCH'}
                    onClick={() => { toast.success('Formulário aprovado para promoção!'); setSelected(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {selected.cnpj_validation === 'MISMATCH' ? '🚫 Aprovação Bloqueada' : '✓ Aprovar FORM'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Importação Global */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-blue-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <h3 className="font-black text-blue-900 dark:text-slate-100 text-xl flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" /> Importar FORM via IA
                  </h3>
                  <p className="text-xs text-slate-500">Selecione a empresa e envie o documento para processamento.</p>
                </div>
                <button 
                  onClick={() => { setShowUploadModal(false); setSelectedCompany(null); }} 
                  className="w-10 h-10 rounded-full hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 border border-transparent hover:border-blue-100"
                >
                  ✕
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                {!selectedCompany ? (
                  <div className="flex flex-col gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-blue-900 dark:text-slate-200">1. Selecione a Empresa Destino</label>
                      <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {companies.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedCompany({ id: c.id, cnpj: c.cnpj, name: c.legal_name })}
                            className="flex items-center justify-between p-4 rounded-2xl border border-blue-50 dark:border-slate-800 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left group"
                          >
                            <div>
                              <p className="font-bold text-blue-900 dark:text-slate-100 text-sm group-hover:text-blue-600 transition-colors">{c.legal_name}</p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{c.cnpj}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Search className="w-3 h-3 text-blue-500" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800">
                      <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Empresa Selecionada</p>
                        <p className="font-bold text-blue-900 dark:text-blue-200 text-sm">{selectedCompany.name}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedCompany(null)}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Trocar
                      </button>
                    </div>

                    <FormpdAiUpload 
                      companyId={selectedCompany.id} 
                      cnpj={selectedCompany.cnpj} 
                      onComplete={() => {
                        setShowUploadModal(false);
                        setSelectedCompany(null);
                        fetchAll();
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
