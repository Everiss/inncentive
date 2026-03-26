import { useState, useEffect } from 'react';
import { NavButton } from './components/layout/NavButton';
import { TopBar } from './components/layout/TopBar';
import CompaniesList from './components/CompaniesList';
import CompanyDetail from './components/CompanyDetail';
import ContactsList from './components/ContactsList';
import ContactDetail from './components/ContactDetail';
import CollaboratorsList from './components/CollaboratorsList';
import ProjectsList from './components/ProjectsList';
import { Icons } from './components/Icons';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from './api/socket';
import { Toaster, toast } from 'react-hot-toast';
import ImportBatchesList from './components/ImportBatchesList';
import FormsList from './components/FormsList';

type Tab = 'dashboard' | 'empresas' | 'contatos' | 'colaboradores' | 'projetos' | 'programas' | 'processamentos' | 'forms' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('empresas');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored !== null ? stored === 'dark' : prefersDark;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return isDark;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    socket.on('import:progress', (data) => {
      toast.loading(`Importando... ${data.current}/${data.total}: ${data.message}`, { id: 'import-progress', style: { borderRadius: '12px' } });
    });

    socket.on('import:completed', (data) => {
      toast.success(`Importação finalizada! ${data.success} Salvos, ${data.failed} Inválidos.`, { id: 'import-progress', duration: 8000, style: { background: '#10b981', color: '#fff', borderRadius: '12px' } });
    });

    return () => {
      socket.off('import:progress');
      socket.off('import:completed');
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-blue-50/30 dark:bg-slate-950 text-blue-900 dark:text-slate-100 font-sans"
      style={{ backgroundColor: darkMode ? '#020617' : '#f0f7ff', color: darkMode ? '#f1f5f9' : '#0f172a' }}
    >
      <Toaster position="bottom-right" />
      {/* Top navigation bar */}
      <TopBar
        darkMode={darkMode}
        onDarkModeToggle={() => setDarkMode((d) => !d)}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />

      {/* Sidebar / Nav */}
      <nav
        className={`fixed bottom-0 left-0 right-0 md:top-0 md:bottom-0 md:right-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t md:border-t-0 md:border-r border-blue-100/50 dark:border-slate-700/50 z-40 transition-all duration-300 ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}
        style={{ backgroundColor: darkMode ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.9)' }}
      >
        <div className="h-full flex flex-col p-2 md:p-4">
          <div className={`hidden md:flex items-center mb-6 mt-2 ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-2'}`}>
            {!sidebarCollapsed && (
              <>
                <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
                  <Icons.Building2 className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight text-blue-900 dark:text-slate-100 flex-1 truncate">InnCentive</span>
              </>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-xl text-blue-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors shrink-0"
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {sidebarCollapsed ? <Icons.ChevronRight className="w-4 h-4" /> : <Icons.ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex md:flex-col items-center md:items-stretch justify-around md:justify-start gap-1 flex-1 overflow-y-auto">
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="LayoutDashboard" label="Dashboard" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'empresas'} onClick={() => { setActiveTab('empresas'); setSelectedCompanyId(null); }} icon="Building2" label="Empresas" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'contatos'} onClick={() => { setActiveTab('contatos'); setSelectedContactId(null); }} icon="Users" label="Contatos" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'colaboradores'} onClick={() => setActiveTab('colaboradores')} icon="Briefcase" label="Colaboradores" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'projetos'} onClick={() => setActiveTab('projetos')} icon="FolderKanban" label="Projetos" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'programas'} onClick={() => setActiveTab('programas')} icon="Target" label="Programas" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'forms'} onClick={() => setActiveTab('forms')} icon="FileSpreadsheet" label="Forms" collapsed={sidebarCollapsed} />
            <NavButton active={activeTab === 'processamentos'} onClick={() => setActiveTab('processamentos')} icon="Server" label="Processamentos" collapsed={sidebarCollapsed} />
            <div className="flex-1" />
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="Settings" label="Configurações" collapsed={sidebarCollapsed} />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className={`pt-14 pb-24 md:pb-8 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
        <div className="p-4 md:p-8">
          <header className="flex items-start sm:items-center justify-between mb-10 mt-4 md:mt-0 gap-4 flex-col sm:flex-row">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-blue-900 dark:text-slate-100">
                {activeTab === 'dashboard' && 'Dashboard'}
                {activeTab === 'empresas' && !selectedCompanyId && 'Empresas Cadastradas'}
                {activeTab === 'empresas' && selectedCompanyId && 'Detalhes da Empresa'}
                {activeTab === 'contatos' && !selectedContactId && 'Contatos'}
                {activeTab === 'contatos' && selectedContactId && 'Detalhes do Contato'}
                {activeTab === 'colaboradores' && 'Colaboradores'}
                {activeTab === 'projetos' && 'Projetos e Iniciativas'}
                {activeTab === 'programas' && 'Programas Fiscais'}
                {activeTab === 'forms' && 'Forms'}
                {activeTab === 'processamentos' && 'Fila de Processamento'}
                {activeTab === 'settings' && 'Configurações do Sistema'}
              </h2>
              <p className="text-blue-500 dark:text-slate-400 font-medium mt-1">
                {activeTab === 'dashboard' && 'Visão geral do ecossistema InnCentive.'}
                {activeTab === 'empresas' && !selectedCompanyId && 'Gerencie seus clientes e grupos econômicos.'}
                {activeTab === 'empresas' && selectedCompanyId && 'Informações detalhadas sobre a empresa selecionada.'}
                {activeTab === 'contatos' && !selectedContactId && 'Pessoas vinculadas a uma ou mais empresas.'}
                {activeTab === 'contatos' && selectedContactId && 'Informações completas do perfil.'}
                {activeTab === 'colaboradores' && 'Equipe interna e prestadores vinculados.'}
                {activeTab === 'projetos' && 'Acompanhe as iniciativas de PID e dedutivo.'}
                {activeTab === 'programas' && 'Administração anual de incentivos e relatórios.'}
                {activeTab === 'forms' && 'Todos os formulários FORMP&D importados e extraídos por NINA.'}
                {activeTab === 'processamentos' && 'Monitore os lotes de arquivos sendo importados em segundo plano.'}
                {activeTab === 'settings' && 'Ajuste os parâmetros dinâmicos e de sistema.'}
              </p>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {activeTab === 'empresas' && !selectedCompanyId && (
              <motion.div key="empresas" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <CompaniesList onSelectCompany={(id: number) => setSelectedCompanyId(id)} />
              </motion.div>
            )}

            {activeTab === 'empresas' && selectedCompanyId && (
              <motion.div key="empresa-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <CompanyDetail companyId={selectedCompanyId} onBack={() => setSelectedCompanyId(null)} />
              </motion.div>
            )}

            {activeTab === 'contatos' && !selectedContactId && (
              <motion.div key="contatos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <ContactsList onSelectContact={(id: number) => setSelectedContactId(id)} />
              </motion.div>
            )}

            {activeTab === 'contatos' && selectedContactId && (
              <motion.div key="contato-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
              </motion.div>
            )}

            {activeTab === 'colaboradores' && (
              <motion.div key="colaboradores" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <CollaboratorsList onSelectContact={(id: number) => { setSelectedContactId(id); setActiveTab('contatos'); }} />
              </motion.div>
            )}

            {activeTab === 'projetos' && (
              <motion.div key="projetos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <ProjectsList />
              </motion.div>
            )}

            {activeTab === 'processamentos' && (
              <motion.div key="processamentos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <ImportBatchesList />
              </motion.div>
            )}

            {activeTab === 'forms' && (
              <motion.div key="forms" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <FormsList onSelectCompany={(id) => { setSelectedCompanyId(id); setActiveTab('empresas'); }} />
              </motion.div>
            )}
            
            {(activeTab === 'dashboard' || activeTab === 'settings' || activeTab === 'programas') && (
               <motion.div key="other" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                 <div className="p-12 text-center text-blue-500 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-800">
                    Módulo em desenvolvimento ({activeTab}).
                 </div>
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
