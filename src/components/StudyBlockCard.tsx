import { useState, useEffect } from 'react';
import { Play, CheckCircle2, Lock, Timer } from 'lucide-react';

export interface BlockData {
  id: string;
  block_number: number;
  subject: string;
  notes: string;
  focus_score: number;
  needs_review: boolean;
  completed: boolean;
}

interface Props {
  block: BlockData;
  isActive: boolean;
  isLocked: boolean;
  onComplete: (data: BlockData) => void;
  testMode?: boolean;
}

export function StudyBlockCard({ block, isLocked, onComplete, testMode = false }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'break' | 'feedback' | 'completed'>(
    block.completed ? 'completed' : 'idle'
  );
  // Default 50 minutes, or 5 seconds in test mode
  const initialTime = testMode ? 5 : 50 * 60;
  const [timeLeft, setTimeLeft] = useState(initialTime);

  // Form states
  const [notes, setNotes] = useState(block.notes || '');
  const [focusScore, setFocusScore] = useState(block.focus_score || 3);
  const [needsReview, setNeedsReview] = useState(block.needs_review || false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'running') {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setStatus('feedback');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleStart = () => {
    setStatus('running');
    setTimeLeft(initialTime);
  };

  const handleSaveFeedback = () => {
    if (!notes.trim()) {
      alert("Por favor, preencha o que aprendeu ou as dificuldades encontradas.");
      return;
    }
    onComplete({
      ...block,
      notes,
      focus_score: focusScore,
      needs_review: needsReview,
      completed: true
    });
    setStatus('completed');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`glass-panel p-5 transition-all duration-300 ${isLocked ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${block.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
            {block.block_number}
          </div>
          <div>
            <input 
              className="font-medium text-textMain bg-transparent border-none outline-none placeholder-gray-400" 
              placeholder="Qual a disciplina?"
              value={block.subject}
              onChange={() => {}} // Note: In a real app subject could be edited before start
              disabled={status !== 'idle' || block.completed}
              readOnly
            />
            <p className="text-xs text-textMuted">Bloco de 50 min</p>
          </div>
        </div>
        
        {status === 'completed' && <CheckCircle2 className="text-green-500 w-5 h-5" />}
        {isLocked && <Lock className="text-gray-400 w-4 h-4" />}
      </div>

      {status === 'idle' && !isLocked && !block.completed && (
         <button
           onClick={handleStart}
           className="w-full py-2.5 rounded-lg border border-borderSubtle bg-white hover:bg-gray-50 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
         >
           <Play className="w-4 h-4" /> Iniciar Sessão
         </button>
      )}

      {status === 'running' && (
        <div className="text-center py-6 bg-gray-50 rounded-lg border border-borderSubtle animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-center items-center gap-2 mb-2">
            <Timer className="w-5 h-5 animate-pulse text-primary" />
            <span className="text-3xl font-bold font-mono tracking-wider">{formatTime(timeLeft)}</span>
          </div>
          <p className="text-sm text-textMuted">Mantenha o foco...</p>
        </div>
      )}

      {status === 'feedback' && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-textMain mb-1">O que aprendi/errei neste bloco?</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-sm p-3 border border-borderSubtle rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary h-24 resize-none"
                placeholder="Registe os principais tópicos e dificuldades..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-textMain mb-2">Nível de Foco e Retenção: {focusScore}</label>
              <input 
                type="range" 
                min="1" 
                max="5" 
                value={focusScore} 
                onChange={(e) => setFocusScore(parseInt(e.target.value))}
                className="w-full accent-primary" 
              />
              <div className="flex justify-between text-xs text-textMuted mt-1">
                <span>Distraído</span>
                <span>Excelente</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                 type="checkbox" 
                 checked={needsReview}
                 onChange={(e) => setNeedsReview(e.target.checked)}
                 className="rounded border-gray-300 text-primary focus:ring-primary accent-primary w-4 h-4"
              />
              <span className="text-sm">Precisa de revisão profunda amanhã?</span>
            </label>

            <button
               onClick={handleSaveFeedback}
               className="w-full py-2.5 rounded-lg bg-primary text-white hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              Gravar Registo
            </button>
          </div>
        </div>
      )}
      
      {status === 'completed' && block.notes && (
        <div className="mt-4 pt-4 border-t border-borderSubtle animate-in fade-in">
           <p className="text-sm text-gray-600 italic line-clamp-2">"{block.notes}"</p>
           <div className="flex gap-4 mt-2 text-xs text-textMuted font-medium">
             <span>Foco: {block.focus_score}/5</span>
             {block.needs_review && <span className="text-amber-600">Revisão Pendente</span>}
           </div>
        </div>
      )}
    </div>
  );
}
