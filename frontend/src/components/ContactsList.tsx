import React, { useEffect, useRef, useState } from 'react';
import api from '../api/api';
import { formatCnpj } from '../lib/utils';
import {
  User, Search, Mail, Phone, Building2,
  Shield, Briefcase, BadgeCheck, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, MoreVertical, UserPlus, Star, Lock, X, Eye, FileUp,
  Users, AtSign, KeyRound
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ImportCompaniesModal } from './modals/ImportCompaniesModal';

// ─── Types ────────────────────────────────────────────────────

interface ContactPhone {
  id: number;
  number: string;
  type: string;
  is_primary: boolean;
}

interface ContactCompany {
  id: number;
  role: string;
  company: { id: number; legal_name: string; trade_name: string | null; cnpj: string };
}

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phones: ContactPhone[];
  cpf: string | null;
  avatar_url: string | null;
  created_at: string;
  contact_companies: ContactCompany[];
  collaborator: { id: number; position: string | null; department: string | null; is_active: boolean } | null;
  user: { id: number; system_role: string; is_active: boolean; last_login: string | null } | null;
}

type SortField = 'name' | 'email' | 'created_at';

interface ContactsListProps {
  onSelectContact?: (id: number) => void;
  companyId?: number;
}

// ─── Role Badge ───────────────────────────────────────────────

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  PONTO_FOCAL: { label: 'Ponto Focal', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  DPO:         { label: 'DPO',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' },
  REFERENCIA:  { label: 'Referência',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  COMUM:       { label: 'Comum',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};
function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_LABELS[role] ?? ROLE_LABELS.COMUM;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>;
}

// ─── Avatar ───────────────────────────────────────────────────
function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (url) return <img src={url} alt={name} className="w-10 h-10 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
      {initials || <User className="w-4 h-4" />}
    </div>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────
function SortIcon({ field, current, order }: { field: SortField; current: SortField; order: 'asc' | 'desc' }) {
  if (field !== current) return <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600 inline ml-1" />;
  return order === 'asc'
    ? <ChevronUp className="w-3 h-3 text-blue-500 inline ml-1" />
    : <ChevronDown className="w-3 h-3 text-blue-500 inline ml-1" />;
}

// ─── Actions Dropdown ─────────────────────────────────────────
function ActionsMenu({ contact, onAction }: {
  contact: Contact;
  onAction: (action: string, contact: Contact) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isDPO = contact.contact_companies.some(cc => cc.role === 'DPO');
  const isRef = contact.contact_companies.some(cc => cc.role === 'REFERENCIA');

  const actions = [
    {
      key: 'view',
      label: 'Ver Perfil Completo',
      icon: Eye,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'link-collaborator',
      label: contact.collaborator ? 'Ver Colaborador' : 'Vincular como Colaborador',
      icon: Briefcase,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'link-user',
      label: contact.user ? 'Gerenciar Acesso' : 'Criar Acesso ao Sistema',
      icon: Lock,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'mark-dpo',
      label: isDPO ? 'Remover papel DPO' : 'Marcar como DPO',
      icon: Shield,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      key: 'mark-referencia',
      label: isRef ? 'Remover como Referência' : 'Marcar como Referência',
      icon: Star,
      color: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`p-2 rounded-lg transition-colors ${open ? 'bg-blue-100 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
      >
        <MoreVertical className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-30 w-56 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-blue-50 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ações</p>
          </div>
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => { onAction(action.key, contact); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors text-left"
              >
                <Icon className={`w-4 h-4 ${action.color}`} />
                <span className="text-blue-900 dark:text-slate-200">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Stats {
  total: number;
  withEmail: number;
  withCollaborator: number;
  withUser: number;
}

// ─── Main Component ───────────────────────────────────────────
export default function ContactsList({ onSelectContact, companyId }: ContactsListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId) api.get('/contacts/stats').then(r => setStats(r.data)).catch(() => {});
  }, [companyId]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchContacts = () => {
    setLoading(true);
    api.get('/contacts', { params: { page, limit, search: debouncedSearch, role: roleFilter, sortBy, sortOrder, companyId } })
      .then(res => {
        setContacts(res.data.data ?? []);
        setTotalPages(res.data.totalPages ?? 1);
        setTotalRecords(res.data.total ?? 0);
      })
      .catch(() => toast.error('Erro ao carregar contatos.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchContacts(); }, [page, debouncedSearch, roleFilter, sortBy, sortOrder, companyId]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleAction = (action: string, contact: Contact) => {
    if (action === 'view') {
      onSelectContact?.(contact.id);
      return;
    }

    const messages: Record<string, string> = {
      'link-collaborator': `Módulo de Colaboradores em desenvolvimento — ${contact.name}`,
      'link-user':         `Módulo de Usuários em desenvolvimento — ${contact.name}`,
      'mark-dpo':          `Módulo DPO em desenvolvimento — ${contact.name}`,
      'mark-referencia':   `Módulo Referências em desenvolvimento — ${contact.name}`,
    };
    toast(messages[action] ?? 'Ação não implementada.', { icon: '🚧' });
  };

  const SortTh = ({ field, label }: { field: SortField; label: string }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-5 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-blue-100/30 dark:hover:bg-slate-700/30 transition-colors select-none text-left whitespace-nowrap"
    >
      {label}<SortIcon field={field} current={sortBy} order={sortOrder} />
    </th>
  );

  const statCards = [
    {
      label: 'Total de Contatos',
      value: stats?.total ?? '—',
      icon: <Users className="w-5 h-5" />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-100 dark:border-blue-500/20',
    },
    {
      label: 'Com E-mail',
      value: stats?.withEmail ?? '—',
      sub: stats ? `${Math.round((stats.withEmail / (stats.total || 1)) * 100)}%` : null,
      icon: <AtSign className="w-5 h-5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'border-emerald-100 dark:border-emerald-500/20',
    },
    {
      label: 'Colaboradores',
      value: stats?.withCollaborator ?? '—',
      icon: <Briefcase className="w-5 h-5" />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-100 dark:border-amber-500/20',
    },
    {
      label: 'Acesso ao Sistema',
      value: stats?.withUser ?? '—',
      icon: <KeyRound className="w-5 h-5" />,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-500/10',
      border: 'border-violet-100 dark:border-violet-500/20',
    },
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* ── Indicator Cards ──────────────────────────────────── */}
      {!companyId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(card => (
            <div key={card.label} className={`rounded-2xl border ${card.border} bg-white dark:bg-slate-900 p-5 flex items-center gap-4 shadow-sm`}>
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
      )}

      {/* ── Filters Bar ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome, e-mail ou telefone..."
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-blue-50/40 dark:bg-slate-800/50 border border-blue-100 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 text-blue-900 dark:text-slate-100 placeholder:text-blue-300 dark:placeholder:text-slate-500 transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl bg-blue-50/40 dark:bg-slate-800/50 border border-blue-100 dark:border-slate-700 text-sm text-blue-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
        >
          <option value="">Todos os papéis</option>
          <option value="PONTO_FOCAL">Ponto Focal</option>
          <option value="DPO">DPO</option>
          <option value="REFERENCIA">Referência</option>
          <option value="COMUM">Comum</option>
        </select>

        <button
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
        >
          <FileUp className="w-4 h-4" /> Importar
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center">
            <UserPlus className="w-12 h-12 text-blue-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Nenhum contato encontrado.</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Importe empresas ou contatos para popular a lista.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-blue-50 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-800/50">
                  <SortTh field="name" label="Contato" />
                  <SortTh field="email" label="E-mail / Telefone" />
                  <th className="px-5 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-left">Papel</th>
                  <th className="px-5 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-left hidden md:table-cell">Empresas</th>
                  <th className="px-5 py-4 text-xs font-semibold text-blue-600 dark:text-slate-400 uppercase tracking-wider text-left hidden lg:table-cell">Vínculos</th>
                  <SortTh field="created_at" label="Cadastro" />
                  <th className="px-5 py-4 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50/60 dark:divide-slate-800/60">
                {contacts.map(contact => {
                  const isExpanded = expandedId === contact.id;
                  const primaryLink = contact.contact_companies[0];
                  const extraCount = contact.contact_companies.length - 1;
                  const isDPO = contact.contact_companies.some(cc => cc.role === 'DPO');
                  const isRef = contact.contact_companies.some(cc => cc.role === 'REFERENCIA');

                  return (
                    <React.Fragment key={contact.id}>
                      <tr
                        className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/30 dark:bg-slate-800/30' : 'hover:bg-blue-50/20 dark:hover:bg-slate-800/20'}`}
                        onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                      >
                        {/* Contact Name */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-3">
                            <Avatar name={contact.name} url={contact.avatar_url} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-blue-900 dark:text-slate-100 truncate">{contact.name}</p>
                              {contact.cpf && <p className="text-[11px] text-slate-400 font-mono">{contact.cpf}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Email / Phone */}
                        <td className="px-5 py-3.5 align-middle">
                          {contact.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{contact.email}</span>
                          </div>
                        )}
                        {/* Show primary phone, or first phone */}
                        {contact.phones.length > 0 && (() => {
                          const primary = contact.phones.find(p => p.is_primary) ?? contact.phones[0];
                          return (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{primary.number}</span>
                              {contact.phones.length > 1 && (
                                <span className="text-[10px] font-semibold text-blue-400">+{contact.phones.length - 1}</span>
                              )}
                            </div>
                          );
                        })()}
                        </td>

                        {/* Role badges from all links */}
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex flex-wrap gap-1">
                            {[...new Set(contact.contact_companies.map(cc => cc.role))].map(role => (
                              <RoleBadge key={role} role={role} />
                            ))}
                          </div>
                        </td>

                        {/* Companies */}
                        <td className="px-5 py-3.5 align-middle hidden md:table-cell">
                          {primaryLink ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium truncate max-w-[140px]">
                                {primaryLink.company.legal_name}
                              </span>
                              {extraCount > 0 && (
                                <span className="text-[10px] text-slate-400 font-semibold">+{extraCount}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* Extension badges */}
                        <td className="px-5 py-3.5 align-middle hidden lg:table-cell">
                          <div className="flex gap-1.5">
                            {contact.user && (
                              <span title={`Usuário: ${contact.user.system_role}`} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 uppercase">
                                <BadgeCheck className="w-3 h-3" /> {contact.user.system_role}
                              </span>
                            )}
                            {contact.collaborator?.is_active && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 uppercase">
                                <Briefcase className="w-3 h-3" /> {contact.collaborator.position || 'Colaborador'}
                              </span>
                            )}
                            {isDPO && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 uppercase">
                                <Shield className="w-3 h-3" /> DPO
                              </span>
                            )}
                            {isRef && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 uppercase">
                                <Star className="w-3 h-3" /> Ref.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Created at */}
                        <td className="px-5 py-3.5 align-middle">
                          <span className="text-xs text-slate-400">
                            {contact.created_at ? new Date(contact.created_at).toLocaleDateString('pt-BR') : '—'}
                          </span>
                        </td>

                        {/* Actions — stop propagation so row click doesn't toggle expand */}
                        <td className="px-3 py-3.5 align-middle text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                             <button
                               onClick={() => onSelectContact?.(contact.id)}
                               className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 transition-colors"
                               title="Ver Detalhes"
                             >
                               <Eye className="w-4 h-4" />
                             </button>
                             <ActionsMenu contact={contact} onAction={handleAction} />
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="bg-blue-50/20 dark:bg-slate-800/20">
                          <td colSpan={7} className="px-5 pb-5 pt-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" /> Todas as empresas vinculadas ({contact.contact_companies.length})
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {contact.contact_companies.map(cc => (
                                  <div key={cc.id} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-blue-100 dark:border-slate-700 text-xs shadow-sm">
                                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="font-semibold text-blue-900 dark:text-slate-100 truncate max-w-[140px]">{cc.company.legal_name}</span>
                                    <span className="text-slate-400 font-mono">{formatCnpj(cc.company.cnpj)}</span>
                                    <RoleBadge role={cc.role} />
                                  </div>
                                ))}
                              </div>

                              {/* Phones */}
                              {contact.phones.length > 0 && (
                                <div className="col-span-full mb-1 mt-4">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5" /> Telefones ({contact.phones.length})
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {contact.phones.map(ph => (
                                      <div key={ph.id} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-blue-100 dark:border-slate-700 text-xs">
                                        {ph.is_primary && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Principal" />}
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        <span className="font-mono font-semibold text-blue-900 dark:text-slate-100">{ph.number}</span>
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{ph.type}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {totalRecords} contato{totalRecords !== 1 ? 's' : ''} · Página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors text-sm font-medium text-blue-700 dark:text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${p === page ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors text-sm font-medium text-blue-700 dark:text-slate-300"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modals */}
      <ImportCompaniesModal
        isOpen={isImportModalOpen}
        onClose={() => { setIsImportModalOpen(false); fetchContacts(); }}
        initialType="CONTACTS"
        companyId={companyId}
      />

    </div>
  );
}
