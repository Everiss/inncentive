import { useEffect, useState } from 'react';
import api from '../api/api';
import {
  User, Mail, Building2, Briefcase, BadgeCheck,
  ArrowLeft, FileText, Star, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  contactId: number;
  onBack: () => void;
}

export default function ContactDetail({ contactId, onBack }: Props) {
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/contacts/${contactId}`)
      .then(res => {
        setContact(res.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error('Erro ao carregar detalhes do contato.');
        setLoading(false);
      });
  }, [contactId]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
  );

  if (!contact) return <div className="text-center py-24 text-slate-500">Contato não encontrado.</div>;

  const initials = contact.name.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline w-fit">
        <ArrowLeft className="w-4 h-4" /> Voltar para a lista
      </button>

      {/* Header Profile */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-blue-100 dark:border-slate-800 shadow-sm overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {contact.avatar_url ? (
            <img src={contact.avatar_url} className="w-24 h-24 rounded-3xl object-cover shadow-lg" alt={contact.name} />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-3xl font-bold shadow-lg">
              {initials}
            </div>
          )}
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold text-blue-900 dark:text-slate-100">{contact.name}</h2>
            <p className="text-blue-500 dark:text-slate-400 font-medium flex items-center justify-center sm:justify-start gap-2 mt-1">
              <Mail className="w-4 h-4" /> {contact.email || 'E-mail não cadastrado'}
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
              {contact.user && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                  <BadgeCheck className="w-3.5 h-3.5" /> USUÁRIO {contact.user.system_role}
                </span>
              )}
              {contact.collaborator && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                  <Briefcase className="w-3.5 h-3.5" /> COLABORADOR
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-5 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" /> Informações de Contato
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">CPF</p>
                <p className="text-sm font-semibold text-blue-900 dark:text-slate-200 mt-0.5">{contact.cpf || '—'}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-11">Telefones</p>
               <div className="space-y-2 ml-11">
                {contact.phones?.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="text-sm font-mono font-medium text-blue-900 dark:text-slate-100">{p.number}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{p.type}</span>
                    {p.is_primary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </div>
                ))}
                {(!contact.phones || contact.phones.length === 0) && <p className="text-sm text-slate-400 italic">Nenhum telefone</p>}
               </div>
            </div>
          </div>
        </div>

        {/* Company Links */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-5 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> Empresas Vinculadas
          </h3>
          <div className="space-y-3">
            {contact.contact_companies?.map((cc: any) => (
              <div key={cc.id} className="p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-blue-50 dark:border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-blue-900 dark:text-slate-200 truncate">{cc.company.legal_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{cc.company.cnpj}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 whitespace-nowrap ml-4 uppercase">
                  {cc.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extensions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collaborator Details */}
        {contact.collaborator && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 shadow-sm p-6">
            <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-400 mb-5 flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Dados do Colaborador
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cargo</p>
                <p className="text-sm font-semibold text-blue-900 dark:text-slate-200 mt-1">{contact.collaborator.position || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Departamento</p>
                <p className="text-sm font-semibold text-blue-900 dark:text-slate-200 mt-1">{contact.collaborator.department || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Matrícula</p>
                <p className="text-sm font-mono font-semibold text-blue-900 dark:text-slate-200 mt-1">{contact.collaborator.registration_number || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Data de Admissão</p>
                <p className="text-sm font-semibold text-blue-900 dark:text-slate-200 mt-1">
                  {contact.collaborator.admission_date ? new Date(contact.collaborator.admission_date).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* User Account */}
        {contact.user && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-blue-500/20 shadow-sm p-6 text-center sm:text-left">
            <h3 className="text-base font-bold text-blue-900 dark:text-blue-400 mb-5 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Acesso ao Sistema
            </h3>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20">
                <BadgeCheck className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-sm font-bold text-blue-900 dark:text-slate-200 uppercase">{contact.user.system_role}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${contact.user.is_active ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                    {contact.user.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {contact.user.last_login && (
                   <p className="text-xs text-slate-500 mt-1">Último acesso: {new Date(contact.user.last_login).toLocaleString('pt-BR')}</p>
                )}
                <p className="text-xs text-slate-500 mt-0.5">Membro desde {new Date(contact.user.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
