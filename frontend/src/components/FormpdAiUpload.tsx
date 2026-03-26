import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/api';

interface Props {
  onComplete?: () => void;
  companyId?: number;
}

export default function FormpdAiUpload({ onComplete, companyId }: Props) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else toast.error('Apenas arquivos PDF sao aceitos');
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const { data } = await api.post('/imports/formpd/upload', form, {
        params: companyId ? { companyId } : undefined,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`FORMP&D recebido no lote #${data.batchId}. Status: ${data.status}`);
      setFile(null);
      onComplete?.();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao enviar FORMP&D');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <motion.div
        key="upload"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex flex-col gap-4"
      >
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-4 transition-all
            ${
              dragging
                ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                : file
                  ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : 'border-blue-100 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50/30 dark:hover:bg-violet-900/10'
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) setFile(e.target.files[0]);
            }}
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
                Apenas PDF • Max. 50MB
              </span>
            </>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-2xl font-bold shadow-lg shadow-violet-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Zap className="w-4 h-4" />
          {uploading ? 'Enviando...' : 'Iniciar Extracao'}
        </button>

        <button
          onClick={() => onComplete?.()}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all"
        >
          Fechar
        </button>
      </motion.div>
    </div>
  );
}

