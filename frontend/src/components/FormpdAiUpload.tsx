import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api/api';
import { socket } from '../api/socket';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, BrainCircuit, CheckCircle2, AlertCircle,
  ClipboardList, Layers, DollarSign, Users, ChevronDown, ChevronUp,
  RefreshCw, Sparkles, X, ThumbsUp, ThumbsDown, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  companyId: number;
  cnpj: string;
  onComplete?: () => void;
}

type UploadStep = 'idle' | 'uploading' | 'processing' | 'review' | 'done' | 'error';

interface ExtractedProject {
  title: string;
  description: string;
  category: string;
  is_continuous: boolean;
  hr_summary?: { total_amount: number; dedication_pct_avg: number };
  expenses?: { total_amount: number; categories: { material: number; services: number } };
}

interface ExtractedData {
  fiscal_year: number;
  company_info?: { cnpj: string; legal_name: string };
  projects: ExtractedProject[];
  fiscal_summary?: { fiscal_loss: boolean; total_benefit_requested: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  'PESQUISA_BASICA': 'Pesquisa Básica',
  'PESQUISA_APLICADA': 'Pesquisa Aplicada',
  'DESENVOLVIMENTO_EXPERIMENTAL': 'Desenvolvimento Experimental',
};

const fmt = (v?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function FormpdAiUpload({ companyId, cnpj, onComplete }: Props) {
  const [step, setStep] = useState<UploadStep>('idle');
  const [batchId, setBatchId] = useState<number | null>(null);
  const [anoBase, setAnoBase] = useState(new Date().getFullYear().toString());
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<any>(null);

  // Poll for batch completion after upload
  const pollBatchStatus = useCallback((id: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/imports/batches/${id}/items`);
        if (res.data.total > 0) {
          clearInterval(pollRef.current);
          const item = res.data.data[0];
          const parsed = JSON.parse(item.record_data);
          setExtractedData(parsed.form_data || parsed);
          setStep('review');
        }
      } catch { /* keep polling */ }
    }, 3000);
  }, []);

  useEffect(() => {
    // WebSocket listener for real-time completion
    socket.on('import:completed', () => {
      if (batchId) {
        clearInterval(pollRef.current);
        setTimeout(() => pollBatchStatus(batchId), 500);
      }
    });
    return () => {
      socket.off('import:completed');
      clearInterval(pollRef.current);
    };
  }, [batchId, pollBatchStatus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else toast.error('Apenas arquivos PDF são aceitos');
  }, []);

  const handleUpload = async () => {
    if (!file || !cnpj || !anoBase) return;
    setStep('uploading');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('companyId', String(companyId));
    formData.append('cnpj', cnpj);
    formData.append('anoBase', anoBase);
    formData.append('entityType', 'FORM');

    try {
      const res = await api.post('/imports/upload-formpd-ai', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setBatchId(res.data.batchId);
      setStep('processing');
      pollBatchStatus(res.data.batchId);
      toast.success('PDF enviado! Claude está analisando...');
    } catch (err: any) {
      setStep('error');
      toast.error('Erro ao enviar o arquivo: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleApprove = async () => {
    toast.success('Dados aprovados! Em breve serão promovidos para o FORMP&D.');
    setStep('done');
    onComplete?.();
  };

  const handleReject = () => {
    setStep('idle');
    setFile(null);
    setExtractedData(null);
    setBatchId(null);
    toast('Extração descartada. Você pode fazer um novo upload.');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-blue-900 dark:text-slate-100">Extração via IA (Claude)</h3>
          <p className="text-xs text-slate-500">Envie um PDF do FORMP&D para extração automática</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['idle', 'uploading', 'processing', 'review', 'done'] as UploadStep[]).map((s, i) => {
          const labels = ['Seleção', 'Upload', 'Processando', 'Revisão', 'Concluído'];
          const isActive = step === s;
          const isDone = (['idle', 'uploading', 'processing', 'review', 'done'] as UploadStep[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${isActive ? 'bg-violet-600 border-violet-600 text-white'
                  : isDone ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-400'}`}>
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${isActive ? 'text-violet-600' : isDone ? 'text-emerald-500' : 'text-slate-400'}`}>
                {labels[i]}
              </span>
              {i < 4 && <div className={`h-0.5 w-8 transition-all ${isDone ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* IDLE: Upload Area */}
        {(step === 'idle' || step === 'uploading') && (
          <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4">
            {/* Ano Base Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-blue-900 dark:text-slate-200 whitespace-nowrap">Ano Base:</label>
              <select
                value={anoBase}
                onChange={e => setAnoBase(e.target.value)}
                className="px-3 py-2 rounded-xl border border-blue-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-blue-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-4 transition-all
                ${dragging ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                  : file ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-blue-100 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50/30 dark:hover:bg-violet-900/10'}`}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />

              {file ? (
                <>
                  <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl flex items-center justify-center">
                    <FileText className="w-7 h-7 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <span className="text-xs text-violet-600 font-semibold">Clique para trocar o arquivo</span>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-violet-50 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center">
                    <Upload className="w-7 h-7 text-violet-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-blue-900 dark:text-slate-100">Arraste o PDF aqui</p>
                    <p className="text-sm text-slate-500">ou clique para selecionar o arquivo FORMP&D</p>
                  </div>
                  <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-3 py-1 rounded-full font-semibold">
                    Apenas PDF • Máx. 50MB
                  </span>
                </>
              )}
            </div>

            {file && (
              <button
                onClick={handleUpload}
                disabled={step === 'uploading'}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-2xl font-bold shadow-lg shadow-violet-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                {step === 'uploading' ? 'Enviando...' : 'Enviar para Claude Analisar'}
              </button>
            )}
          </motion.div>
        )}

        {/* PROCESSING */}
        {step === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-6 py-12">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <BrainCircuit className="w-10 h-10 text-violet-600" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <h4 className="font-bold text-blue-900 dark:text-slate-100 text-lg">Claude está lendo o formulário...</h4>
              <p className="text-slate-500 text-sm mt-1">Isso pode levar entre 30 e 90 segundos dependendo do tamanho do PDF.</p>
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-violet-600 dark:text-violet-400 font-semibold">
                <Clock className="w-3.5 h-3.5" /> Lote #{batchId} em processamento no Valkey
              </div>
            </div>
          </motion.div>
        )}

        {/* REVIEW - Staging Data from Claude */}
        {step === 'review' && extractedData && (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-5">
            {/* Header Badge */}
            <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-800">
              <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-violet-800 dark:text-violet-300">Extração pela IA concluída!</p>
                <p className="text-xs text-violet-600 dark:text-violet-400">Revise os dados abaixo antes de aprovar para o FORMP&D.</p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-50 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-medium">Ano Fiscal</p>
                <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{extractedData.fiscal_year || anoBase}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-50 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><Layers className="w-3 h-3" /> Projetos</p>
                <p className="text-2xl font-black text-blue-900 dark:text-slate-100">{extractedData.projects?.length || 0}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-50 dark:border-slate-800 col-span-2 md:col-span-1">
                <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" /> Benefício Req.</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                  {fmt(extractedData.fiscal_summary?.total_benefit_requested)}
                </p>
              </div>
            </div>

            {/* Projects accordion */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" /> Projetos Extraídos
              </h4>
              {extractedData.projects?.map((proj, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    onClick={() => setExpandedProject(expandedProject === i ? null : i)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xs font-black text-blue-600">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-bold text-blue-900 dark:text-slate-100 text-sm">{proj.title}</p>
                        <p className="text-xs text-slate-500">{CATEGORY_LABELS[proj.category] || proj.category}</p>
                      </div>
                    </div>
                    {expandedProject === i ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  <AnimatePresence>
                    {expandedProject === i && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden border-t border-blue-50 dark:border-slate-800">
                        <div className="p-4 flex flex-col gap-4">
                          <p className="text-sm text-slate-600 dark:text-slate-400">{proj.description}</p>
                          <div className="grid grid-cols-2 gap-3">
                            {proj.hr_summary && (
                              <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-xl">
                                <Users className="w-4 h-4 text-blue-500 shrink-0" />
                                <div>
                                  <p className="text-xs text-slate-500">Total RH</p>
                                  <p className="font-bold text-sm text-blue-900 dark:text-slate-100">{fmt(proj.hr_summary.total_amount)}</p>
                                </div>
                              </div>
                            )}
                            {proj.expenses && (
                              <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-xl">
                                <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
                                <div>
                                  <p className="text-xs text-slate-500">Total Despesas</p>
                                  <p className="font-bold text-sm text-blue-900 dark:text-slate-100">{fmt(proj.expenses.total_amount)}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleReject}
                className="flex-1 py-3 rounded-2xl border-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 font-bold flex items-center justify-center gap-2 transition-all"
              >
                <ThumbsDown className="w-4 h-4" /> Descartar
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
              >
                <ThumbsUp className="w-4 h-4" /> Aprovar Extração
              </button>
            </div>
          </motion.div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h4 className="font-bold text-xl text-blue-900 dark:text-slate-100">Dados Aprovados!</h4>
            <p className="text-slate-500 text-sm text-center">Os dados extraídos pelo Claude foram aceitos e estão prontos para promoção ao FORMP&D.</p>
            <button onClick={() => { setStep('idle'); setFile(null); setExtractedData(null); }}
              className="px-6 py-2.5 bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 rounded-xl font-semibold hover:bg-blue-100 transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Nova Extração
            </button>
          </motion.div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center gap-4 py-10">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <p className="font-bold text-red-700 dark:text-red-400">Falha ao processar o PDF</p>
            <button onClick={() => setStep('idle')} className="px-5 py-2 bg-red-50 text-red-600 rounded-xl font-semibold flex items-center gap-2">
              <X className="w-4 h-4" /> Tentar novamente
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
