import { useEffect, useState } from 'react';
import api from '../api/api';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Plus, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FormPD {
  id: number;
  base_year: number;
  status: 'NAO_PREENCHIDO' | 'EM_PREENCHIMENTO' | 'FINALIZADO' | 'SUBMETIDO';
  fiscal_loss: boolean;
  submission_status?: string;
  mcti_protocol?: string;
  created_at: string;
  formpd_fiscal_incentives?: {
    total_benefit: number;
  };
}

interface FormListProps {
  companyId?: number;
}

export default function FormPDList({ companyId }: FormListProps) {
  const [forms, setForms] = useState<FormPD[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchForms = async () => {
    try {
      setLoading(true);
      // If we have a companyId, filter, otherwise we might need a different endpoint 
      // or this component is only used within company context.
      // Based on App.tsx, this is the "Programas" tab.
      const response = await api.get('/formpd', { 
        params: { companyId } 
      });
      setForms(response.data);
    } catch (error) {
      console.error('Error fetching forms:', error);
      toast.error('Erro ao carregar formulários FORMP&D');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchForms();
  }, [companyId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMETIDO':
        return <span className="px-2 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 rounded-lg flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Submetido</span>;
      case 'FINALIZADO':
        return <span className="px-2 py-1 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded-lg flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Fechado</span>;
      case 'EM_PREENCHIMENTO':
        return <span className="px-2 py-1 text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 rounded-lg flex items-center gap-1"><Clock className="w-3 h-3"/> Em Preenchimento</span>;
      default:
        return <span className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Não Iniciado</span>;
    }
  };

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-blue-50 dark:border-slate-800">
        <div className="w-16 h-16 bg-blue-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-xl font-bold text-blue-900 dark:text-slate-100 mb-2">Selecione uma Empresa</h3>
        <p className="text-slate-500 max-w-xs">Para gerenciar os Programas Fiscais e o FORMP&D, selecione primeiro uma empresa no menu lateral ou na lista de empresas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-blue-900 dark:text-slate-100 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" /> Declarações FORMP&D
        </h3>
        <button 
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all font-semibold text-sm"
          onClick={() => toast('Módulo de criação em breve')}
        >
          <Plus className="w-4 h-4" /> Novo Exercício
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-3xl" />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-blue-100 dark:border-slate-800">
          <Calendar className="w-12 h-12 text-blue-200 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">Nenhum formulário FORMP&D encontrado para esta empresa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map(form => (
            <motion.div 
              key={form.id}
              whileHover={{ y: -4 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-50 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 dark:bg-blue-900/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
              
              <div className="flex justify-between items-start mb-4 relative">
                <div>
                  <span className="text-3xl font-black text-blue-900 dark:text-slate-100">{form.base_year}</span>
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mt-1">Ano Base</p>
                </div>
                {getStatusBadge(form.status)}
              </div>

              <div className="space-y-4 relative mt-6">
                <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-slate-800/50 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Benefício Calc.</span>
                  </div>
                  <span className="text-sm font-bold text-blue-900 dark:text-slate-100 font-mono">
                    {form.formpd_fiscal_incentives?.total_benefit 
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(form.formpd_fiscal_incentives.total_benefit)
                      : 'R$ 0,00'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>Criado em {new Date(form.created_at).toLocaleDateString('pt-BR')}</span>
                  <div className="flex items-center gap-1 group-hover:text-blue-600 transition-colors">
                    Gerenciar <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats Summary for Company (Placeholder) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-600/20">
          <p className="text-blue-100 text-sm font-medium mb-1">Total de Benefícios Históricos</p>
          <h4 className="text-2xl font-bold">R$ 1.2M</h4>
          <div className="mt-4 h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white w-3/4" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-50 dark:border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-slate-500 text-sm">Obrigações Entregues</p>
            <h4 className="text-xl font-bold text-blue-900 dark:text-slate-100">8 / 12</h4>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-blue-50 dark:border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center">
            <Clock className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <p className="text-slate-500 text-sm">Próximo Vencimento</p>
            <h4 className="text-xl font-bold text-blue-900 dark:text-slate-100">31/Jul (FORMP&D)</h4>
          </div>
        </div>
      </div>
    </div>
  );
}
