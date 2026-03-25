import { useState, useRef, useCallback } from 'react';
import api from '../api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, BrainCircuit, CheckCircle2,
  Sparkles, X, Bell,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  onComplete?: () => void;
  /** When set, the backend validates that the extracted CNPJ matches this company. */
  companyId?: number;
}

type Step = 'idle' | 'uploading' | 'queued';

export default function FormpdAiUpload({ onComplete, companyId }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [batchId, setBatchId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else toast.error('Apenas arquivos PDF são aceitos');
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setStep('uploading');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = companyId
        ? `/imports/upload-formpd-ai?companyId=${companyId}`
        : '/imports/upload-formpd-ai';
      const res = await api.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBatchId(res.data.batchId);
      setStep('queued');
    } catch (err: any) {
      setStep('idle');
      toast.error('Erro ao enviar: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <AnimatePresence mode="wait">

        {/* ── Upload / Idle ── */}
        {(step === 'idle' || step === 'uploading') && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4">

            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => step === 'idle' && fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-4 transition-all
                ${dragging ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                  : file ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-blue-100 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50/30 dark:hover:bg-violet-900/10'}`}
            >
              <input
                ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
              />

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
                    <p className="font-bold text-blue-900 dark:text-slate-100">Arraste o PDF do FORMP&D aqui</p>
                    <p className="text-sm text-slate-500">ou clique para selecionar o arquivo</p>
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
                {step === 'uploading' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Enviando para a fila...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Enviar para Análise por IA
                  </>
                )}
              </button>
            )}
          </motion.div>
        )}

        {/* ── Queued confirmation ── */}
        {step === 'queued' && (
          <motion.div key="queued" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 py-8 text-center">

            <div className="relative">
              <div className="w-20 h-20 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                <BrainCircuit className="w-10 h-10 text-violet-600" />
              </div>
              <div className="absolute -top-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="max-w-xs">
              <h4 className="font-black text-blue-900 dark:text-slate-100 text-lg">PDF na fila de processamento!</h4>
              <p className="text-sm text-slate-500 mt-2">
                Claude está analisando o FORMP&D em segundo plano.
                Você receberá uma <strong className="text-violet-600">notificação</strong> assim que a extração for concluída.
              </p>
              {batchId && (
                <p className="text-xs text-slate-400 mt-3 font-mono">Lote #{batchId}</p>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-100 dark:border-violet-800">
              <Bell className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-xs text-violet-700 dark:text-violet-300 font-semibold">
                Você pode fechar esta janela com segurança
              </span>
            </div>

            <button
              onClick={() => onComplete?.()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Fechar e aguardar notificação
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
