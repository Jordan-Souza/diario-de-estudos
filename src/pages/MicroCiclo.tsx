import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { CheckCircle2, PlayCircle, Plus, Loader2, RotateCcw, History, BrainCircuit, Zap, AlertTriangle } from 'lucide-react';
import { scheduleReviewTask } from '../lib/scheduler';
import { PomodoroTimerDialog } from '../components/PomodoroTimerDialog';
import { generateFastReview } from '../lib/gemini';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { FlashQuizDialog } from '../components/FlashQuizDialog';
import { WrongQuestionsDialog } from '../components/WrongQuestionsDialog';

interface Task {
  id: string;
  user_id: string;
  disciplina_id: string;
  trilha_numero: string;
  titulo_tarefa: string;
  status: string;
  nome_disciplina?: string;
  revisao_ia?: string | null;
}

interface Disciplina {
  id: string;
  nome_disciplina: string;
}

export function MicroCiclo() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  
  // Completion modal states
  const [dateDone, setDateDone] = useState(new Date().toISOString().split('T')[0]);
  const [questions, setQuestions] = useState('');
  const [correct, setCorrect] = useState('');
  const [completing, setCompleting] = useState(false);
  
  // Bulk import states
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkDisciplina, setBulkDisciplina] = useState('');
  const [bulkTrilha, setBulkTrilha] = useState('Trilha 1');
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');

  // Completed tasks panel
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [resettingDisc, setResettingDisc] = useState<string | null>(null);

  // AI states
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [generatingForTask, setGeneratingForTask] = useState<string | null>(null);
  const [quizTask, setQuizTask] = useState<Task | null>(null);
  const [showWrong, setShowWrong] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchDisciplinas();

    // Re-fetch whenever any page completes a task (e.g., Cronograma)
    const onTaskCompleted = () => fetchTasks();
    window.addEventListener('taskCompleted', onTaskCompleted);
    return () => window.removeEventListener('taskCompleted', onTaskCompleted);
  }, []);

  const handleGenerateReview = async (task: Task) => {
    setGeneratingForTask(task.id);
    const review = await generateFastReview(task.nome_disciplina || 'Geral', task.titulo_tarefa);
    
    // Save to DB
    await supabase.from('tarefas_ciclo').update({ revisao_ia: review }).eq('id', task.id);
    
    // Update local states
    setCompletedTasks(prev => prev.map(t => t.id === task.id ? { ...t, revisao_ia: review } : t));
    setGeneratingForTask(null);
  };

  const handleQuizComplete = async (correct: number, total: number) => {
    if (!quizTask) return;
    
    // Finalize task with quiz stats
    await supabase.from('tarefas_ciclo').update({
      status: 'Concluído',
      data_execucao: new Date().toISOString().split('T')[0],
      tot_questoes_feitas: total,
      tot_acertos: correct
    }).eq('id', quizTask.id);

    setQuizTask(null);
    fetchTasks();
    window.dispatchEvent(new Event('taskCompleted'));
  };

  const fetchCompletedTasks = async () => {
    setCompletedLoading(true);
    const { data } = await supabase
      .from('tarefas_ciclo')
      .select('*, disciplinas_evolucao(nome_disciplina)')
      .eq('status', 'Concluído')
      .order('titulo_tarefa', { ascending: true });
    if (data) {
      setCompletedTasks(data.map((d: any) => ({ ...d, nome_disciplina: d.disciplinas_evolucao?.nome_disciplina })));
    }
    setCompletedLoading(false);
  };

  const openCompletedPanel = () => {
    setShowCompleted(true);
    fetchCompletedTasks();
  };

  const handleReactivate = async (taskId: string) => {
    setReactivating(taskId);
    await supabase.from('tarefas_ciclo').update({
      status: 'Pendente', data_execucao: null, tot_questoes_feitas: null, tot_acertos: null
    }).eq('id', taskId);
    setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
    setReactivating(null);
    fetchTasks();
    window.dispatchEvent(new Event('taskCompleted'));
  };

  const handleResetAll = async () => {
    if (!window.confirm('Resetar TODAS as tarefas concluídas para Pendente? Esta ação não pode ser desfeita.')) return;
    setResettingAll(true);
    const ids = completedTasks.map(t => t.id);
    await supabase.from('tarefas_ciclo').update({
      status: 'Pendente', data_execucao: null, tot_questoes_feitas: null, tot_acertos: null
    }).in('id', ids);
    setCompletedTasks([]);
    setResettingAll(false);
    fetchTasks();
    window.dispatchEvent(new Event('taskCompleted'));
  };

  const handleResetDisciplina = async (disciplinaId: string) => {
    const group = completedTasks.filter(t => t.disciplina_id === disciplinaId);
    if (!window.confirm(`Resetar todas as ${group.length} tarefa(s) desta matéria para Pendente?`)) return;
    setResettingDisc(disciplinaId);
    const ids = group.map(t => t.id);
    await supabase.from('tarefas_ciclo').update({
      status: 'Pendente', data_execucao: null, tot_questoes_feitas: null, tot_acertos: null
    }).in('id', ids);
    setCompletedTasks(prev => prev.filter(t => t.disciplina_id !== disciplinaId));
    setResettingDisc(null);
    fetchTasks();
    window.dispatchEvent(new Event('taskCompleted'));
  };

  const fetchDisciplinas = async () => {
    const { data } = await supabase.from('disciplinas_evolucao').select('id, nome_disciplina').order('nome_disciplina');
    if (data) {
      setDisciplinas(data);
      if (data.length > 0) setBulkDisciplina(data[0].id);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tarefas_ciclo')
      .select('*, disciplinas_evolucao(nome_disciplina)')
      .neq('status', 'Concluído')
      .order('trilha_numero', { ascending: true });

    if (data) {
      setTasks(data.map(d => ({ ...d, nome_disciplina: d.disciplinas_evolucao?.nome_disciplina })));
    }
    setLoading(false);
  };

  const handleComplete = async () => {
    if (!selectedTask || !questions || !correct || !dateDone) return;
    setCompleting(true);
    
    await supabase
      .from('tarefas_ciclo')
      .update({
        status: 'Concluído',
        data_execucao: dateDone,
        tot_questoes_feitas: Number(questions),
        tot_acertos: Number(correct)
      })
      .eq('id', selectedTask.id);

    // Schedule automatic review based on performance
    await scheduleReviewTask({
      userId: selectedTask.user_id,
      disciplinaId: selectedTask.disciplina_id,
      tituloTarefa: selectedTask.titulo_tarefa,
      totQuestoes: Number(questions),
      totAcertos: Number(correct),
      dataExecucao: dateDone
    });

    setSelectedTask(null);
    setQuestions('');
    setCorrect('');
    setCompleting(false);
    // Notify other pages (e.g., Cronograma completion dialog if open)
    window.dispatchEvent(new CustomEvent('taskCompleted', { detail: { taskId: selectedTask?.id } }));
    fetchTasks();
  };

  const handleBulkImport = async () => {
    if (!bulkDisciplina) {
      setImportFeedback('Selecione uma disciplina antes de importar.');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setImportFeedback('Utilizador não autenticado.');
      return;
    }
    
    const titles = bulkText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (titles.length === 0) {
      setImportFeedback('Cole pelo menos um título de tarefa na área de texto.');
      return;
    }

    setImporting(true);
    setImportFeedback('');

    const inserts = titles.map(titulo => ({
      user_id: userData.user!.id,
      disciplina_id: bulkDisciplina,
      trilha_numero: bulkTrilha || 'Trilha 1',
      titulo_tarefa: titulo,
      status: 'Pendente',
    }));

    const { error } = await supabase.from('tarefas_ciclo').insert(inserts);

    if (error) {
      setImportFeedback(`Erro ao importar: ${error.message}`);
    } else {
      setImportFeedback(`✅ ${titles.length} tarefa(s) importada(s) com sucesso!`);
      setBulkText('');
      fetchTasks();
    }
    setImporting(false);
  };

  const performancePct = questions && correct
    ? ((Number(correct) / Number(questions)) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-textMain truncate">Ciclo Diário</h2>
          <p className="text-textMuted text-xs md:text-sm truncate">
            {loading ? 'Carregando...' : `${tasks.length} tarefa${tasks.length !== 1 ? 's' : ''} pendente${tasks.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowWrong(true)}
            className="h-9 w-9 md:w-auto md:px-3 p-0 md:gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
            title="Pontos Fracos"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden md:inline">Pontos Fracos</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={openCompletedPanel} 
            className="h-9 w-9 md:w-auto md:px-3 p-0 md:gap-1.5 text-textMuted"
            title="Ver Concluídas"
          >
            <History className="w-4 h-4" />
            <span className="hidden md:inline">Concluídas</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="h-9 w-9 md:w-auto md:px-3 p-0"
            onClick={() => { setShowBulk(true); setImportFeedback(''); }}
            title="Importar Lista"
          >
            <Plus className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Importar</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-textMuted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando tarefas...</p>
      ) : tasks.length === 0 ? (
        <Card className="bg-surface/50 border-dashed">
          <CardContent className="p-12 text-center text-textMuted">
            Nenhuma tarefa pendente. Use "Importar Lista" para adicionar tarefas.
          </CardContent>
        </Card>
      ) : (() => {
        // Group tasks by discipline
        const groups: Record<string, { nome: string; tasks: Task[] }> = {};
        tasks.forEach(task => {
          const key = task.disciplina_id;
          if (!groups[key]) groups[key] = { nome: task.nome_disciplina ?? 'Sem disciplina', tasks: [] };
          groups[key].tasks.push(task);
        });

        return (
          <div className="space-y-4">
            {Object.entries(groups).map(([discId, group]) => (
              <div key={discId} className="rounded-xl border border-borderSubtle overflow-hidden">
                {/* Discipline header with count badge */}
                <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-borderSubtle">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-textMain">{group.nome}</span>
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-black text-white text-[11px] font-bold tabular-nums">
                      {group.tasks.length}
                    </span>
                  </div>
                  <span className="text-xs text-textMuted">
                    {group.tasks.length === 1 ? '1 tarefa pendente' : `${group.tasks.length} tarefas pendentes`}
                  </span>
                </div>

                {/* Task rows */}
                <div className="divide-y divide-borderSubtle bg-white">
                  {group.tasks.map((task, idx) => (
                    <div key={task.id} className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3.5 hover:bg-surface/50 transition-colors gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Sequential number innerhalb der Gruppe */}
                        <span className="shrink-0 w-7 h-7 rounded-full bg-surface border border-borderSubtle flex items-center justify-center text-[11px] font-bold text-textMuted tabular-nums mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 block mb-0.5">
                            {task.trilha_numero}
                          </span>
                          <h3 className="text-sm md:text-[15px] font-semibold text-textMain leading-tight line-clamp-2">{task.titulo_tarefa}</h3>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-2 pl-10 md:pl-0">
                        <button
                          onClick={() => setQuizTask(task)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 md:p-2 rounded-xl border border-amber-100 bg-amber-50/50 text-amber-600 hover:bg-amber-100 transition-all active:scale-95"
                          title="Desafio Flash FCC (10 Questões)"
                        >
                          <Zap className="w-4 h-4 md:w-5 md:h-5 fill-amber-500/20" />
                          <span className="text-[11px] font-bold md:hidden">QUIZ</span>
                        </button>

                        <button
                          onClick={() => setTimerTask(task)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 md:p-2 rounded-xl border border-borderSubtle bg-surface text-textMuted hover:text-textMain hover:border-textMain transition-all active:scale-95"
                          title="Focar com Pomodoro"
                        >
                          <PlayCircle className="w-4 h-4 md:w-5 md:h-5" />
                          <span className="text-[11px] font-bold md:hidden">FOCO</span>
                        </button>

                        <button
                          onClick={() => setSelectedTask(task)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 md:p-2 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95"
                          title="Marcar como concluída"
                        >
                          <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                          <span className="text-[11px] font-bold md:hidden">OK</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <PomodoroTimerDialog
        isOpen={!!timerTask}
        title={timerTask?.titulo_tarefa || ''}
        subtitle={timerTask?.nome_disciplina || ''}
        disciplinaId={timerTask?.disciplina_id || ''}
        onClose={() => setTimerTask(null)}
        onFinish={() => {
          setSelectedTask(timerTask);
          setTimerTask(null);
        }}
      />

      <WrongQuestionsDialog
        isOpen={showWrong}
        onClose={() => setShowWrong(false)}
      />

      <FlashQuizDialog
        isOpen={!!quizTask}
        onClose={() => setQuizTask(null)}
        taskTitle={quizTask?.titulo_tarefa || ''}
        taskId={quizTask?.id || ''}
        disciplineName={quizTask?.nome_disciplina || ''}
        onComplete={handleQuizComplete}
      />

      {/* Completion Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Tarefa</DialogTitle>
            <p className="text-sm text-textMuted">{selectedTask?.titulo_tarefa}</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <label className="text-xs font-medium text-textMain">Data da Conclusão</label>
               <Input type="date" value={dateDone} onChange={e => setDateDone(e.target.value)} />
             </div>
             <div className="flex gap-4">
               <div className="space-y-2 flex-1">
                 <label className="text-xs font-medium text-textMain">Questões Feitas</label>
                 <Input type="number" min="0" placeholder="Ex: 20" value={questions} onChange={e => setQuestions(e.target.value)} />
               </div>
               <div className="space-y-2 flex-1">
                 <label className="text-xs font-medium text-textMain">Acertos</label>
                 <Input type="number" min="0" placeholder="Ex: 17" value={correct} onChange={e => setCorrect(e.target.value)} />
               </div>
             </div>
             {performancePct !== null && (
               <div className="pt-2 text-sm flex items-center gap-2">
                 <span className="text-textMuted">Desempenho nesta tarefa:</span>
                 <span className={`font-bold text-base ${performancePct >= 80 ? 'text-emerald-600' : performancePct < 70 ? 'text-red-500' : 'text-amber-600'}`}>
                   {performancePct.toFixed(1)}%
                 </span>
                 {performancePct < 70 && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">Revisão Necessária</span>}
               </div>
             )}
          </div>
          <Button className="w-full" onClick={handleComplete} disabled={completing || !questions || !correct}>
             {completing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
             Confirmar Conclusão
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar Tarefas em Massa</DialogTitle>
            <p className="text-sm text-textMuted">Selecione a disciplina, defina a trilha e cole os títulos abaixo (um por linha).</p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-textMain">Disciplina</label>
              {disciplinas.length === 0 ? (
                <p className="text-xs text-red-500">Nenhuma disciplina encontrada. Crie disciplinas primeiro no Supabase.</p>
              ) : (
                <select
                  className="w-full h-10 rounded-md border border-borderSubtle bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={bulkDisciplina}
                  onChange={e => setBulkDisciplina(e.target.value)}
                >
                  {disciplinas.map(d => (
                    <option key={d.id} value={d.id}>{d.nome_disciplina}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-textMain">Trilha</label>
              <Input
                placeholder="Ex: Trilha 1"
                value={bulkTrilha}
                onChange={e => setBulkTrilha(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-textMain">
                Títulos das tarefas <span className="text-textMuted font-normal">(um por linha)</span>
              </label>
              <textarea
                className="w-full h-44 border border-borderSubtle bg-background p-3 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder={"Estudo da Aula 01 - Conceitos Básicos\nEstudo da Aula 02 - Fundamentos\nResolução de 30 questões - Processo"}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
              <p className="text-xs text-textMuted">
                {bulkText.split('\n').filter(l => l.trim()).length} tarefa(s) detectada(s)
              </p>
            </div>

            {importFeedback && (
              <p className={`text-sm font-medium ${importFeedback.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                {importFeedback}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowBulk(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleBulkImport}
              disabled={importing || !bulkText.trim() || !bulkDisciplina}
            >
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {importing ? 'A importar...' : 'Importar Tarefas'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Completed Tasks Dialog */}
      <Dialog open={showCompleted} onOpenChange={o => !o && setShowCompleted(false)}>
        <DialogContent className="max-w-4xl flex flex-col max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-500" />
              Tarefas Concluídas
              {!completedLoading && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-textMuted">
                    ({completedTasks.length})
                  </span>
                  {(() => {
                    const total = tasks.length + completedTasks.length;
                    if (total === 0) return null;
                    const pct = Math.round((completedTasks.length / total) * 100);
                    return (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                        {pct}% concluído
                      </span>
                    );
                  })()}
                </div>
              )}
            </DialogTitle>
            {/* Reset All button */}
            {!completedLoading && completedTasks.length > 0 && (
              <button
                onClick={handleResetAll}
                disabled={resettingAll}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {resettingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Resetar Tudo
              </button>
            )}
          </DialogHeader>

          {/* Scrollable body — fills remaining height */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 mt-2 border-t border-borderSubtle bg-surface/30">
            {completedLoading ? (
              <div className="flex items-center gap-2 text-sm text-textMuted py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : completedTasks.length === 0 ? (
              <div className="text-center text-textMuted text-sm py-8">
                Nenhuma tarefa concluída ainda.
              </div>
            ) : (() => {
              // Group by discipline
              const groups: Record<string, { nome: string; tasks: Task[] }> = {};
              completedTasks.forEach(t => {
                const key = t.disciplina_id;
                if (!groups[key]) groups[key] = { nome: t.nome_disciplina ?? 'Sem disciplina', tasks: [] };
                groups[key].tasks.push(t);
              });
              return (
                <div className="space-y-4">
                  {Object.entries(groups).map(([discId, group]) => (
                    <div key={discId} className="rounded-xl border border-borderSubtle bg-white shadow-sm overflow-hidden">
                      {/* Discipline header */}
                      <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50/50 border-b border-borderSubtle">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-[15px] text-textMain flex-1">{group.nome}</span>
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                          {group.tasks.length}
                        </span>
                        <button
                          onClick={() => handleResetDisciplina(discId)}
                          disabled={resettingDisc === discId}
                          className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Resetar todas as tarefas desta matéria"
                        >
                          {resettingDisc === discId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Resetar
                        </button>
                      </div>
                      {/* Task rows */}
                      <div className="divide-y divide-borderSubtle bg-white">
                        {group.tasks.map((task, idx) => {
                          const isExpanded = expandedTask === task.id;
                          return (
                            <div key={task.id} className="flex flex-col transition-colors">
                              <div className="flex items-center justify-between px-4 py-3 hover:bg-surface/50">
                                <div className="flex items-center gap-3 min-w-0 flex-1" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                                  <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-semibold text-emerald-600">
                                    {idx + 1}
                                  </span>
                                  <div className="min-w-0 cursor-pointer">
                                    <p className="text-[10px] uppercase tracking-wider text-textMuted">{task.trilha_numero}</p>
                                    <p className="text-sm font-medium text-textMain truncate hover:text-primary transition-colors">{task.titulo_tarefa}</p>
                                  </div>
                                </div>
                                <div className="flex gap-2 shrink-0 ml-4 items-center">
                                  {task.revisao_ia && (
                                     <span className="text-[10px] mr-2 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">Revisado IA</span>
                                  )}
                                  <button
                                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-borderSubtle text-xs font-semibold text-primary hover:bg-surface transition-colors shadow-sm"
                                  >
                                    {isExpanded ? 'Fechar' : 'Revisar (80/20)'}
                                  </button>
                                  <button
                                    onClick={() => handleReactivate(task.id)}
                                    disabled={reactivating === task.id}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-borderSubtle text-xs font-medium text-textMuted hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                    title="Reativar tarefa"
                                  >
                                    {reactivating === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              
                              {/* AI Revision Accordion */}
                              {isExpanded && (
                                <div className="px-6 sm:px-12 py-6 bg-surface border-t border-borderSubtle fade-in">
                                  {task.revisao_ia ? (
                                    <div className="bg-white p-6 rounded-xl border border-borderSubtle shadow-inner">
                                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-borderSubtle text-sm font-bold text-amber-700 uppercase tracking-wider">
                                        <BrainCircuit className="w-4 h-4" /> Resumo de Pareto (80/20)
                                      </div>
                                      <MarkdownRenderer content={task.revisao_ia} />
                                    </div>
                                  ) : (
                                    <div className="text-center py-8">
                                      <div className="w-12 h-12 mx-auto bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                                        <BrainCircuit className="w-6 h-6" />
                                      </div>
                                      <h4 className="text-lg font-bold text-textMain mb-2">Sintetize esta Tarefa</h4>
                                      <p className="text-sm text-textMuted max-w-lg mx-auto mb-6 leading-relaxed">
                                        A Inteligência Artificial irá focar-se apenas nos 20% do material desta aula que respondem a 80% das provas do concurso. Ideal para reativar sinapses antes de domir.
                                      </p>
                                      <Button 
                                        onClick={() => handleGenerateReview(task)} 
                                        disabled={generatingForTask === task.id}
                                        className="bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg transition-all"
                                      >
                                        {generatingForTask === task.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                                        {generatingForTask === task.id ? 'A destilar informações críticas...' : 'Gerar Revisão IA (Salva p/ Sempre)'}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
