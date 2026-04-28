
import { Bot, Loader2 } from 'lucide-react';

interface Props {
  feedback: string | null;
  isLoading: boolean;
  onEvaluate: () => void;
  canEvaluate: boolean;
}

export function AICoachFeedback({ feedback, isLoading, onEvaluate, canEvaluate }: Props) {
  if (!feedback && !isLoading && !canEvaluate) return null;

  return (
    <div className="mt-8 border-t border-borderSubtle pt-8">
      {!feedback && !isLoading ? (
        <button
          onClick={onEvaluate}
          disabled={!canEvaluate}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg bg-primary text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          <Bot className="w-5 h-5" />
          Avaliar o meu dia com IA
        </button>
      ) : (
        <div className="glass-panel p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-primary">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg">Feedback do Coach</h3>
          </div>
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-6 text-textMuted gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p>A analisar o seu dia...</p>
            </div>
          ) : (
             <div className="prose prose-sm prose-gray max-w-none">
              {feedback?.split('\n').map((paragraph, index) => (
                <p key={index} className="text-gray-700 leading-relaxed mb-2">{paragraph}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
