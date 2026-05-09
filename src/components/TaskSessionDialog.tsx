import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  CheckCircle2,
  Loader2,
  PauseCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Target,
  BookMarked,
  MessageSquare,
  Wifi,
  WifiOff,
  Radio,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  user_id: string;
  disciplina_id: string;
  titulo_tarefa: string;
  trilha_numero: string;
  status: string;
  nome_disciplina?: string;
}

interface Sessao {
  id: string;
  numero_sessao: number;
  questoes_feitas: number;
  acertos: number;
  data_execucao: string;
}

interface CadernoErro {
  id: string;
  conteudo_questao: string;
  comentario_aluno: string | null;
  data_captura: string;
  sessao_id: string | null;
}

type ActiveTab = 'sessoes' | 'caderno';

interface Props {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onPause: () => void;     // Sessão registada, tarefa mantida Em Andamento
  onComplete: () => void;  // Sessão registada + tarefa Concluída
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcDesempenho(acertos: number, questoes: number): number | null {
  if (questoes <= 0) return null;
  return (acertos / questoes) * 100;
}

function desempenhoColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 70) return 'text-amber-500';
  return 'text-red-500';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SessaoAccordionItem({ sessao }: { sessao: Sessao }) {
  const [open, setOpen] = useState(false);
  const pct = calcDesempenho(sessao.acertos, sessao.questoes_feitas);

  return (
    <div className="rounded-lg border border-borderSubtle overflow-hidden transition-all">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-surface/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
            {sessao.numero_sessao}
          </span>
          <span className="text-sm font-medium text-textMain">
            Sessão {sessao.numero_sessao}
          </span>
          <span className="text-xs text-textMuted hidden sm:block">
            {formatDate(sessao.data_execucao)}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pct !== null && (
            <span className={`text-sm font-bold tabular-nums ${desempenhoColor(pct)}`}>
              {pct.toFixed(0)}%
            </span>
          )}
          {open
            ? <ChevronDown className="w-4 h-4 text-textMuted" />
            : <ChevronRight className="w-4 h-4 text-textMuted" />
          }
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 bg-surface/40 border-t border-borderSubtle animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-3 gap-3">
            <StatPill label="Questões" value={sessao.questoes_feitas} />
            <StatPill label="Acertos" value={sessao.acertos} />
            <StatPill
              label="Desempenho"
              value={pct !== null ? `${pct.toFixed(1)}%` : '—'}
              highlight={pct !== null ? desempenhoColor(pct) : undefined}
            />
          </div>
          <p className="text-[11px] text-textMuted mt-2 text-right">
            {formatDate(sessao.data_execucao)}
          </p>
        </div>
      )}
    </div>
  );
}

function StatPill({
  label, value, highlight,
}: {
  label: string;
  value: string | number;
  highlight?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-borderSubtle p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-textMuted mb-0.5">{label}</p>
      <p className={`text-base font-bold tabular-nums ${highlight ?? 'text-textMain'}`}>
        {value}
      </p>
    </div>
  );
}

function CadernoErroCard({
  erro,
  onSaveComment,
}: {
  erro: CadernoErro;
  onSaveComment: (id: string, comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState(erro.comentario_aluno ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSaveComment(erro.id, comment);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl border border-borderSubtle bg-white overflow-hidden">
      {/* Enunciado */}
      <div className="p-4 bg-red-50/40 border-b border-borderSubtle">
        <p className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-2 flex items-center gap-1.5">
          <Target className="w-3 h-3" /> Questão Errada — {formatDate(erro.data_captura)}
        </p>
        <p className="text-sm text-textMain leading-relaxed line-clamp-6 whitespace-pre-wrap">
          {erro.conteudo_questao}
        </p>
      </div>

      {/* Comentário */}
      <div className="p-4 space-y-2">
        <label className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" /> Sua anotação
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Ex: Errei por confundir prazo da Súmula Vinculante 10 com..."
          rows={3}
          className="w-full text-sm border border-borderSubtle rounded-lg p-2.5 bg-surface/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none text-textMain placeholder:text-textMuted/60"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving || comment === (erro.comentario_aluno ?? '')}
            className="text-xs h-7 px-3"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : saved ? (
              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
            ) : null}
            {saved ? 'Salvo!' : 'Salvar Anotação'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function TaskSessionDialog({ task, isOpen, onClose, onPause, onComplete }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sessoes');

  // Formulário da sessão
  const [questions, setQuestions] = useState('');
  const [correct, setCorrect] = useState('');

  // Estado de sessões existentes
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [sessoesLoading, setSessoesLoading] = useState(false);

  // Estado do caderno de erros
  const [erros, setErros] = useState<CadernoErro[]>([]);
  const [errosLoading, setErrosLoading] = useState(false);

  // Submissão
  const [submitting, setSubmitting] = useState(false);

  // ── Live Sync (Supabase Realtime) ─────────────────────────────────────────
  const [isLiveSyncEnabled, setIsLiveSyncEnabled] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscrição Realtime: escuta updates na tabela live_tracking para esta tarefa
  useEffect(() => {
    if (!isLiveSyncEnabled || !task) return;

    const channel = supabase
      .channel(`live_tracking_${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_tracking',
          filter: `tarefa_id=eq.${task.id}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.questoes_total !== undefined) setQuestions(String(row.questoes_total));
          if (row?.acertos_total  !== undefined) setCorrect(String(row.acertos_total));
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [isLiveSyncEnabled, task]);

  // Desligar ao fechar o modal
  const handleClose = () => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setIsLiveSyncEnabled(false);
    onClose();
  };

  const toggleLiveSync = () => setIsLiveSyncEnabled(v => !v);

  // ── Fetch sessões anteriores ──────────────────────────────────────────────
  const fetchSessoes = useCallback(async () => {
    if (!task) return;
    setSessoesLoading(true);
    const { data } = await supabase
      .from('sessoes_tarefa')
      .select('*')
      .eq('tarefa_id', task.id)
      .order('numero_sessao', { ascending: true });
    if (data) setSessoes(data as Sessao[]);
    setSessoesLoading(false);
  }, [task]);

  // ── Fetch caderno de erros ────────────────────────────────────────────────
  const fetchErros = useCallback(async () => {
    if (!task) return;
    setErrosLoading(true);
    const { data } = await supabase
      .from('caderno_erros')
      .select('id, conteudo_questao, comentario_aluno, data_captura, sessao_id')
      .eq('tarefa_id', task.id)
      .order('data_captura', { ascending: false });
    if (data) setErros(data as CadernoErro[]);
    setErrosLoading(false);
  }, [task]);

  useEffect(() => {
    if (isOpen && task) {
      fetchSessoes();
      fetchErros();
      setQuestions('');
      setCorrect('');
      setActiveTab('sessoes');
      setIsLiveSyncEnabled(false);
    }
  }, [isOpen, task, fetchSessoes, fetchErros]);

  // ── Registar Sessão ───────────────────────────────────────────────────────
  const registrarSessao = async (): Promise<string | null> => {
    if (!task || !questions || !correct) return null;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data, error } = await supabase
      .from('sessoes_tarefa')
      .insert({
        tarefa_id: task.id,
        user_id: userData.user.id,
        questoes_feitas: Number(questions),
        acertos: Number(correct),
        data_execucao: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao registar sessão:', error);
      return null;
    }
    return data?.id ?? null;
  };

  // ── Calcular totais acumulados ────────────────────────────────────────────
  const calcTotals = (newSessoes: Sessao[]) => {
    const totQuestoes = newSessoes.reduce((acc, s) => acc + s.questoes_feitas, 0);
    const totAcertos = newSessoes.reduce((acc, s) => acc + s.acertos, 0);
    return { totQuestoes, totAcertos };
  };

  // ── Botão A: Registar e Pausar ────────────────────────────────────────────
  const handleRegisterAndPause = async () => {
    if (!task || !questions || !correct) return;
    setSubmitting(true);

    await registrarSessao();

    // Atualiza status para "Em Andamento" (se ainda não estiver)
    await supabase
      .from('tarefas_ciclo')
      .update({ status: 'Em Andamento' })
      .eq('id', task.id);

    setSubmitting(false);
    onPause();
  };

  // ── Botão B: Registar e Concluir ──────────────────────────────────────────
  const handleRegisterAndComplete = async () => {
    if (!task || !questions || !correct) return;
    setSubmitting(true);

    const sessaoId = await registrarSessao();

    // Buscar TODAS as sessões (incluindo a que acabou de ser inserida) para calcular totais
    const { data: allSessoes } = await supabase
      .from('sessoes_tarefa')
      .select('questoes_feitas, acertos')
      .eq('tarefa_id', task.id);

    const totalQ = (allSessoes ?? []).reduce((acc: number, s: any) => acc + s.questoes_feitas, 0);
    const totalA = (allSessoes ?? []).reduce((acc: number, s: any) => acc + s.acertos, 0);

    // Atualizar tarefa com totais acumulados e status Concluído
    await supabase
      .from('tarefas_ciclo')
      .update({
        status: 'Concluído',
        data_execucao: new Date().toISOString().split('T')[0],
        tot_questoes_feitas: totalQ,
        tot_acertos: totalA,
      })
      .eq('id', task.id);

    // Se houve sessaoId e erros, vincular sessão aos erros sem sessao_id desta tarefa
    if (sessaoId) {
      await supabase
        .from('caderno_erros')
        .update({ sessao_id: sessaoId })
        .eq('tarefa_id', task.id)
        .is('sessao_id', null);
    }

    setSubmitting(false);
    onComplete();
  };

  // ── Salvar comentário no caderno ──────────────────────────────────────────
  const handleSaveComment = async (erroId: string, comment: string) => {
    await supabase
      .from('caderno_erros')
      .update({ comentario_aluno: comment })
      .eq('id', erroId);

    setErros(prev =>
      prev.map(e => e.id === erroId ? { ...e, comentario_aluno: comment } : e)
    );
  };

  // ── Cálculo de performance ao vivo ───────────────────────────────────────
  const pct = calcDesempenho(Number(correct), Number(questions));

  // ── Totais acumulados das sessões anteriores ──────────────────────────────
  const { totQuestoes: prevQ, totAcertos: prevA } = calcTotals(sessoes);
  const accumulatedPct = calcDesempenho(prevA, prevQ);

  const canSubmit = !!questions && !!correct && Number(questions) >= Number(correct) && Number(questions) > 0;

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-xl w-full flex flex-col max-h-[90vh] p-0 overflow-hidden gap-0">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-borderSubtle shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-textMain leading-tight">
                {task.titulo_tarefa}
              </DialogTitle>
              <p className="text-xs text-textMuted mt-0.5">
                {task.nome_disciplina} · {task.trilha_numero}
              </p>
            </div>
          </div>

          {/* Sumário acumulado */}
          {sessoes.length > 0 && (
            <div className="mt-4 rounded-xl bg-surface border border-borderSubtle p-3">
              <p className="text-[10px] uppercase tracking-wider text-textMuted mb-2 font-semibold">
                Progresso acumulado ({sessoes.length} sessão{sessoes.length !== 1 ? 'ões' : ''})
              </p>
              <div className="flex gap-4 text-sm">
                <span className="text-textMuted">
                  <strong className="text-textMain tabular-nums">{prevQ}</strong> questões
                </span>
                <span className="text-textMuted">
                  <strong className="text-textMain tabular-nums">{prevA}</strong> acertos
                </span>
                {accumulatedPct !== null && (
                  <span className={`font-bold tabular-nums ml-auto ${desempenhoColor(accumulatedPct)}`}>
                    {accumulatedPct.toFixed(1)}% geral
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-borderSubtle shrink-0 bg-surface/30">
          {(
            [
              { id: 'sessoes', label: 'Sessões', icon: Target, badge: sessoes.length > 0 ? sessoes.length : null },
              { id: 'caderno', label: 'Caderno de Erros', icon: BookMarked, badge: erros.length > 0 ? erros.length : null },
            ] as { id: ActiveTab; label: string; icon: any; badge: number | null }[]
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-textMuted hover:text-textMain'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge !== null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-borderSubtle text-textMuted'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body (scrollable) ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Tab: Sessões ─────────────────────────────────────────────────── */}
          {activeTab === 'sessoes' && (
            <div className="p-6 space-y-6">

              {/* ── Botão Live Sync ──────────────────────────────────────── */}
              <button
                onClick={toggleLiveSync}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  isLiveSyncEnabled
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-borderSubtle bg-surface text-textMuted hover:text-textMain'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {isLiveSyncEnabled ? (
                    <>
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      <Radio className="w-4 h-4" />
                      Conexão: TecConcursos
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4" />
                      Conexão: TecConcursos
                    </>
                  )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                  isLiveSyncEnabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-borderSubtle text-textMuted'
                }`}>
                  {isLiveSyncEnabled ? 'Pausar Conexão' : 'Iniciar Conexão Automática'}
                </span>
              </button>

              {/* Formulário nova sessão */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-textMain">
                  Registar Nova Sessão{sessoes.length > 0 ? ` (Sessão ${sessoes.length + 1})` : ''}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-textMuted flex items-center gap-1.5">
                      Questões Feitas
                      {isLiveSyncEnabled && (
                        <span className="text-[10px] text-emerald-600 font-bold">● Sincronizando ao vivo</span>
                      )}
                    </label>
                    <Input
                      id="session-questions"
                      type="number"
                      min="0"
                      placeholder="Ex: 30"
                      value={questions}
                      onChange={e => !isLiveSyncEnabled && setQuestions(e.target.value)}
                      readOnly={isLiveSyncEnabled}
                      className={isLiveSyncEnabled ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800 cursor-not-allowed' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-textMuted flex items-center gap-1.5">
                      Acertos
                      {isLiveSyncEnabled && (
                        <span className="text-[10px] text-emerald-600 font-bold">● Sincronizando ao vivo</span>
                      )}
                    </label>
                    <Input
                      id="session-correct"
                      type="number"
                      min="0"
                      placeholder="Ex: 24"
                      value={correct}
                      onChange={e => !isLiveSyncEnabled && setCorrect(e.target.value)}
                      readOnly={isLiveSyncEnabled}
                      className={isLiveSyncEnabled ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800 cursor-not-allowed' : ''}
                    />
                  </div>
                </div>

                {/* Indicador ao vivo */}
                {pct !== null && (
                  <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 border ${
                    pct >= 80
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      : pct >= 70
                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                      : 'bg-red-50 border-red-100 text-red-700'
                  }`}>
                    <span className="font-bold text-base tabular-nums">{pct.toFixed(1)}%</span>
                    <span className="text-sm opacity-80">nesta sessão</span>
                    {pct < 70 && (
                      <span className="ml-auto text-[11px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        Precisa de revisão
                      </span>
                    )}
                  </div>
                )}

                {questions && correct && Number(questions) < Number(correct) && (
                  <p className="text-xs text-red-500">Acertos não podem ser maiores que questões feitas.</p>
                )}
              </div>

              {/* Lista de sessões anteriores */}
              {sessoesLoading ? (
                <div className="flex items-center gap-2 text-sm text-textMuted py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando sessões...
                </div>
              ) : sessoes.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-textMain">
                    Sessões Anteriores
                  </h3>
                  <div className="space-y-2">
                    {sessoes.map(s => (
                      <SessaoAccordionItem key={s.id} sessao={s} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Tab: Caderno de Erros ──────────────────────────────────────── */}
          {activeTab === 'caderno' && (
            <div className="p-6">
              {errosLoading ? (
                <div className="flex items-center gap-2 text-sm text-textMuted py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando caderno...
                </div>
              ) : erros.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
                    <WifiOff className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-textMain mb-1">Caderno Vazio</h4>
                    <p className="text-sm text-textMuted max-w-xs mx-auto leading-relaxed">
                      As questões erradas no TecConcursos serão automaticamente
                      adicionadas aqui pela extensão do Chrome.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-4 py-2 font-medium">
                    <Wifi className="w-3.5 h-3.5" />
                    Instale a extensão "ERP Estudos" no Chrome
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-textMuted">
                    <strong className="text-textMain">{erros.length}</strong> questão{erros.length !== 1 ? 'ões capturadas' : ' capturada'} por esta tarefa.
                  </p>
                  {erros.map(erro => (
                    <CadernoErroCard
                      key={erro.id}
                      erro={erro}
                      onSaveComment={handleSaveComment}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer com botões ─────────────────────────────────────────────── */}
        {activeTab === 'sessoes' && (
          <div className="shrink-0 px-6 py-4 border-t border-borderSubtle bg-white space-y-2">
            <div className="flex gap-3">
              {/* Botão A: Registar e Pausar */}
              <Button
                id="btn-register-pause"
                variant="outline"
                className="flex-1 gap-2 text-sm"
                onClick={handleRegisterAndPause}
                disabled={submitting || !canSubmit}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PauseCircle className="w-4 h-4 text-amber-500" />
                )}
                Registar e Pausar
              </Button>

              {/* Botão B: Registar e Concluir */}
              <Button
                id="btn-register-complete"
                className="flex-1 gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleRegisterAndComplete}
                disabled={submitting || !canSubmit}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Registar e Concluir
              </Button>
            </div>
            <p className="text-[11px] text-center text-textMuted">
              "Pausar" mantém a tarefa em andamento para novas sessões amanhã
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
