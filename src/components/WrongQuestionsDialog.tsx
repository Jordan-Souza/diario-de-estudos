import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { supabase } from '../lib/supabase';
import {
  Loader2, AlertTriangle, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Trash2, Brain, ArrowLeft
} from 'lucide-react';

interface WrongQuestion {
  id: string;
  disciplina: string;
  tema: string;
  pergunta: string;
  opcoes: string[];
  resposta_correta: number;
  resposta_selecionada: number;
  explicacao: string;
  created_at: string;
}

interface WrongQuestionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ReviewState = { questionId: string; selected: number | null; answered: boolean };

export function WrongQuestionsDialog({ isOpen, onClose }: WrongQuestionsDialogProps) {
  const [questions, setQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  // Quiz mode: one question at a time
  const [review, setReview] = useState<ReviewState | null>(null);

  useEffect(() => {
    if (isOpen) { fetchWrongQuestions(); setReview(null); }
  }, [isOpen]);

  const fetchWrongQuestions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('questoes_erradas')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setQuestions(data);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await supabase.from('questoes_erradas').delete().eq('id', id);
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (review?.questionId === id) setReview(null);
    setDeleting(null);
  };

  const handleSelectAnswer = (optionIdx: number) => {
    if (!review || review.answered) return;
    setReview(prev => prev ? { ...prev, selected: optionIdx, answered: true } : null);
  };

  const openReview = (q: WrongQuestion) => {
    setReview({ questionId: q.id, selected: null, answered: false });
  };

  const closeReview = () => setReview(null);

  const toggleGroup = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Group by disciplina + tema
  const groups: Record<string, { disciplina: string; tema: string; questions: WrongQuestion[] }> = {};
  questions.forEach(q => {
    const key = `${q.disciplina}||${q.tema}`;
    if (!groups[key]) groups[key] = { disciplina: q.disciplina, tema: q.tema, questions: [] };
    groups[key].questions.push(q);
  });

  const activeQuestion = review ? questions.find(q => q.id === review.questionId) : null;
  const isCorrectThisTime = review?.answered && activeQuestion
    ? review.selected === activeQuestion.resposta_correta
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-borderSubtle bg-surface/50">
          <DialogTitle className="flex items-center gap-2 text-red-600">
            {review && activeQuestion ? (
              <button onClick={closeReview} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <ArrowLeft className="w-5 h-5" />
                <span className="truncate max-w-xs">{activeQuestion.tema}</span>
              </button>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5" />
                Banco de Pontos Fracos
              </>
            )}
          </DialogTitle>
          {!loading && !review && (
            <p className="text-xs text-textMuted">
              {questions.length} questão{questions.length !== 1 ? 'ões' : ''} pendente{questions.length !== 1 ? 's' : ''} de revisão
            </p>
          )}
          {review && !review.answered && (
            <p className="text-xs text-amber-600 font-semibold animate-pulse">Selecione a alternativa correta</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">

          {/* ── QUIZ MODE (single question) ── */}
          {review && activeQuestion ? (
            <div className="p-6 space-y-5 animate-in fade-in duration-200">
              <p className="text-base font-bold text-textMain leading-snug">{activeQuestion.pergunta}</p>

              <div className="space-y-2.5">
                {activeQuestion.opcoes.map((opc, oi) => {
                  const isCorrect = oi === activeQuestion.resposta_correta;
                  const isSelected = oi === review.selected;
                  const answered = review.answered;

                  let cls = 'border-borderSubtle bg-white hover:border-primary hover:bg-surface/50 cursor-pointer';
                  if (answered) {
                    if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200';
                    else if (isSelected) cls = 'border-red-500 bg-red-50 ring-2 ring-red-200';
                    else cls = 'opacity-40 border-borderSubtle bg-white pointer-events-none';
                  }

                  return (
                    <button
                      key={oi}
                      disabled={answered}
                      onClick={() => handleSelectAnswer(oi)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150 flex items-center gap-3 group ${cls}`}
                    >
                      <span className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-black transition-colors
                        ${answered && isCorrect ? 'bg-emerald-500 text-white border-emerald-500' : ''}
                        ${answered && isSelected && !isCorrect ? 'bg-red-500 text-white border-red-500' : ''}
                        ${!answered ? 'bg-surface text-textMuted border-borderSubtle group-hover:border-primary' : ''}
                      `}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="text-sm font-medium flex-1 leading-snug">{opc}</span>
                      {answered && isCorrect && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {answered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Feedback after answering */}
              {review.answered && (
                <div className="animate-in slide-in-from-bottom-2 duration-300 space-y-4">
                  {/* Result banner */}
                  <div className={`flex items-center gap-3 p-4 rounded-xl font-bold text-sm border
                    ${isCorrectThisTime
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'}`}
                  >
                    {isCorrectThisTime
                      ? <><CheckCircle className="w-5 h-5 shrink-0" /> Acertou! Domínio confirmado nesta questão.</>
                      : <><XCircle className="w-5 h-5 shrink-0" /> Errou novamente — releia a explicação com atenção.</>
                    }
                  </div>

                  {/* Explanation */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
                    <p className="font-black uppercase tracking-wider text-amber-700 text-xs mb-2">📚 Por que a correta é esta?</p>
                    <p>{activeQuestion.explicacao}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    {isCorrectThisTime && (
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleDelete(activeQuestion.id)}
                        disabled={deleting === activeQuestion.id}
                      >
                        {deleting === activeQuestion.id
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <CheckCircle className="w-4 h-4 mr-2" />}
                        Já aprendi — Remover do Banco
                      </Button>
                    )}
                    <Button variant="outline" className="flex-1" onClick={closeReview}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao Banco
                    </Button>
                  </div>
                </div>
              )}
            </div>

          ) : loading ? (
            <div className="flex items-center justify-center gap-2 text-textMuted py-16">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando pontos fracos...
            </div>

          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg text-textMain">Banco limpo!</h3>
              <p className="text-sm text-textMuted mt-2 max-w-xs">
                Todos os erros foram superados ou ainda não há simulados realizados.
              </p>
            </div>

          ) : (
            /* ── LIST MODE ── */
            <div className="space-y-3 px-6 pb-6 mt-4">
              {Object.entries(groups).map(([key, group]) => {
                const groupOpen = expanded[key] !== false;
                const count = group.questions.length;
                return (
                  <div key={key} className="rounded-xl border border-borderSubtle overflow-hidden shadow-sm">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(key)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-red-50/50 hover:bg-red-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Brain className="w-4 h-4 text-red-500 shrink-0" />
                        <div className="text-left min-w-0">
                          <p className="font-bold text-sm text-textMain truncate">{group.tema}</p>
                          <p className="text-xs text-textMuted">{group.disciplina}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                          {count}
                        </span>
                        {groupOpen
                          ? <ChevronDown className="w-4 h-4 text-textMuted" />
                          : <ChevronRight className="w-4 h-4 text-textMuted" />}
                      </div>
                    </button>

                    {/* Question Rows */}
                    {groupOpen && (
                      <div className="divide-y divide-borderSubtle bg-white">
                        {group.questions.map((q, qi) => (
                          <div key={q.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface/50 gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold text-red-600 mt-0.5">
                                {qi + 1}
                              </span>
                              <p className="text-sm text-textMain leading-snug line-clamp-2">{q.pergunta}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => openReview(q)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
                              >
                                Tentar Novamente
                              </button>
                              <button
                                onClick={() => handleDelete(q.id)}
                                disabled={deleting === q.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-textMuted"
                                title="Remover sem tentar"
                              >
                                {deleting === q.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
