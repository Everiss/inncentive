import { useEffect, useState } from 'react';
import api from '../api/api';
import { formatCnpj } from '../lib/utils';
import {
  Building2, ArrowLeft, MapPin, Mail, Phone, Calendar, DollarSign,
  FileText, Users, Shield, RefreshCw, Tag, Globe, Briefcase,
  Contact, Truck, FolderKanban, Target, ClipboardList, BrainCircuit
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ImportCompaniesModal } from './modals/ImportCompaniesModal';
import ProjectsList from './ProjectsList';
import ContactsList from './ContactsList';
import CollaboratorsList from './CollaboratorsList';
import FormPDList from './FormPDList';
import TabForms from './TabForms';

interface Props {
  companyId: number;
  onBack: () => void;
}

type CompanyTab = 'resumo' | 'contatos' | 'colaboradores' | 'projetos' | 'fornecedores' | 'programas' | 'fiscal' | 'forms';

const TABS: { key: CompanyTab; label: string; icon: any }[] = [
  { key: 'resumo',        label: 'Resumo',        icon: ClipboardList },
  { key: 'contatos',      label: 'Contatos',      icon: Contact },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users },
  { key: 'projetos',      label: 'Projetos',      icon: FolderKanban },
  { key: 'fornecedores',  label: 'Fornecedores',  icon: Truck },
  { key: 'programas',     label: 'Programas',     icon: Target },
  { key: 'fiscal',        label: 'Fiscal',        icon: Shield },
  { key: 'forms',         label: 'FORMs',         icon: BrainCircuit },
];

// ─── Reusable InfoCard ────────────────────────────────────────
function InfoCard({ icon: Icon, label, value, color = 'blue' }: { icon: any; label: string; value: string | null | undefined; color?: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-blue-50 dark:border-slate-800/50">
      <div className={`w-9 h-9 rounded-lg bg-${color}-100 dark:bg-${color}-500/15 flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 text-${color}-600 dark:text-${color}-400`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-blue-900 dark:text-slate-100 mt-0.5 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── Placeholder for future modules ──────────────────────────
function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-12 text-center">
      <div className="w-16 h-16 bg-blue-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FolderKanban className="w-7 h-7 text-blue-400 dark:text-slate-500" />
      </div>
      <h4 className="text-lg font-bold text-blue-900 dark:text-slate-100">{label}</h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
        Este módulo será implementado em breve. Aqui você poderá gerenciar os {label.toLowerCase()} vinculados a esta empresa.
      </p>
    </div>
  );
}

// ─── Tab: Resumo ─────────────────────────────────────────────
function TabResumo({ company }: { company: any }) {
  const addr = company.addresses?.[0];
  const primaryCnae = company.company_cnaes?.find((cc: any) => cc.is_primary);
  const secondaryCnaes = company.company_cnaes?.filter((cc: any) => !cc.is_primary) || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Info Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" /> Dados Cadastrais
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoCard icon={FileText} label="CNPJ" value={formatCnpj(company.cnpj)} />
          <InfoCard icon={Calendar} label="Data de Abertura" value={company.open_date ? new Date(company.open_date).toLocaleDateString('pt-BR') : null} />
          <InfoCard icon={Shield} label="Natureza Jurídica" value={company.legal_nature} color="indigo" />
          <InfoCard icon={Briefcase} label="Porte" value={company.porte} color="indigo" />
          <InfoCard icon={DollarSign} label="Capital Social" value={company.capital_social ? `R$ ${Number(company.capital_social).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null} color="emerald" />
          <InfoCard icon={Globe} label="Status" value={company.status} />
        </div>
      </div>

      {/* Contact + Address */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" /> Contato
          </h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-slate-400" />
              <span className="text-blue-900 dark:text-slate-200">{company.email || 'Não informado'}</span>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500 font-semibold uppercase text-[10px]">Telefones:</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-7">
                {company.phones && company.phones.length > 0 ? (
                  company.phones.map((ph: any) => (
                    <div key={ph.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <span className="text-xs font-mono font-semibold text-blue-900 dark:text-slate-200">{ph.number}</span>
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                        {ph.type}
                      </span>
                      {ph.is_primary && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Principal" />
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">Nenhum cadastrado</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" /> Endereço
          </h3>
          {addr ? (
            <div className="flex flex-col gap-1 text-sm text-blue-900 dark:text-slate-200">
              <p>{addr.street}{addr.number ? `, ${addr.number}` : ''}{addr.complement ? ` - ${addr.complement}` : ''}</p>
              <p>{addr.neighborhood}</p>
              <p>{addr.city} - {addr.state}</p>
              <p className="text-slate-500">CEP: {addr.zip_code || '—'}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">Endereço não cadastrado.</p>
          )}
        </div>
      </div>

      {/* CNAEs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4 text-blue-500" /> Atividades Econômicas (CNAEs)
        </h3>
        {primaryCnae && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl flex items-center gap-3">
            <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded uppercase">Principal</span>
            <span className="text-sm font-semibold text-blue-900 dark:text-slate-100">{primaryCnae.cnae_code}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{primaryCnae.cnaes?.description}</span>
          </div>
        )}
        {secondaryCnaes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {secondaryCnaes.map((cc: any) => (
              <div key={cc.cnae_code} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg transition-colors">
                <span className="text-sm font-mono font-semibold text-slate-600 dark:text-slate-300 w-24 shrink-0">{cc.cnae_code}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{cc.cnaes?.description}</span>
              </div>
            ))}
          </div>
        ) : (
          !primaryCnae && <p className="text-sm text-slate-400 italic">Nenhum CNAE registrado.</p>
        )}
      </div>

      {/* Metadata Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 pb-2">
        <span>Criado em: {company.created_at ? new Date(company.created_at).toLocaleString('pt-BR') : '—'}</span>
        <span>Última atualização: {company.updated_at ? new Date(company.updated_at).toLocaleString('pt-BR') : '—'}</span>
      </div>
    </div>
  );
}

// ─── Tab: Fiscal (Sócios + Regimes) ─────────────────────────
function TabFiscal({ company }: { company: any }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Partners */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" /> Quadro Societário
        </h3>
        {company.company_partners && company.company_partners.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {company.company_partners.map((cp: any) => (
              <div key={cp.id} className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-blue-50 dark:border-slate-800/50">
                <p className="text-sm font-bold text-blue-900 dark:text-slate-100">{cp.partners?.name || 'Sócio'}</p>
                {cp.qualification && <p className="text-xs text-slate-500 mt-1">{cp.qualification}</p>}
                {cp.legal_rep_name && (
                  <p className="text-[11px] text-slate-400 mt-2">Rep. Legal: {cp.legal_rep_name}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Nenhum sócio registrado.</p>
        )}
      </div>

      {/* Tax Regimes */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm p-6">
        <h3 className="text-base font-bold text-blue-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-500" /> Regimes Tributários
        </h3>
        {company.tax_regregimes && company.tax_regregimes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {company.tax_regregimes.map((tr: any) => (
              <div key={tr.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-blue-50 dark:border-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${tr.is_optant ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {tr.type}
                  </span>
                  <span className="text-sm text-blue-900 dark:text-slate-200">
                    {tr.is_optant ? 'Optante' : 'Não optante'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {tr.opt_in_date && `Desde ${new Date(tr.opt_in_date).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Nenhum regime tributário cadastrado.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function CompanyDetail({ companyId, onBack }: Props) {
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<CompanyTab>('resumo');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const fetchCompany = () => {
    setLoading(true);
    api.get(`/companies/${companyId}`)
      .then(res => {
        setCompany(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        toast.error('Erro ao carregar empresa.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCompany();
  }, [companyId]);

  const handleRefreshFromReceita = async () => {
    if (!company?.cnpj) return;
    setRefreshing(true);
    try {
      await api.post('/companies/register-cnpj', { cnpj: company.cnpj, forceUpdate: true });
      toast.success('Dados atualizados com a Receita Federal!');
      fetchCompany();
    } catch {
      toast.error('Falha ao atualizar.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-24 text-slate-500">Empresa não encontrada.</div>
    );
  }

  const renderTab = () => {
    return (
      <div className="flex flex-col gap-4">
        
        {(() => {
          switch (activeTab) {
            case 'resumo':        return <TabResumo company={company} />;
            case 'fiscal':        return <TabFiscal company={company} />;
            case 'contatos':      return <ContactsList companyId={companyId} />;
            case 'colaboradores': return <CollaboratorsList companyId={companyId} />;
            case 'projetos':      return <ProjectsList companyId={companyId} />;
            case 'fornecedores':   return <TabPlaceholder label="Fornecedores" />;
            case 'programas':      return <FormPDList companyId={companyId} />;
            case 'forms':          return <TabForms companyId={companyId} cnpj={company.cnpj} />;
            default:              return null;
          }
        })()}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back Button & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Empresas
        </button>
        <button
          onClick={handleRefreshFromReceita}
          disabled={refreshing}
          className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 font-semibold rounded-xl text-sm flex items-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors disabled:opacity-50 border border-indigo-200 dark:border-indigo-500/30"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar via ReceitaWS
        </button>
      </div>

      {/* Company Header Card (always visible) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{company.legal_name}</h2>
            <p className="text-blue-100 text-sm mt-0.5 truncate">{company.trade_name || 'Sem nome fantasia'}</p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1">
            <span className="px-3 py-1 bg-white/20 backdrop-blur text-white text-xs font-bold rounded-lg">
              {formatCnpj(company.cnpj)}
            </span>
            {company.situation && (
              <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md ${company.situation === 'ATIVA' ? 'bg-emerald-500/30 text-emerald-100' : 'bg-red-500/30 text-red-100'}`}>
                {company.situation}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-hide border-b border-blue-50 dark:border-slate-800">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 shrink-0
                  ${isActive
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 bg-blue-50/50 dark:bg-slate-800/50'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-slate-200 hover:bg-blue-50/30 dark:hover:bg-slate-800/30'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      {renderTab()}

      <ImportCompaniesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialType={activeTab === 'colaboradores' ? 'COLLABORATORS' : 'CONTACTS'}
        companyId={companyId}
      />
    </div>
  );
}
