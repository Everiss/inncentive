import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Icons } from '../Icons';
import { socket } from '../../api/socket';

interface TopBarProps {
  darkMode: boolean;
  onDarkModeToggle: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'success' | 'info' | 'default';
}

export function TopBar({
  darkMode,
  onDarkModeToggle,
  sidebarCollapsed,
  onToggleSidebar,
}: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 'startup', title: 'Bem-vindo', message: 'Sistema InnCentive inicializado e conectado.', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), unread: false, type: 'default' }
  ]);

  // Connect to realtime events for notifications
  useEffect(() => {
    const handleCompleted = (data: any) => {
      setNotifications(prev => [
        {
          id: Date.now().toString(),
          title: 'Lote Concluído',
          message: `O processamento terminou! ${data.success} conexões válidas, ${data.failed} erros.`,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          unread: true,
          type: data.failed > 0 ? 'info' : 'success'
        },
        ...prev
      ]);
    };

    socket.on('import:completed', handleCompleted);
    return () => {
      socket.off('import:completed', handleCompleted);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
  };

  return (
    <header
      className={cn`fixed top-0 right-0 z-50 h-14 flex items-center gap-3 px-4 md:px-6
                 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl
                 border-b border-blue-100/60 dark:border-slate-700/60
                 shadow-sm transition-all duration-300 left-0
                 ${sidebarCollapsed ? 'md:left-16' : 'md:left-64'}`}
    >
      {/* Sidebar toggle (mobile hamburger / desktop chevron) */}
      <button
        onClick={onToggleSidebar}
        className="md:hidden p-2 rounded-xl text-blue-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors shrink-0"
        title="Menu"
      >
        <Icons.Menu className="w-5 h-5" />
      </button>

      {/* Logo (mobile only) */}
      <div className="flex items-center gap-2 md:hidden shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-600/30">
          <Icons.Building2 className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-base tracking-tight text-blue-900 dark:text-slate-100">InnCentive</span>
      </div>

      <div className="flex-1 flex justify-center px-4">
        <div className="relative w-full max-w-md hidden sm:block">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Pesquisar em tudo (Empresas, Projetos, Lotes)..."
            className="w-full pl-10 pr-4 py-2 bg-blue-50/50 dark:bg-slate-800/50 border border-blue-100/50 dark:border-slate-700/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-blue-900 dark:text-slate-100 placeholder:text-blue-400 dark:placeholder:text-slate-500"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
             <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-bold text-blue-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded shadow-sm">Ctrl</kbd>
             <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-bold text-blue-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded shadow-sm">K</kbd>
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notificações"
            className={`relative p-2 rounded-xl transition-colors ${showNotifications ? 'bg-blue-100 text-blue-600 dark:bg-slate-800 dark:text-slate-200' : 'text-blue-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
          >
            <Icons.Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-900" />
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden origin-top-right transition-all animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between px-4 py-3 border-b border-blue-50 dark:border-slate-800 bg-blue-50/30 dark:bg-slate-800/30">
                <span className="font-bold text-sm text-blue-900 dark:text-slate-100">Notificações</span>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs font-semibold text-blue-500 hover:underline">
                    Marcar todas como lidas
                  </button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">Nenhuma notificação recente.</div>
                ) : (
                  notifications.map(notification => (
                    <div 
                       key={notification.id} 
                       onClick={() => markAsRead(notification.id)}
                       className={`p-4 border-b border-blue-50/50 dark:border-slate-800/50 hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex gap-3 ${notification.unread ? 'bg-blue-50/20 dark:bg-slate-800/20' : ''}`}
                    >
                      <div className="mt-1 flex-shrink-0">
                        {notification.type === 'success' && <Icons.CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {notification.type === 'info' && <Icons.AlertCircle className="w-5 h-5 text-blue-500" />}
                        {notification.type === 'default' && <Icons.Bell className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold ${notification.unread ? 'text-blue-900 dark:text-slate-100' : 'text-blue-700 dark:text-slate-400'}`}>
                          {notification.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                        <span className={`text-[10px] mt-2 block font-medium ${notification.unread ? 'text-blue-500' : 'text-slate-400'}`}>
                          {notification.time}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-2 border-t border-blue-50 dark:border-slate-800 text-center bg-slate-50 dark:bg-slate-900">
                <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline w-full py-1">Ver todas</button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onDarkModeToggle}
          title={darkMode ? 'Modo claro' : 'Modo escuro'}
          className="p-2 rounded-xl text-blue-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Icons.Sun className="w-[18px] h-[18px]" /> : <Icons.Moon className="w-[18px] h-[18px]" />}
        </button>

        <div className="w-px h-5 bg-blue-100 dark:bg-slate-700 mx-1" />

        <div className="flex items-center gap-2 px-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-colors py-1.5">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold dark:bg-slate-800 dark:text-slate-300">
            A
          </div>
          <span className="hidden sm:block text-sm font-semibold text-blue-900 dark:text-slate-100">Admin</span>
        </div>
      </div>
    </header>
  );
}
