import { useEffect, useState } from 'react';
import api from '../api/api';
import {
  FolderKanban,
  Search,
  Calendar,
  Building2,
  Plus,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { ImportCompaniesModal } from './modals/ImportCompaniesModal';

interface ProjectSnapshot {
  id: number;
  base_year: number;
  snapshot_status: 'ABERTO' | 'EM_REVISAO' | 'FECHADO';
  computed_total_eligible: number;
  eligibility_status: 'NAO_AVALIADO' | 'ELEGIVEL' | 'PARCIALMENTE_ELEGIVEL' | 'INELEGIVEL';
}

interface Project {
  id: number;
  code: string | null;
  title: string;
  objective: string | null;
  category: 'PESQUISA_BASICA' | 'PESQUISA_APLICADA' | 'DESENVOLVIMENTO_EXPERIMENTAL' | 'INOVACAO_TECNOLOGICA';
  project_status: 'PLANEJAMENTO' | 'EM_EXECUCAO' | 'CONCLUIDO' | 'CANCELADO';
  eligibility_status: 'NAO_AVALIADO' | 'ELEGIVEL' | 'PARCIALMENTE_ELEGIVEL' | 'INELEGIVEL';
  is_continuous: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  companies: {
    id: number;
    legal_name: string;
    trade_name: string | null;
    cnpj: string;
  };
  contacts: { id: number; name: string } | null;
  rdi_project_annual_snapshots: ProjectSnapshot[];
  _count: {
    rdi_hr_allocations: number;
    rdi_expense_allocations: number;
    rdi_project_documents: number;
  };
}

interface ProjectsListProps {
  companyId?: number;
}

export default function ProjectsList({ companyId }: ProjectsListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await api.get('/projects', {
        params: {
          query: searchTerm,
          companyId: companyId
        }
      });
      setProjects(response.data);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar projetos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [searchTerm]);

  const STATUS_LABEL: Record<Project['project_status'], string> = {
    PLANEJAMENTO: 'Planejamento',
    EM_EXECUCAO: 'Em execução',
    CONCLUIDO: 'Concluído',
    CANCELADO: 'Cancelado',
  };

  const CATEGORY_LABEL: Record<Project['category'], string> = {
    PESQUISA_BASICA: 'Pesquisa Básica',
    PESQUISA_APLICADA: 'Pesquisa Aplicada',
    DESENVOLVIMENTO_EXPERIMENTAL: 'Des. Experimental',
    INOVACAO_TECNOLOGICA: 'Inovação Tecnológica',
  };

  const getStatusColor = (status: Project['project_status']) => {
    switch (status) {
      case 'PLANEJAMENTO': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case 'EM_EXECUCAO': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
      case 'CONCLUIDO': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
      case 'CANCELADO': return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: Project['project_status']) => {
    switch (status) {
      case 'PLANEJAMENTO': return Clock;
      case 'EM_EXECUCAO': return Clock;
      case 'CONCLUIDO': return CheckCircle2;
      case 'CANCELADO': return AlertCircle;
      default: return FolderKanban;
    }
  };

  const getEligibilityBadge = (status: Project['eligibility_status']) => {
    switch (status) {
      case 'ELEGIVEL': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'PARCIALMENTE_ELEGIVEL': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'INELEGIVEL': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <FolderKanban className="w-6 h-6 text-white" />
            </div>
            Gestão de Projetos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
            Visualize e gerencie as iniciativas e cronogramas das empresas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold rounded-xl text-sm border border-blue-100 dark:border-slate-700 hover:bg-blue-50 transition-all shadow-sm"
          >
            <FileUp className="w-4 h-4" /> Importar
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4" /> Novo Projeto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
          <Filter className="w-4 h-4" /> Filtros
        </button>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, idx) => {
            const latestSnapshot = project.rdi_project_annual_snapshots?.[0];
            const totalEligible = latestSnapshot?.computed_total_eligible ?? 0;
            const Icon = getStatusIcon(project.project_status);
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={project.id}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-blue-50 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all p-5 flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Status + Eligibility */}
                <div className="flex justify-between items-start">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${getStatusColor(project.project_status)}`}>
                    <Icon className="w-3 h-3" />
                    {STATUS_LABEL[project.project_status]}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${getEligibilityBadge(project.eligibility_status)}`}>
                    {project.eligibility_status.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  {project.code && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{project.code}</p>
                  )}
                  <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight">
                    {project.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {project.objective || 'Objetivo não definido.'}
                  </p>
                </div>

                {/* Category + Snapshot total */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md font-semibold">
                    {CATEGORY_LABEL[project.category]}
                  </span>
                  {totalEligible > 0 && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {fmt(totalEligible)}
                    </span>
                  )}
                </div>

                {/* Company Info */}
                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-50 dark:border-slate-800/50">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                      {project.companies?.trade_name || project.companies?.legal_name}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium">CNPJ: {project.companies?.cnpj}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">
                      {project.start_date ? new Date(project.start_date).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-slate-400 font-medium">
                    {project._count?.rdi_hr_allocations > 0 && (
                      <span>{project._count.rdi_hr_allocations} aloc.</span>
                    )}
                    {project.is_continuous && (
                      <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded font-bold">contínuo</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-blue-900 dark:text-slate-100">Nenhum projeto encontrado</h3>
          <p className="text-slate-500 max-w-xs mx-auto text-sm mt-1">
            Parece que você ainda não tem projetos registrados ou sua busca não retornou resultados.
          </p>
          <button className="mt-6 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-600/20">
            Criar Primeiro Projeto
          </button>
        </div>
      )}

      <ImportCompaniesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialType="PROJECTS"
        onSuccess={fetchProjects}
        companyId={companyId}
      />
    </div>
  );
}