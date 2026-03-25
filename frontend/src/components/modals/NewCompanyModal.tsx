import { useState } from 'react';
import api from '../../api/api';
import { X, Search, Building2, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'input' | 'checking' | 'exists' | 'registering' | 'done' | 'error';

export function NewCompanyModal({ isOpen, onClose, onSuccess }: Props) {
  const [cnpj, setCnpj] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [existingCompany, setExistingCompany] = useState<any>(null);
  const [resultCompany, setResultCompany] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpj(formatCnpj(e.target.value));
  };

  const reset = () => {
    setCnpj('');
    setStep('input');
    setExistingCompany(null);
    setResultCompany(null);
    setErrorMsg('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCheck = async () => {
    const raw = cnpj.replace(/\D/g, '');
    if (raw.length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos.');
      return;
    }

    setStep('checking');
    try {
      const { data } = await api.post('/companies/check-cnpj', { cnpj: raw });
      if (data.exists) {
        setExistingCompany(data.company);
        setStep('exists');
      } else {
        // Go straight to registration
        await doRegister(raw, false);
      }
    } catch (err) {
      setErrorMsg('Erro ao verificar o CNPJ.');
      setStep('error');
    }
  };

  const doRegister = async (rawCnpj: string, forceUpdate: boolean) => {
    setStep('registering');
    try {
      const { data } = await api.post('/companies/register-cnpj', { cnpj: rawCnpj, forceUpdate });
      if (data.success) {
        setResultCompany(data.company);
        setStep('done');
        toast.success(forceUpdate ? 'Empresa atualizada com sucesso!' : 'Empresa cadastrada com sucesso!');
        onSuccess();
      } else {
        setErrorMsg(data.error || 'Falha desconhecida.');
        setStep('error');
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Falha ao registrar a empresa.');
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/40 dark:bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-blue-100 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-blue-50 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-blue-900 dark:text-slate-100">Nova Empresa</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cadastro automático via ReceitaWS</p>
            </div>
          </div>
          <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Step: Input CNPJ */}
          {step === 'input' && (
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-blue-900 dark:text-slate-200">
                Digite o CNPJ da empresa
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                  placeholder="00.000.000/0000-00"
                  className="w-full pl-10 pr-4 py-3 border border-blue-100 dark:border-slate-700 rounded-xl bg-blue-50/30 dark:bg-slate-800/50 text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-blue-900 dark:text-slate-100 placeholder:text-blue-300 dark:placeholder:text-slate-600 transition-all"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Os dados serão buscados automaticamente na Receita Federal.
              </p>
              <button
                onClick={handleCheck}
                disabled={cnpj.replace(/\D/g, '').length !== 14}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm"
              >
                <Search className="w-4 h-4" />
                Consultar CNPJ
              </button>
            </div>
          )}

          {/* Step: Checking */}
          {step === 'checking' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-sm font-semibold text-blue-900 dark:text-slate-200">Verificando CNPJ no banco de dados...</p>
            </div>
          )}

          {/* Step: Registering */}
          {step === 'registering' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-sm font-semibold text-blue-900 dark:text-slate-200">Consultando ReceitaWS e salvando...</p>
              <p className="text-xs text-slate-500">Isso pode levar alguns segundos.</p>
            </div>
          )}

          {/* Step: Already Exists */}
          {step === 'exists' && existingCompany && (
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">Empresa já cadastrada!</h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Este CNPJ já existe no sistema. Deseja atualizar os dados com a Receita Federal?</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-blue-100/50 dark:border-slate-700/50">
                <p className="text-sm font-bold text-blue-900 dark:text-slate-100">{existingCompany.legal_name}</p>
                <p className="text-xs text-slate-500 mt-1">{existingCompany.trade_name || 'Sem nome fantasia'}</p>
                <div className="flex gap-4 mt-3 text-xs text-slate-600 dark:text-slate-400">
                  <span>CNPJ: <strong>{formatCnpj(existingCompany.cnpj)}</strong></span>
                  {existingCompany.situation && <span>Situação: <strong>{existingCompany.situation}</strong></span>}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 text-blue-900 dark:text-slate-200 font-semibold rounded-xl text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => doRegister(cnpj.replace(/\D/g, ''), true)}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Atualizar Dados
                </button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && resultCompany && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-blue-900 dark:text-slate-100">Sucesso!</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Os dados foram salvos no sistema.</p>
              </div>

              <div className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-blue-100/50 dark:border-slate-700/50">
                <p className="text-sm font-bold text-blue-900 dark:text-slate-100">{resultCompany.legal_name}</p>
                <p className="text-xs text-slate-500 mt-1">{resultCompany.trade_name || 'Sem nome fantasia'}</p>
                <p className="text-xs text-slate-400 mt-2">CNPJ: {formatCnpj(resultCompany.cnpj)}</p>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-blue-600/20"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-red-700 dark:text-red-400">Erro</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{errorMsg}</p>
              </div>
              <button
                onClick={reset}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-blue-900 dark:text-slate-200 font-semibold rounded-xl text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-blue-100 dark:border-slate-700"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
