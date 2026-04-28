import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { evaluateStudyDay } from '../lib/gemini';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { BrainCircuit, Loader2, Save, Clock, ChevronRight } from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface Relatorio {
  id: string;
  data_auditoria: string;
  conteudo_md: string;
}

export function AuditorIA() {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Relatorio[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('relatorios_ia')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setHistory(data);
  };

  const handleAuditoria = async () => {
    setLoading(true);
    setFeedback(null);
    
    // Fetch last 7 days of resolved tasks
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data } = await supabase
      .from('tarefas_ciclo')
      .select('*, disciplinas_evolucao(nome_disciplina)')
      .eq('status', 'Concluído')
      .gte('data_execucao', sevenDaysAgo.toISOString().split('T')[0]);

    if (!data || data.length === 0) {
      setFeedback("Não existem tarefas concluídas suficientes nos últimos 7 dias para uma análise avançada.");
      setLoading(false);
      return;
    }

    // Aggregate by subject
    const aggr: Record<string, { total: number, questoes: number, acertos: number }> = {};
    data.forEach(t => {
      const nome = t.disciplinas_evolucao.nome_disciplina || 'Desconhecido';
      if (!aggr[nome]) aggr[nome] = { total: 0, questoes: 0, acertos: 0 };
      aggr[nome].total += 1;
      aggr[nome].questoes += t.tot_questoes_feitas || 0;
      aggr[nome].acertos += t.tot_acertos || 0;
    });

    const contextText = Object.entries(aggr).map(([disc, stats]) => {
      const pct = stats.questoes > 0 ? ((stats.acertos / stats.questoes) * 100).toFixed(1) : 0;
      return `Em ${disc} fiz ${stats.total} tarefas, com ${pct}% de acertos (${stats.acertos} de ${stats.questoes}).`;
    }).join('\n');

    const prompt = `Atue como um Mentor de Concursos Fiscais de Alta Performance. Abaixo estão os meus dados extraídos do meu ciclo de estudos na última semana:\n\n${contextText}\n\nAnalise a minha taxa de conversão (acertos vs questões feitas) e avanço. Aponte: 1) Onde o meu desempenho está a colocar a minha aprovação em risco (se < 75%). 2) Quais disciplinas devo abrandar porque a retenção já está excelente. 3) Um ajuste tático para a próxima semana. Formate a resposta em Markdown (use ## e ### para títulos, ** para negrito, listras para tópicos).`;

    const aiResponse = await evaluateStudyDay(prompt);
    setFeedback(aiResponse || "Erro ao consultar a IA.");
    setLoading(false);
  };

  const handleSaveReport = async () => {
    if (!feedback) return;
    setSaving(true);
    
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from('relatorios_ia').insert({
        user_id: userData.user.id,
        conteudo_md: feedback
      });
      await fetchHistory();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-textMain">Auditor de Performance IA</h2>
        <p className="text-textMuted">Deixe o motor analítico otimizar o seu plano tático semanal.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Workspace */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-borderSubtle bg-gradient-to-br from-surface to-surface/50 shadow-sm transition-all duration-300">
            <CardContent className="p-8 text-center">
               <BrainCircuit className="w-12 h-12 mx-auto text-primary mb-4 opacity-80" />
               <h3 className="text-lg font-semibold mb-2">Auditoria Semanal de Ciclo</h3>
               <p className="text-sm text-textMuted mb-6 max-w-lg mx-auto">
                 A IA irá cruzar o histórico das suas trilhas nos últimos 7 dias, identificar gargalos estatísticos nas questões resolvidas e sugerir mudanças táticas imediatas para a próxima semana de estudo.
               </p>
               <Button onClick={handleAuditoria} disabled={loading} size="lg" className="px-8 shadow-sm hover:shadow-md transition-all">
                 {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <BrainCircuit className="w-5 h-5 mr-2" />}
                 {loading ? 'A auditar desempenho...' : 'Executar Auditoria de Alta Performance'}
               </Button>
            </CardContent>
          </Card>

          {feedback && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="glass-panel p-8">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-borderSubtle">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center rounded-lg shadow-sm">
                       <BrainCircuit className="w-4 h-4" />
                     </div>
                     <span className="font-semibold text-sm uppercase tracking-wider text-textMuted">Relatório Analítico</span>
                   </div>
                   
                   <Button onClick={handleSaveReport} disabled={saving} variant="outline" size="sm" className="bg-surface">
                     {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                     {saving ? 'A guardar...' : 'Guardar Relatório'}
                   </Button>
                 </div>
                 
                 <div className="text-sm md:text-base">
                   <MarkdownRenderer content={feedback} />
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Sidebar History */}
        <div className="lg:col-span-1">
          <div className="glass-panel p-4 h-full min-h-[400px]">
            <div className="flex items-center gap-2 mb-4 text-textMuted font-medium text-sm px-2">
              <Clock className="w-4 h-4" />
              <span>Histórico de Auditorias</span>
            </div>
            
            <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
               {history.length === 0 ? (
                 <div className="text-center py-10 px-4 text-textMuted text-xs">
                   <p>Nenhuma auditoria salva.</p>
                   <p className="mt-1">Rode a IA e salve o relatório para construir a sua biblioteca de conhecimentos táticos.</p>
                 </div>
               ) : (
                 history.map((rep) => (
                   <button 
                     key={rep.id}
                     onClick={() => {
                        setFeedback(rep.conteudo_md);
                        const mainArea = document.getElementById('main-scroll-area');
                        if (mainArea) mainArea.scrollTo({ top: 0, behavior: 'smooth' });
                     }}
                     className="w-full text-left p-3 rounded-lg border border-borderSubtle bg-surface hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                   >
                     <div className="flex justify-between items-center text-sm font-semibold text-textMain mb-1">
                       {new Date(rep.data_auditoria).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                       <ChevronRight className="w-4 h-4 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
                     </div>
                     <p className="text-xs text-textMuted line-clamp-2">
                       {rep.conteudo_md.replace(/#/g, '').substring(0, 80)}...
                     </p>
                   </button>
                 ))
               )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
