import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LayoutDashboard, ListTodo, BrainCircuit, CalendarDays, LogOut, Sparkles, Menu, X, Palette } from 'lucide-react';
import { useTheme, type Theme } from '../../contexts/ThemeContext';
import { MacroDashboard } from '../../pages/MacroDashboard';
import { MicroCiclo } from '../../pages/MicroCiclo';
import { AuditorIA } from '../../pages/AuditorIA';
import { EditalSetup } from '../../pages/EditalSetup';
import { Cronograma } from '../../pages/Cronograma';

type Tab = 'evolucao' | 'ciclo' | 'auditoria' | 'cronograma';

export function AppShell() {
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('ciclo');
  const [showSetup, setShowSetup] = useState<boolean | null>(null); // null = loading
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default to closed for better mobile start
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    checkHasDisciplinas();
    
    const handleScroll = () => {
      const scrollPos = document.getElementById('main-scroll-area')?.scrollTop || 0;
      setScrolled(scrollPos > 10);
    };

    const scrollArea = document.getElementById('main-scroll-area');
    scrollArea?.addEventListener('scroll', handleScroll);
    return () => scrollArea?.removeEventListener('scroll', handleScroll);
  }, []);

  const checkHasDisciplinas = async () => {
    const { data } = await supabase
      .from('disciplinas_evolucao')
      .select('id')
      .limit(1);
    // If no disciplines exist, show onboarding
    setShowSetup(!data || data.length === 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const tabs = [
    { id: 'ciclo', label: 'Ciclo Diário', icon: ListTodo },
    { id: 'cronograma', label: 'Cronograma', icon: CalendarDays },
    { id: 'evolucao', label: 'Evolução Macro', icon: LayoutDashboard },
    { id: 'auditoria', label: 'Auditor IA', icon: BrainCircuit },
  ];

  // Loading state
  if (showSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-textMuted text-sm">A carregar...</p>
      </div>
    );
  }

  // Onboarding: no disciplines yet
  if (showSetup) {
    return (
      <EditalSetup
        onComplete={() => {
          setShowSetup(false);
          setActiveTab('ciclo');
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-background relative overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[60] w-72 border-r border-borderSubtle bg-surface flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden w-0'
        }`}
      >
        <div className="p-6 border-b border-borderSubtle flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold tracking-tight">ERP de Estudos</h1>
            <p className="text-[11px] text-textMuted mt-0.5">Trilhas e Ciclos</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-textMuted hover:text-textMain">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as Tab);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-primary shadow-sm border border-borderSubtle'
                    : 'text-textMuted hover:bg-white/70 hover:text-textMain'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Re-run setup & Theme */}
        <div className="p-3 space-y-1 border-t border-borderSubtle shrink-0">
          
          {/* Theme Selector */}
          <div className="relative w-full">
            <button 
              onClick={() => setThemeOpen(!themeOpen)}
              className={`w-full flex justify-between items-center px-3 py-2 text-xs font-medium rounded-lg transition-colors ${themeOpen ? 'bg-surface/80 text-textMain' : 'text-textMuted hover:bg-surface/50'}`}
            >
              <div className="flex items-center gap-3">
                 <Palette className="w-3.5 h-3.5" />
                 <span>Tema Visual</span>
              </div>
            </button>
            <div className={`absolute bottom-full left-0 mb-1 flex-col bg-surface border border-borderSubtle rounded-lg shadow-lg overflow-hidden w-full z-50 ${themeOpen ? 'flex' : 'hidden'}`}>
               {(['light', 'dark', 'coffee'] as Theme[]).map(t => (
                 <button
                   key={t}
                   onClick={() => {
                     setTheme(t);
                     setThemeOpen(false);
                   }}
                   className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${theme === t ? 'bg-black/5 dark:bg-white/10 font-bold text-textMain' : 'text-textMuted hover:bg-black/5 dark:hover:bg-white/10'}`}
                 >
                   {t === 'light' ? '☁️ Light Minimal' : t === 'dark' ? '🌌 Deep Space' : '☕ Coffee Shop'}
                 </button>
               ))}
            </div>
          </div>

          <button
            onClick={() => setShowSetup(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-textMuted rounded-lg hover:bg-surface/50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> Novo Ciclo com IA
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-textMuted rounded-lg hover:bg-surface/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-scroll-area" className="flex-1 h-screen overflow-auto relative flex flex-col min-w-0 bg-background pb-20 md:pb-0">
        {/* Mobile Navbar / Header */}
        <header 
          className={`sticky top-0 z-30 transition-all duration-200 border-b md:hidden ${
            scrolled ? 'bg-surface/90 backdrop-blur-md border-borderSubtle py-3 px-4 shadow-sm' : 'bg-transparent border-transparent py-4 px-4'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 rounded-xl text-textMain hover:bg-surface transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className={`font-bold transition-opacity tracking-tight ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
                {tabs.find(t => t.id === activeTab)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
               <button onClick={() => setThemeOpen(!themeOpen)} className="p-2 rounded-full text-textMuted hover:bg-surface">
                 <Palette className="w-5 h-5" />
               </button>
            </div>
          </div>
        </header>

        {/* Desktop Sidebar Toggle (Only hidden on mobile if bottom nav exists) */}
        <div className="hidden md:flex p-6 pb-0 shrink-0 items-center">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 rounded-lg text-textMuted hover:text-textMain hover:bg-surface transition-colors"
            title="Alternar menu lateral"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-10 pt-2 md:pt-4 flex-1">
          <div className="max-w-5xl mx-auto h-full">
            {activeTab === 'evolucao' && <MacroDashboard />}
            {activeTab === 'ciclo' && <MicroCiclo />}
            {activeTab === 'auditoria' && <AuditorIA />}
            {activeTab === 'cronograma' && <Cronograma />}
          </div>
        </div>
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface/90 backdrop-blur-lg border-t border-borderSubtle px-4 py-2 flex items-center justify-around pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex flex-col items-center gap-1 p-2 transition-all ${
                isActive ? 'text-primary scale-110' : 'text-textMuted'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'fill-primary/10' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
