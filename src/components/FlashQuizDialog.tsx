import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import {
  Loader2, BrainCircuit, CheckCircle, XCircle, ChevronRight,
  Trophy, Zap, Clock, AlertCircle, RotateCcw
} from 'lucide-react';
import { generateFlashQuiz } from '../lib/gemini';
import type { FlashQuiz } from '../lib/gemini';
import { supabase } from '../lib/supabase';
import { AmbientPlayer } from './AmbientPlayer';

const QUESTION_TIME_LIMIT = 60; // seconds per question

interface AnswerRecord {
  selected: number;
  correct: number;
  isRight: boolean;
  timeUsed: number;
}

interface FlashQuizDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskTitle: string;
  taskId: string;
  disciplineName: string;
  onComplete: (correctCount: number, totalCount: number) => void;
}

export function FlashQuizDialog({ isOpen, onClose, taskTitle, taskId, disciplineName, onComplete }: FlashQuizDialogProps) {
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<FlashQuiz | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_LIMIT);
  const [taskFinalized, setTaskFinalized] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef(Date.now());

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setTimeLeft(QUESTION_TIME_LIMIT);
    questionStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer();
          // Time's up — auto-submit as wrong
          setShowFeedback(true);
          setSelectedOption(-1);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => {
    if (isOpen) startQuiz();
    return () => stopTimer();
  }, [isOpen]);

  useEffect(() => {
    if (!loading && !quizFinished && !showFeedback) {
      startTimer();
    }
  }, [currentIndex, loading, quizFinished]);

  // Handle auto-submit on timeout
  useEffect(() => {
    if (timeLeft === 0 && !showFeedback) {
      stopTimer();
      const timeUsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      const q = quiz?.questoes[currentIndex];
      if (q) {
        setAnswers(prev => [...prev, { selected: -1, correct: q.resposta_correta, isRight: false, timeUsed }]);
      }
      setShowFeedback(true);
    }
  }, [timeLeft]);

  const startQuiz = async () => {
    stopTimer();
    setLoading(true);
    setQuizFinished(false);
    setCurrentIndex(0);
    setScore(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setAnswers([]);
    setTaskFinalized(false);

    const generatedQuiz = await generateFlashQuiz(disciplineName, taskTitle);
    setQuiz(generatedQuiz);
    setLoading(false);
  };

  const handleOptionSelect = (index: number) => {
    if (showFeedback) return;
    stopTimer();

    const timeUsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    const q = quiz!.questoes[currentIndex];
    const isRight = index === q.resposta_correta;

    setSelectedOption(index);
    setShowFeedback(true);
    if (isRight) setScore(s => s + 1);
    setAnswers(prev => [...prev, { selected: index, correct: q.resposta_correta, isRight, timeUsed }]);
  };

  const handleNext = () => {
    if (currentIndex < 9) {
      setCurrentIndex(c => c + 1);
      setSelectedOption(null);
      setShowFeedback(false);
    } else {
      stopTimer();
      setQuizFinished(true);
      // Save wrong answers to Supabase
      saveWrongAnswers(pendingAnswers.current);
    }
  };

  // Buffer answers for the save on finish
  const pendingAnswers = useRef<AnswerRecord[]>([]);
  useEffect(() => { pendingAnswers.current = answers; }, [answers]);

  const saveWrongAnswers = async (finalAnswers: AnswerRecord[]) => {
    if (!quiz) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const wrongs = finalAnswers
      .map((a, i) => ({ a, q: quiz.questoes[i] }))
      .filter(({ a }) => !a.isRight)
      .map(({ a, q }) => ({
        user_id: user.id,
        disciplina: disciplineName,
        tema: taskTitle,
        tarefa_id: taskId || null,
        pergunta: q.pergunta,
        opcoes: q.opcoes,
        resposta_correta: q.resposta_correta,
        resposta_selecionada: a.selected,
        explicacao: q.explicacao,
      }));

    if (wrongs.length > 0) {
      await supabase.from('questoes_erradas').insert(wrongs);
    }
  };

  const currentQuestion = quiz?.questoes[currentIndex];
  const progress = ((currentIndex + (showFeedback ? 1 : 0)) / 10) * 100;
  const timerPct = (timeLeft / QUESTION_TIME_LIMIT) * 100;
  const timerColor = timeLeft <= 10 ? 'text-red-500' : timeLeft <= 20 ? 'text-amber-500' : 'text-textMuted';
  const timerBarColor = timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 20 ? 'bg-amber-500' : 'bg-primary';

  const getGrade = (s: number) => {
    if (s >= 9) return { label: 'Excelência Absoluta ⭐', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (s >= 7) return { label: 'Aprovado na FCC ✅', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (s >= 5) return { label: 'Zona de Risco ⚠️', color: 'text-amber-600', bg: 'bg-amber-100' };
    return { label: 'Reprovado — Rever Matéria ❌', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const grade = getGrade(score);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl flex flex-col p-0 overflow-hidden max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-borderSubtle bg-surface/50">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-primary">
                <Zap className="w-5 h-5 fill-primary shrink-0" />
                Desafio Flash FCC — Nível Hard
              </DialogTitle>
              <p className="text-xs text-textMuted uppercase tracking-widest font-bold truncate mt-0.5">{disciplineName} • {taskTitle}</p>
            </div>
            {/* Ambient music player — compact */}
            <div className="shrink-0 w-44">
              <AmbientPlayer playing={!loading && !quizFinished} />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-16">
              <div className="relative w-16 h-16 mx-auto">
                <BrainCircuit className="w-16 h-16 text-primary opacity-10" />
                <Loader2 className="w-16 h-16 text-primary animate-spin absolute inset-0" />
              </div>
              <h3 className="font-bold text-lg">Invocando a Banca FCC...</h3>
              <p className="text-sm text-textMuted max-w-xs">A FCC adora textos longos e pegadinhas textuais. Prepare o foco.</p>
            </div>

          ) : quizFinished ? (
            <div className="space-y-6 py-4 animate-in zoom-in-95 duration-300">
              {/* Grade Banner */}
              <div className={`p-4 rounded-xl flex flex-col items-center gap-2 text-center ${grade.bg}`}>
                <Trophy className={`w-10 h-10 ${grade.color}`} />
                <p className={`font-black text-xl ${grade.color}`}>{grade.label}</p>
              </div>

              {/* Score panels */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface p-4 rounded-xl border border-borderSubtle text-center">
                  <p className="text-3xl font-black text-primary">{score}/10</p>
                  <p className="text-[10px] uppercase font-bold text-textMuted mt-1">Acertos</p>
                </div>
                <div className="bg-surface p-4 rounded-xl border border-borderSubtle text-center">
                  <p className={`text-3xl font-black ${score >= 7 ? 'text-emerald-600' : score >= 5 ? 'text-amber-600' : 'text-red-600'}`}>{score * 10}%</p>
                  <p className="text-[10px] uppercase font-bold text-textMuted mt-1">Aproveit.</p>
                </div>
                <div className="bg-surface p-4 rounded-xl border border-borderSubtle text-center">
                  <p className="text-3xl font-black text-textMuted">
                    {answers.length > 0 ? Math.round(answers.reduce((s, a) => s + a.timeUsed, 0) / answers.length) : '—'}s
                  </p>
                  <p className="text-[10px] uppercase font-bold text-textMuted mt-1">Média/q.</p>
                </div>
              </div>

              {/* Answer map (Q1–Q10 grid) */}
              <div>
                <p className="text-xs font-bold text-textMuted uppercase tracking-wider mb-2">Mapa de Respostas</p>
                <div className="grid grid-cols-10 gap-1.5">
                  {answers.map((a, i) => (
                    <div
                      key={i}
                      title={`Q${i + 1}: ${a.isRight ? 'Correta' : 'Errada'} (${a.timeUsed}s)`}
                      className={`h-8 rounded flex items-center justify-center text-xs font-black ${a.isRight ? 'bg-emerald-500 text-white' : a.selected === -1 ? 'bg-gray-400 text-white' : 'bg-red-400 text-white'}`}
                    >
                      {i + 1}
                    </div>
                  ))}
                  {/* placeholder for unfilled on timeout */}
                  {Array.from({ length: Math.max(0, 10 - answers.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-8 rounded bg-surface border border-borderSubtle" />
                  ))}
                </div>
                <div className="flex gap-4 mt-2 text-[10px] text-textMuted font-bold">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Certa</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Errada</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-400 inline-block" /> Tempo Esgotado</span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                {!taskFinalized ? (
                  <Button className="w-full h-12 text-base font-bold shadow-md" onClick={() => { setTaskFinalized(true); onComplete(score, 10); }}>
                    <CheckCircle className="w-5 h-5 mr-2" /> Registrar Resultado na Trilha
                  </Button>
                ) : (
                  <div className="w-full h-12 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm">
                    <CheckCircle className="w-4 h-4" /> Resultado Registrado!
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={startQuiz}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Nova Rodada (Questões Diferentes)
                </Button>
              </div>
            </div>

          ) : currentQuestion ? (
            <div className="flex-1 flex flex-col space-y-5">
              {/* Progress + Timer */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Questão {currentIndex + 1} / 10
                  </span>
                  <span className={`flex items-center gap-1 text-sm font-black tabular-nums ${timerColor} transition-colors`}>
                    <Clock className="w-3.5 h-3.5" /> {timeLeft}s
                  </span>
                </div>
                <Progress value={progress} className="h-1.5" />
                {/* Timer bar */}
                <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full ${timerBarColor} transition-all duration-1000 ease-linear rounded-full`}
                    style={{ width: `${timerPct}%` }}
                  />
                </div>
              </div>

              {/* Question */}
              <h3 className="text-base font-bold text-textMain leading-snug">{currentQuestion.pergunta}</h3>

              {/* Options */}
              <div className="space-y-2.5">
                {currentQuestion.opcoes.map((opcao, idx) => {
                  const isCorrect = idx === currentQuestion.resposta_correta;
                  const isSelected = idx === selectedOption;

                  let cls = 'border-borderSubtle hover:border-primary bg-white hover:bg-surface/50 cursor-pointer';
                  if (showFeedback) {
                    if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200';
                    else if (isSelected) cls = 'border-red-500 bg-red-50 ring-2 ring-red-200';
                    else cls = 'opacity-40 border-borderSubtle bg-white pointer-events-none';
                  }

                  return (
                    <button
                      key={idx}
                      disabled={showFeedback}
                      onClick={() => handleOptionSelect(idx)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-150 flex items-center gap-3 group ${cls}`}
                    >
                      <span className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-black transition-colors
                        ${isSelected && !showFeedback ? 'bg-primary text-white border-primary' : ''}
                        ${showFeedback && isCorrect ? 'bg-emerald-500 text-white border-emerald-500' : ''}
                        ${showFeedback && isSelected && !isCorrect ? 'bg-red-500 text-white border-red-500' : ''}
                        ${!isSelected || !showFeedback ? 'bg-surface text-textMuted border-borderSubtle group-hover:border-primary' : ''}
                      `}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm font-medium flex-1 leading-snug">{opcao}</span>
                      {showFeedback && isCorrect && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {showFeedback && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Timeout notice if no option selected */}
              {showFeedback && selectedOption === -1 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Tempo esgotado! A resposta correta era a alternativa {String.fromCharCode(65 + currentQuestion.resposta_correta)}.
                </div>
              )}

              {/* Explanation */}
              {showFeedback && (
                <div className="animate-in slide-in-from-bottom-2 duration-300 space-y-3">
                  <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
                    (selectedOption === currentQuestion.resposta_correta)
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                    <p className="font-black uppercase tracking-wider mb-1">
                      {selectedOption === currentQuestion.resposta_correta ? '✅ Correta!' : `❌ ${selectedOption === -1 ? 'Tempo Esgotado —' : 'Errada —'}`} Entenda o porquê:
                    </p>
                    <p>{currentQuestion.explicacao}</p>
                  </div>
                  <Button className="w-full h-11 shadow-sm group" onClick={handleNext}>
                    {currentIndex < 9 ? 'Próxima Questão' : 'Ver Resultado Final'}
                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              )}
            </div>

          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-600 font-semibold">Erro ao gerar as questões.</p>
              <Button variant="outline" onClick={startQuiz}><RotateCcw className="w-4 h-4 mr-2" /> Tentar Novamente</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



