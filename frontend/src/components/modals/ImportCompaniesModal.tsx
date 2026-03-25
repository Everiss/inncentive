import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../api/api';

interface ImportCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialType?: 'COMPANIES' | 'CONTACTS' | 'COLLABORATORS' | 'PROJECTS';
  companyId?: number;
}

export function ImportCompaniesModal({ isOpen, onClose, onSuccess, initialType = 'COMPANIES', companyId }: ImportCompaniesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState(initialType);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string, details?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state with prop if it changes
  React.useEffect(() => {
    if (isOpen) {
      setImportType(initialType);
      setFile(null);
      setStatus(null);
    }
  }, [isOpen, initialType]);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv' // csv
    ];

    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      setStatus({ type: 'error', message: 'Formato inválido. Por favor, envie um arquivo Excel (.xlsx) ou CSV.' });
      return;
    }

    setFile(selectedFile);
    setStatus(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    const endpoints: Record<string, string> = {
      COMPANIES: '/imports/empresas-cnpj',
      CONTACTS: '/imports/upload-contacts',
      COLLABORATORS: '/imports/upload-collaborators',
      PROJECTS: '/imports/upload-projects' // Placeholder
    };

    try {
      const response = await api.post(endpoints[importType], formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: companyId ? { companyId } : {}
      });
      
      setStatus({ type: 'success', message: response.data.message || 'Lote criado com sucesso!', details: 'Os registros serão vinculados à empresa atual.' });
      setFile(null);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Upload falhou:', error);
      setStatus({ 
        type: 'error', 
        message: error.response?.data?.message || 'Erro inesperado ao enviar arquivo. Tente novamente.' 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templates: Record<string, string> = {
      COMPANIES: 'cnpj',
      CONTACTS: companyId ? 'nome,email,telefone' : 'nome,email,telefone,cnpj',
      COLLABORATORS: companyId 
        ? 'nome,email,telefone,cargo,matricula,usuario' 
        : 'nome,email,telefone,cargo,matricula,usuario,cnpj',
      PROJECTS: 'nome,descricao,data_inicio'
    };

    const content = templates[importType] || 'cnpj';
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${importType.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const labels: Record<string, string> = {
    COMPANIES: 'Empresas (via CNPJ)',
    CONTACTS: 'Contatos',
    COLLABORATORS: 'Colaboradores',
    PROJECTS: 'Projetos'
  };

  const availableTypes = companyId 
    ? (['CONTACTS', 'COLLABORATORS', 'PROJECTS'] as const)
    : (['COMPANIES', 'CONTACTS', 'COLLABORATORS'] as const);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-blue-100 dark:border-slate-800"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-blue-50 dark:border-slate-800">
          <h2 className="text-xl font-bold tracking-tight text-blue-900 dark:text-slate-100 flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-blue-500" />
            Importar {labels[importType]}
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">O que você deseja importar?</label>
            <div className="flex gap-2">
              {availableTypes.map(type => (
                <button
                  key={type}
                  onClick={() => { setImportType(type as any); setStatus(null); setFile(null); }}
                  className={`flex-1 py-3 text-[10px] font-bold rounded-lg border transition-all ${importType === type ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white dark:bg-slate-800 border-blue-100 dark:border-slate-700 text-slate-500 hover:bg-blue-50'}`}
                >
                  {labels[type].split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium leading-relaxed bg-blue-50/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-blue-100/50 dark:border-slate-700/50">
            {importType === 'COMPANIES' && (
               <p>Obrigatório cabeçalho <strong className="text-blue-600">"cnpj"</strong>. Coletamos dados automaticamente da Receita WS.</p>
            )}
            {importType === 'CONTACTS' && (
               <p>
                 {companyId ? 'Vínculo automático com a empresa do painel.' : 'Obrigatório cabeçalho "cnpj" para vincular à empresa.'} 
                 <br/><span className="text-[10px] opacity-75">Aceita: Nome, Email, Telefone.</span>
               </p>
            )}
            {importType === 'COLLABORATORS' && (
               <p>
                 {companyId ? 'Vínculo automático com a empresa do painel.' : 'Obrigatório cabeçalho "cnpj" para vincular à empresa.'}
                 <br/><span className="text-[10px] opacity-75">Aceita: Nome, Email, Cargo, Matricula.</span>
               </p>
            )}
            {importType === 'PROJECTS' && (
               <p className="text-amber-600 dark:text-amber-400">
                 Módulo de Projetos será implementado em breve. O template aceitará Nome, Descrição e Data de Início.
               </p>
            )}
          </div>

          {!file && !status?.type && (
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`group border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 cursor-pointer transition-all ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 dark:border-slate-700 bg-blue-50/20 hover:border-blue-400 hover:bg-blue-50/40'}`}
            >
              <FileSpreadsheet className="w-10 h-10 mb-3 text-blue-400 group-hover:scale-110 transition-transform" />
              <h3 className="text-sm font-semibold text-blue-900 dark:text-slate-100">Arraste o Excel ou CSV aqui</h3>
              <p className="text-[10px] text-slate-400">ou clique para procurar</p>
            </div>
          )}

          {file && !status?.type && (
            <div className="flex gap-4 items-center p-4 bg-blue-50/50 dark:bg-slate-800/50 border border-blue-100 dark:border-slate-700 rounded-2xl mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-blue-900 dark:text-slate-100 truncate">{file.name}</p>
                <p className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button 
                onClick={() => setFile(null)} 
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remover arquivo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <AnimatePresence>
            {status && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`flex gap-3 items-start p-4 rounded-2xl mb-4 text-sm ${
                  status.type === 'error' 
                    ? 'bg-red-50 text-red-700 border border-red-100' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}
              >
                {status.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
                <div>
                  <p className="font-semibold leading-tight">{status.message}</p>
                  {status.details && <p className="text-xs mt-1.5 opacity-90">{status.details}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input 
            type="file" 
            ref={inputRef} 
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} 
            className="hidden" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
          />

          <div className="flex flex-col gap-3 mt-4">
            {!status?.type && !file && (
              <button 
                onClick={handleDownloadTemplate}
                className="flex items-center justify-center gap-2 text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors py-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Baixar Planilha Modelo
              </button>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={onClose} 
                disabled={uploading}
                className="flex-1 py-3 font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-colors"
              >
                {status?.type === 'success' ? 'Fechar' : 'Cancelar'}
              </button>
              {!status?.type && (
                <button 
                  onClick={handleUpload} 
                  disabled={!file || uploading} 
                  className="flex-[2] py-3 font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </div>
                  ) : 'Iniciar Importação'}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
