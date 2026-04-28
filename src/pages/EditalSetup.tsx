import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzeEdital, type EditalAnalysis } from '../lib/gemini';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  FileText, Loader2, Sparkles, CheckCircle2,
  BookOpen, Target, ChevronRight, AlertCircle
} from 'lucide-react';

interface Props {
  onComplete: () => void;
}

type Step = 'input' | 'analyzing' | 'preview' | 'saving' | 'done';

export function EditalSetup({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [editalText, setEditalText] = useState('');
  const [analysis, setAnalysis] = useState<EditalAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  const handleAnalyze = async () => {
    if (editalText.trim().length < 100) {
      setErrorMsg('Cole um trecho maior do edital para que a IA consiga identificar as disciplinas.');
      return;
    }
    setErrorMsg('');
    setStep('analyzing');

    const result = await analyzeEdital(editalText);
    if (!result || !result.disciplinas?.length) {
      setErrorMsg('Não foi possível extrair disciplinas do texto. Tente colar mais conteúdo do edital (as matérias do programa).');
      setStep('input');
      return;
    }

    // Sort by peso_edital descending (highest priority first)
    result.disciplinas.sort((a, b) => b.peso_edital - a.peso_edital);
    setAnalysis(result);
    setStep('preview');
  };

  const handleSaveAll = async () => {
    if (!analysis) return;
    setStep('saving');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setErrorMsg('Sessão expirada. Recarregue a página.');
      setStep('preview');
      return;
    }
    const userId = userData.user.id;
    let total = 0;

    for (const disc of analysis.disciplinas) {
      // 1. Insert discipline
      const { data: discData, error: discErr } = await supabase
        .from('disciplinas_evolucao')
        .insert({
          user_id: userId,
          nome_disciplina: disc.nome_disciplina,
          total_tarefas: disc.total_tarefas,
          total_aulas: disc.total_aulas,
        })
        .select('id')
        .single();

      if (discErr || !discData) continue;

      // 2. Insert tasks for this discipline
      const trilha = `Trilha 1`;
      const taskInserts = disc.tarefas.map((titulo) => ({
        user_id: userId,
        disciplina_id: discData.id,
        trilha_numero: trilha,
        titulo_tarefa: titulo,
        status: 'Pendente',
      }));

      if (taskInserts.length > 0) {
        await supabase.from('tarefas_ciclo').insert(taskInserts);
        total += taskInserts.length;
      }
    }

    setSavedCount(total);
    setStep('done');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-surface p-6">
      <div className="w-full max-w-3xl space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-black text-white mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-textMain">
            Configuração Inteligente
          </h1>
          <p className="text-textMuted max-w-lg mx-auto">
            Cole o conteúdo programático do seu edital e a IA irá criar automaticamente
            o seu ciclo de estudos com tarefas priorizadas por peso no concurso.
          </p>
        </div>

        {/* Step: Input */}
        {(step === 'input' || step === 'analyzing') && (
          <div className="space-y-4">
            <Card className="border-borderSubtle">
              <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <FileText className="w-5 h-5 text-textMuted mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-textMain">Cole o Edital ou Programa das Matérias</p>
                    <p className="text-xs text-textMuted mt-1">Quanto mais completo o texto, melhor a análise. Pode colar a seção de "Conteúdo Programático" ou a listagem completa de matérias.</p>
                  </div>
                </div>
                <textarea
                  className="w-full h-72 border border-borderSubtle bg-surface p-4 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono leading-relaxed"
                  placeholder={`Exemplo:\n\nPORTUGUÊS (10 questões): Ortografia, Crase, Concordância verbal e nominal, Regência, Interpretação de texto.\n\nDIREITO TRIBUTÁRIO (20 questões): Princípios constitucionais tributários, CTN, Obrigação tributária, Lançamento, Crédito tributário...\n\nTECNOLOGIA DA INFORMAÇÃO (15 questões): Banco de dados relacional, SQL, Redes de computadores, Segurança da informação...`}
                  value={editalText}
                  onChange={e => setEditalText(e.target.value)}
                  disabled={step === 'analyzing'}
                />
                <div className="flex justify-between items-center mt-3">
                  <span className="text-xs text-textMuted">{editalText.length} caracteres</span>
                  {errorMsg && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full h-12 text-base"
              onClick={handleAnalyze}
              disabled={step === 'analyzing' || editalText.trim().length < 100}
            >
              {step === 'analyzing' ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analisando edital com IA...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Analisar Edital e Gerar Cronograma
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && analysis && (
          <div className="space-y-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">{analysis.concurso}</p>
                  <p className="text-sm text-emerald-700">
                    {analysis.disciplinas.length} disciplinas identificadas •{' '}
                    {analysis.disciplinas.reduce((acc, d) => acc + d.tarefas.length, 0)} tarefas geradas
                  </p>
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-textMuted text-center">Revise as disciplinas ordenadas por prioridade (peso no edital)</p>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {analysis.disciplinas.map((disc, i) => (
                <Card key={i} className="border-borderSubtle">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-textMuted">#{i + 1}</span>
                        <div>
                          <h3 className="font-semibold text-textMain">{disc.nome_disciplina}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-textMuted">
                            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Peso {disc.peso_edital}/10</span>
                            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {disc.total_tarefas} tópicos</span>
                            <span>{disc.tarefas.length} tarefas geradas</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <div key={j} className={`h-2 w-2 rounded-full ${j < disc.peso_edital ? 'bg-black' : 'bg-borderSubtle'}`} />
                        ))}
                      </div>
                    </div>

                    {/* First 3 tasks preview */}
                    <div className="mt-2 space-y-1">
                      {disc.tarefas.slice(0, 3).map((tarefa, j) => (
                        <div key={j} className="flex items-start gap-2 text-xs text-textMuted">
                          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{tarefa}</span>
                        </div>
                      ))}
                      {disc.tarefas.length > 3 && (
                        <p className="text-xs text-textMuted pl-5">+ {disc.tarefas.length - 3} tarefas adicionais...</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('input')}>
                Reanalisar
              </Button>
              <Button className="flex-1 h-11" onClick={handleSaveAll}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Criar Ciclo de Estudos
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <Card className="border-borderSubtle">
            <CardContent className="p-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-textMuted" />
              <p className="font-semibold text-textMain">Criando disciplinas e tarefas...</p>
              <p className="text-sm text-textMuted">Aguarde enquanto montamos o seu ciclo de estudos no banco de dados.</p>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <Card className="border-borderSubtle">
            <CardContent className="p-16 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-textMain">Ciclo criado com sucesso!</h2>
                <p className="text-textMuted">
                  <span className="font-semibold text-textMain">{savedCount} tarefas</span> foram criadas e organizadas por prioridade no seu ciclo de estudos.
                </p>
              </div>
              <Button className="px-10 h-12" onClick={onComplete}>
                Ir para o Ciclo de Estudos <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
