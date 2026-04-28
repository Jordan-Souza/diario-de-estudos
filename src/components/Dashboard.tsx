import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StudyBlockCard, type BlockData } from './StudyBlockCard';
import { AICoachFeedback } from './AICoachFeedback';
import { evaluateStudyDay } from '../lib/gemini';
// import { supabase } from '../lib/supabase';

// Mock initial data so the UI can be tested without the DB initially
const initialBlocks: BlockData[] = [
  { id: '1', block_number: 1, subject: 'Direito Tributário', notes: '', focus_score: 3, needs_review: false, completed: false },
  { id: '2', block_number: 2, subject: 'Auditoria TI', notes: '', focus_score: 3, needs_review: false, completed: false },
  { id: '3', block_number: 3, subject: 'Banco de Dados', notes: '', focus_score: 3, needs_review: false, completed: false },
  { id: '4', block_number: 4, subject: 'Estatística', notes: '', focus_score: 3, needs_review: false, completed: false },
];

export function Dashboard() {
  const [blocks, setBlocks] = useState<BlockData[]>(initialBlocks);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [testMode, setTestMode] = useState(true); // default to true to test easily

  const completedCount = blocks.filter(b => b.completed).length;
  const allCompleted = completedCount === blocks.length;

  const handleBlockComplete = (updatedBlock: BlockData) => {
    setBlocks(prev => prev.map(b => b.id === updatedBlock.id ? updatedBlock : b));
  };

  const handleEvaluateDay = async () => {
    setIsAiLoading(true);
    const feedbackText = blocks.map(b => 
      `Bloco ${b.block_number} (${b.subject}): Notas: "${b.notes}", Foco: ${b.focus_score}/5, Revisar amanhã: ${b.needs_review ? 'Sim' : 'Não'}`
    ).join('\n');

    const feedback = await evaluateStudyDay(feedbackText);
    setAiFeedback(feedback || null);
    setIsAiLoading(false);
  };

  const activeBlockIndex = blocks.findIndex(b => !b.completed);

  return (
    <div className="min-h-screen bg-surface selection:bg-gray-200">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="flex justify-between items-end mb-2">
            <h1 className="text-2xl font-bold tracking-tight text-textMain">Diário de Estudos</h1>
            <span className="text-sm text-textMuted font-medium uppercase tracking-wider">
              {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
            </span>
          </div>
          
          {/* Progress context */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-primary transition-all duration-500 ease-out" 
                 style={{ width: `${(completedCount / blocks.length) * 100}%` }}
               />
            </div>
            <span className="text-sm font-medium text-textMuted whitespace-nowrap">
               Bloco {completedCount} de {blocks.length} concluído
            </span>
          </div>
        </header>

        <div className="mb-6 flex justify-end">
           <label className="flex items-center gap-2 cursor-pointer text-xs text-textMuted">
             <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} className="rounded" />
             <span>Modo de Teste (Cronômetro 5s)</span>
           </label>
        </div>

        <main className="space-y-4">
          {blocks.map((block, index) => {
            const isLocked = activeBlockIndex !== -1 && index > activeBlockIndex;
            const isActive = index === activeBlockIndex;
            
            return (
              <StudyBlockCard 
                key={block.id}
                block={block}
                isActive={isActive}
                isLocked={isLocked}
                onComplete={handleBlockComplete}
                testMode={testMode}
              />
            );
          })}
        </main>

        <AICoachFeedback 
           feedback={aiFeedback}
           isLoading={isAiLoading}
           onEvaluate={handleEvaluateDay}
           canEvaluate={allCompleted}
        />
        
        {allCompleted && !aiFeedback && !isAiLoading && (
          <p className="text-center text-sm text-textMuted mt-4">
            Você completou todos os blocos de hoje. Peça ao Coach para analisar seu desempenho!
          </p>
        )}
      </div>
    </div>
  );
}
