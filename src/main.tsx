import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './components/auth/AuthScreen'
import { supabase } from './lib/supabase'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-textMuted">A carregar...</p></div>;
  }

  return isAuthenticated ? <AppShell /> : <AuthScreen onLogin={() => setIsAuthenticated(true)} />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
