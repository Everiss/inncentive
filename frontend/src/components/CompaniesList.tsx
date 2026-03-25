import { useEffect, useState } from 'react';
import api from '../api/api';
import { Building2, Plus, Search, MoreHorizontal, ArrowUpRight, UploadCloud, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Sparkles, LayoutGrid } from 'lucide-react';
import { ImportCompaniesModal } from './modals/ImportCompaniesModal';
import { NewCompanyModal } from './modals/NewCompanyModal';
import { formatCnpj } from '../lib/utils';

interface Company {
  id: number;
  cnpj: string;
  legal_name: string;
  trade_name?: string;
  email?: string;
  phone?: string;
  addresses: any[];
}

interface Stats {
  total: number;
  active: number;
  irregular: number;
  newThisMonth: number;
}

interface Props {
  onSelectCompany: (id: number) => void;
}

export default function CompaniesList({ onSelectCompany }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  
  // Pagination & Sorting States
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [sortBy, setSortBy] = useState('legal_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    api.get('/companies/stats').then(res => setStats(res.data)).catch(() => {});
  }, []);

  const fetchCompanies = () => {
    setLoading(true);
    api.get('/companies', {
      params: {
        page,
        limit,
        search: debouncedSearchTerm,
        sortBy,
        sortOrder
      }
    })
      .then(res => {
        setCompanies(res.data.data);
        setTotalPages(res.data.totalPages);
        setTotalRecords(res.data.total);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCompanies();
  }, [page, limit, debouncedSearchTerm, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4 inline ml-1" /> : <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const statCards = [
    {
      label: 'Total de Empresas',
      value: stats?.total ?? '—',
      icon: <LayoutGrid className="w-5 h-5" />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-100 dark:border-blue-500/20',
    },
    {
      label: 'Ativas',
      value: stats?.active ?? '—',
      sub: stats ? `${Math.round((stats.active / (stats.total || 1)) * 100)}%` : null,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'border-emerald-100 dark:border-emerald-500/20',
    },
    {
      label: 'Situação Irregular',
      value: stats?.irregular ?? '—',
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-100 dark:border-amber-500/20',
    },
    {
      label: 'Novas este Mês',
      value: stats?.newThisMonth ?? '—',
      icon: <Sparkles className="w-5 h-5" />,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-500/10',
      border: 'border-violet-100 dark:border-violet-500/20',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Indicator Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div
            key={card.label}
            className={`rounded-2xl border ${card.border} bg-white dark:bg-slate-900 p-5 flex items-center gap-4 shadow-sm`}
          >
            <div className={`w-11 h-11 rounded-xl ${card.bg} ${card.color} flex items-center justify-center shrink-0`}>
              {card.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{card.label}</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
                {card.sub && <span className="text-xs text-slate-400 dark:text-slate-500">{card.sub}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-blue-100 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-blue-900 dark:text-slate-100 transition-all placeholder:text-blue-300 dark:placeholder:text-slate-500 shadow-sm"
          />
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-3">
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-900 dark:text-slate-100 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 border border-blue-100 dark:border-slate-700 shadow-sm"
          >
            <UploadCloud className="w-4 h-4 text-blue-500" />
            Importar
          </button>
          <button 
            onClick={() => setIsNewCompanyModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Empresa
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-blue-50 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-800/50">
                <th 
                  className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-blue-100/50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => handleSort('legal_name')}
                >
                  Empresa <SortIcon field="legal_name" />
                </th>
                <th 
                  className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-blue-100/50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => handleSort('cnpj')}
                >
                  CNPJ <SortIcon field="cnpj" />
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Contato</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Localização</th>
                <th className="px-6 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-blue-50 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-blue-400 dark:text-slate-500">
                    {searchTerm ? "Nenhuma empresa encontrada com os filtros atuais." : "Nenhuma empresa cadastrada."}
                  </td>
                </tr>
              ) : (
                companies.map(company => (
                  <tr key={company.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-blue-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-xs">{company.legal_name}</p>
                          <p className="text-xs text-blue-500 dark:text-slate-500 truncate max-w-[200px] sm:max-w-xs">{company.trade_name || company.legal_name}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 align-middle text-sm font-medium text-slate-600 dark:text-slate-300">
                      {formatCnpj(company.cnpj)}
                    </td>
                    
                    <td className="px-6 py-4 align-middle hidden md:table-cell">
                      <div className="flex flex-col gap-1">
                        {company.email && (
                          <span className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={company.email}>
                            {company.email}
                          </span>
                        )}
                        {company.phone && (
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            {company.phone}
                          </span>
                        )}
                        {!company.email && !company.phone && (
                          <span className="text-xs text-slate-400 italic">Sem contato</span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 align-middle hidden lg:table-cell">
                      {company.addresses?.[0] ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[180px]" title={`${company.addresses[0].city} - ${company.addresses[0].state}`}>
                          {company.addresses[0].city} - {company.addresses[0].state}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Não informado</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 align-middle text-right">
                      <button 
                        onClick={() => onSelectCompany(company.id)}
                        className="inline-flex items-center justify-center p-2 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-slate-800 transition-colors"
                        title="Ver detalhes"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                      <button className="inline-flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        <div className="p-4 border-t border-blue-50 dark:border-slate-800 flex items-center justify-between text-sm bg-slate-50/50 dark:bg-slate-800/20">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Mostrando <span className="text-blue-600 dark:text-blue-400">{companies.length}</span> de <span className="text-blue-600 dark:text-blue-400">{totalRecords}</span> empresas</span>
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-blue-600 dark:text-slate-300 rounded-lg transition-colors font-semibold"
            >
              Anterior
            </button>
            <span className="px-3 font-semibold text-slate-600 dark:text-slate-300">Página {page} de {totalPages || 1}</span>
            <button 
              disabled={page >= totalPages || totalPages === 0} 
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-blue-600 dark:text-slate-300 rounded-lg transition-colors font-semibold"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      <ImportCompaniesModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onSuccess={() => fetchCompanies()}
      />
      <NewCompanyModal
        isOpen={isNewCompanyModalOpen}
        onClose={() => setIsNewCompanyModalOpen(false)}
        onSuccess={() => fetchCompanies()}
      />
    </div>
  );
}
