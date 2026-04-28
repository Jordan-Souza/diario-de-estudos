import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { RotateCcw, AlertOctagon, Loader2, Flame, Trophy, Zap, Target } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function MacroDashboard() {
  const [evolucao, setEvolucao] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Gamification State
  const [streak, setStreak] = useState(0);
  const [chartDataSessao, setChartDataSessao] = useState<any[]>([]);
  const [totalMinutos, setTotalMinutos] = useState(0);

  // Reset states
  const [resetOpen, setResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Quiz stats
  const [quizStats, setQuizStats] = useState({ totalQuestoes: 0, totalAcertos: 0 });

  useEffect(() => {
    fetchEvolucao();
    fetchSessoes();
    fetchQuizStats();
  }, []);

  const fetchEvolucao = async () => {
    const { data } = await supabase.from('vw_evolucao_consolidada').select('*');
    if (data) setEvolucao(data);
    setLoading(false);
  };

  const fetchQuizStats = async () => {
    const { data } = await supabase
      .from('tarefas_ciclo')
      .select('tot_questoes_feitas, tot_acertos')
      .eq('status', 'Concluído')
      .not('tot_questoes_feitas', 'is', null);

    if (data && data.length > 0) {
      const totalQ = data.reduce((s, r) => s + (r.tot_questoes_feitas ?? 0), 0);
      const totalA = data.reduce((s, r) => s + (r.tot_acertos ?? 0), 0);
      setQuizStats({ totalQuestoes: totalQ, totalAcertos: totalA });
    }
  };

  const fetchSessoes = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    
    // Fetch last 30 days to calculate streaks safely
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('sessoes_estudo')
      .select('data, minutos_estudados')
      .eq('user_id', userData.user.id)
      .gte('data', thirtyDaysAgo)
      .order('data', { ascending: false });

    if (data) {
      calculateMetrics(data);
    }
  };

  const calculateMetrics = (data: any[]) => {
    // 1. Chart Data (Last 7 days)
    const last7Days = Array.from({length: 7}, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      return { 
        name: format(d, 'EEE', { locale: ptBR }), 
        dateStr: format(d, 'yyyy-MM-dd'),
        minutos: 0 
      };
    });

    let totalThisWeek = 0;
    data.forEach(s => {
      const day = last7Days.find(d => d.dateStr === s.data);
      if (day) {
        day.minutos += s.minutos_estudados;
        totalThisWeek += s.minutos_estudados;
      }
    });

    setChartDataSessao(last7Days);
    setTotalMinutos(totalThisWeek);

    // 2. Streaks (Ofensiva)
    const uniqueDays = Array.from(new Set(data.map(d => d.data))).sort((a: any, b: any) => b.localeCompare(a)) as string[];
    
    let currentStreak = 0;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    if (uniqueDays.includes(todayStr) || uniqueDays.includes(yesterdayStr)) {
      let checkDate = uniqueDays.includes(todayStr) ? new Date() : subDays(new Date(), 1);
      
      for (const ud of uniqueDays) {
        if (ud === format(checkDate, 'yyyy-MM-dd')) {
          currentStreak++;
          checkDate = subDays(checkDate, 1);
        } else if (ud > format(checkDate, 'yyyy-MM-dd')) {
           continue;
        } else {
           break;
        }
      }
    }
    setStreak(currentStreak);
  };

  const handleResetData = async () => {
    setIsResetting(true);
    await supabase.from('tarefas_ciclo')
      .update({
        status: 'Pendente',
        data_execucao: null,
        tot_questoes_feitas: null,
        tot_acertos: null
      })
      .eq('status', 'Concluído');

    window.dispatchEvent(new CustomEvent('taskCompleted'));
    await fetchEvolucao();
    setIsResetting(false);
    setResetOpen(false);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-textMain">Evolução Macro</h2>
          <p className="text-textMuted text-xs md:text-sm">Métricas globais de progresso e eficácia.</p>
        </div>
        <Button variant="outline" size="sm" className="w-fit text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200 text-xs" onClick={() => setResetOpen(true)}>
          <RotateCcw className="w-3.5 h-3.5 mr-2" />
          Resetar Evolução
        </Button>
      </header>

      {/* Gamification Area — now 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Streak */}
        <Card className="bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/20 transition-all duration-300">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] md:text-sm font-semibold text-orange-600 dark:text-orange-400 mb-0.5">Dias Seguidos</p>
              <h3 className="text-2xl md:text-3xl font-black text-orange-600 dark:text-orange-500">{streak} dias</h3>
              <p className="hidden md:block text-xs text-orange-600/70 dark:text-orange-400/70 mt-1">
                {streak === 0 ? 'Estude hoje para começar!' : 'Mantenha o ritmo!'}
              </p>
            </div>
            <div className="relative w-12 h-12 md:w-16 md:h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
              {streak > 0 && <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" style={{ animationDuration: '3s' }}></div>}
              <Flame className={`relative z-10 w-6 h-6 md:w-8 md:h-8 ${streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-orange-300'}`} />
            </div>
          </CardContent>
        </Card>

        {/* Study Time */}
        <Card className="bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20 transition-all duration-300">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] md:text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Tempo Total</p>
              <h3 className="text-2xl md:text-3xl font-black text-emerald-600 dark:text-emerald-500">{Math.floor(totalMinutos / 60)}h {totalMinutos % 60}m</h3>
              <p className="hidden md:block text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Tempo passado no Pomodoro.</p>
            </div>
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="w-6 h-6 md:w-8 md:h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        {/* Quiz Questions */}
        <Card className="bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/20 transition-all duration-300">
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] md:text-sm font-semibold text-violet-600 mb-0.5">Questões Quiz</p>
              <h3 className="text-2xl md:text-3xl font-black text-violet-600">{quizStats.totalQuestoes}</h3>
              <p className="hidden md:block text-xs text-violet-600/70 mt-1">Simulados realizados</p>
            </div>
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-violet-500/10 flex items-center justify-center">
              <Zap className="w-6 h-6 md:w-8 md:h-8 text-violet-500 fill-violet-200" />
            </div>
          </CardContent>
        </Card>

        {/* Quiz Accuracy */}
        <Card className={`transition-all duration-300 ${
          quizStats.totalQuestoes === 0
            ? 'bg-surface border-borderSubtle'
            : quizStats.totalAcertos / quizStats.totalQuestoes >= 0.7
              ? 'bg-sky-500/5 border-sky-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <CardContent className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className={`text-[10px] md:text-sm font-semibold mb-0.5 ${
                quizStats.totalQuestoes === 0 ? 'text-textMuted'
                : quizStats.totalAcertos / quizStats.totalQuestoes >= 0.7 ? 'text-sky-600' : 'text-amber-600'
              }`}>Aproveitamento</p>
              <h3 className={`text-2xl md:text-3xl font-black ${
                quizStats.totalQuestoes === 0 ? 'text-textMuted'
                : quizStats.totalAcertos / quizStats.totalQuestoes >= 0.7 ? 'text-sky-600' : 'text-amber-600'
              }`}>
                {quizStats.totalQuestoes === 0
                  ? '—'
                  : `${((quizStats.totalAcertos / quizStats.totalQuestoes) * 100).toFixed(1)}%`
                }
              </h3>
              <p className="hidden md:block text-xs text-textMuted mt-1">
                {quizStats.totalQuestoes === 0 ? 'Sem dados' : `${quizStats.totalAcertos} acertos`}
              </p>
            </div>
            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center ${
              quizStats.totalQuestoes === 0 ? 'bg-surface'
              : quizStats.totalAcertos / quizStats.totalQuestoes >= 0.7 ? 'bg-sky-500/10' : 'bg-amber-500/10'
            }`}>
              <Target className={`w-6 h-6 md:w-8 md:h-8 ${
                quizStats.totalQuestoes === 0 ? 'text-textMuted'
                : quizStats.totalAcertos / quizStats.totalQuestoes >= 0.7 ? 'text-sky-500' : 'text-amber-500'
              }`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Performance Over Time */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-semibold mb-4 md:mb-6">
            Tempo Estudado (Minutos)
          </h3>
          <div className="h-32 md:h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataSessao}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tickMargin={5} />
                <YAxis hide axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="minutos" fill="#10B981" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
           <p className="text-textMuted col-span-2">A carregar métricas...</p>
        ) : evolucao.map(disc => {
          const progressoTarefas = disc.total_tarefas > 0 ? (disc.tarefas_concluidas / disc.total_tarefas) * 100 : 0;
          
          return (
            <Card key={disc.disciplina_id} className="border-borderSubtle">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-medium text-textMain">{disc.nome_disciplina}</h3>
                  <div className="text-right">
                    <span className="text-xl font-bold block">{Number(disc.desempenho_global).toFixed(1)}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-textMuted">Acertos</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-textMuted">Progresso de Tarefas</span>
                      <span className="font-medium">{progressoTarefas.toFixed(1)}%</span>
                    </div>
                    <Progress value={progressoTarefas} indicatorClassName="bg-black" />
                  </div>
                  
                  {disc.desempenho_global > 0 && (
                     <div className="pt-2 flex gap-2">
                       {disc.desempenho_global < 70 && (
                         <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded">Alerta: Rever Pontos Fracos</span>
                       )}
                       {disc.desempenho_global >= 85 && (
                         <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded">Retenção Excelente</span>
                       )}
                     </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertOctagon className="w-5 h-5" />
              Resetar Toda a Evolução?
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p>Tem certeza de que deseja zerar <strong>todas</strong> as métricas de evolução?</p>
              <p className="mt-2 text-xs text-textMuted bg-red-50 p-3 rounded border border-red-100">
                Isso fará com que todas as tarefas concluídas voltem ao status <strong className="text-amber-600">Pendente</strong>, e os gráficos de desempenho serão zerados. Seus blocos do cronograma e as matérias não serão excluídos.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={isResetting}>
              Cancelar
            </Button>
            <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleResetData} disabled={isResetting}>
              {isResetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              {isResetting ? 'A resetar...' : 'Sim, Resetar Tudo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
