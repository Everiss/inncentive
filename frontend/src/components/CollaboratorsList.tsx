import { useEffect, useState } from 'react';
import api from '../api/api';
import {
  Search, Mail, Building2, Briefcase, BadgeCheck,
  ChevronLeft, ChevronRight, Eye, FileUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ImportCompaniesModal } from './modals/ImportCompaniesModal';

interface Collaborator {
  id: number;
  position: string | null;
  department: string | null;
  registration_number: string | null;
  admission_date: string | null;
  is_active: boolean;
  contact: {
    id: number;
    name: string;
    email: string | null;
    avatar_url: string | null;
    phones: { id: number; number: string; type: string; is_primary: boolean }[];
  };
}

interface CollaboratorsListProps {
  onSelectContact?: (id: number) => void;
  companyId?: number;
}

export default function CollaboratorsList({ onSelectContact, companyId }: CollaboratorsListProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchCollaborators = () => {
    setLoading(true);
    api.get('/collaborators', { params: { page, limit, search: debouncedSearch, companyId } })
      .then(res => {
        setCollaborators(res.data.data ?? []);
        setTotalPages(res.data.totalPages ?? 1);
      })
      .catch(() => toast.error('Erro ao carregar colaboradores.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCollaborators(); }, [page, debouncedSearch, companyId]);

  return (
    <div className="flex flex-col gap-6">
      
      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar colaborador..."
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-blue-50/40 dark:bg-slate-800/50 border border-blue-100 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 text-blue-900 dark:text-slate-100 transition-all"
          />
        </div>

        <button
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-600/20"
        >
          <FileUp className="w-4 h-4" /> Importar XL
        </button>
      </div>

      {/* Grid View */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        </div>
      ) : collaborators.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-blue-100 dark:border-slate-800">
           <Briefcase className="w-12 h-12 text-blue-100 mx-auto mb-3" />
           <p className="text-slate-500 font-medium">Nenhum colaborador encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collaborators.map(collab => {
            const initials = collab.contact.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
            return (
              <div key={collab.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-100 dark:border-slate-800 p-6 hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                   <button onClick={() => onSelectContact?.(collab.contact.id)} className="p-2 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl hover:scale-105 transition-transform">
                      <Eye className="w-4 h-4" />
                   </button>
                </div>

                <div className="flex items-center gap-4 mb-5">
                   <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center text-xl font-bold shadow-lg">
                      {initials}
                   </div>
                   <div className="min-w-0">
                      <h3 className="font-bold text-blue-900 dark:text-slate-100 truncate pr-8">{collab.contact.name}</h3>
                      <p className="text-xs text-slate-500 font-medium truncate">{collab.position || 'Sem cargo'}</p>
                   </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-blue-50 dark:border-slate-800">
                   <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Depto:</span>
                      <span className="font-semibold">{collab.department || '—'}</span>
                   </div>
                   <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Matrícula:</span>
                      <span className="font-mono">{collab.registration_number || '—'}</span>
                   </div>
                   <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <Mail className="w-3.5 h-3.5 text-blue-400" />
                      <span className="truncate">{collab.contact.email || 'N/A'}</span>
                   </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                   <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${collab.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {collab.is_active ? 'Ativo' : 'Afastado'}
                   </span>
                   {collab.admission_date && (
                     <span className="text-[10px] text-slate-400 font-medium">Admitido {new Date(collab.admission_date).toLocaleDateString('pt-BR')}</span>
                   )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
         <div className="flex justify-center items-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 bg-white rounded-xl disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-bold">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 bg-white rounded-xl disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
         </div>
      )}

      <ImportCompaniesModal
        isOpen={isImportModalOpen}
        onClose={() => { setIsImportModalOpen(false); fetchCollaborators(); }}
        initialType="COLLABORATORS"
        companyId={companyId}
      />
    </div>
  );
}
