import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
export const ai = new GoogleGenAI({ apiKey });

export async function evaluateStudyDay(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text || '';
  } catch (error) {
    console.error("Erro ao chamar o Gemini:", error);
    return "Não foi possível carregar o feedback do seu Coach no momento. Verifique sua conexão ou tente novamente mais tarde.";
  }
}

export async function generateFastReview(disciplina: string, tema: string) {
  try {
    const prompt = `Faça uma "Revisão Rápida" (Regra de Pareto 80/20) sobre o tópico "${tema}" da disciplina "${disciplina}" para concursos de alto nível.
Regras estritas:
1. Máximo absoluto de 1000 caracteres.
2. Foque APENAS nos 20% do assunto que caem em 80% das provas (conceitos-chave, exceções, palavras-chave e "pegadinhas" comuns).
3. Use formatação Markdown: **negrito** para palavras essenciais e bullet points (-) estruturados. Sem jargões ou introduções. Vá direto à revisão tática.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text || '';
  } catch (error) {
    console.error("Erro ao gerar revisão rápida:", error);
    return "Erro ao gerar revisão rápida. Verifique a internet e tente novamente.";
  }
}

export interface DisciplinaGerada {
  nome_disciplina: string;
  total_tarefas: number;
  total_aulas: number;
  peso_edital: number; // 1-10, usado para priorizar a geração de tarefas
  tarefas: string[]; // títulos das tarefas geradas
}

export interface EditalAnalysis {
  concurso: string;
  disciplinas: DisciplinaGerada[];
}

export interface BlocoGerado {
  nome_disciplina: string;
  hora_inicio: string;
  hora_fim: string;
  titulo: string;
}

export interface DiaGerado {
  data: string;
  dia_semana: string;
  blocos: BlocoGerado[];
}

export interface WeekSchedule {
  cronograma: DiaGerado[];
}

/** A single ordered study session (50 min block) in the full curriculum. */
export interface StudySession {
  nome_disciplina: string; // must match a discipline name provided
  titulo: string;          // specific topic/content of this session
  fase: string;            // "Teoria" | "Exercícios" | "Revisão" | "Simulado"
}

/** The full strategic curriculum for the entire study period. */
export interface FullCurriculum {
  sessoes: StudySession[];
  estrategia: string; // brief description of the overall plan
}

export interface FlashQuestion {
  pergunta: string;
  opcoes: string[];
  resposta_correta: number; // index 0-based
  explicacao: string;
}

export interface FlashQuiz {
  questoes: FlashQuestion[];
}

export async function generateFlashQuiz(disciplina: string, tema: string): Promise<FlashQuiz | null> {
  try {
    const prompt = `Aja como uma Inteligência Artificial especializada na banca FCC (Fundação Carlos Chagas) para concursos da área fiscal e controle.
Gere um Simulado Flash com exatamente 10 questões de nível DIFÍCIL sobre o tema "${tema}" da disciplina "${disciplina}".

Regras:
1. Dificuldade: Alta (hardcore), focando em letra da lei, jurisprudência recente e "pegadinhas" textuais típicas da FCC.
2. Rapidez: As perguntas e respostas devem ser diretas, mas sem perder o rigor técnico.
3. Formato: Responda APENAS com um JSON válido, sem explicações fora do JSON.

JSON Schema:
{
  "questoes": [
    {
      "pergunta": "Texto da questão...",
      "opcoes": ["Opção A", "Opção B", "Opção C", "Opção D", "Opção E"],
      "resposta_correta": 0,
      "explicacao": "Explicação técnica curta por que a correta é essa e por que as outras caem na pegadinha."
    }
  ]
}

Responda agora apenas com o JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    // Cleanup any potential thinking tags or markdown code blocks
    let jsonText = response.text ? response.text.trim() : "";
    if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1];
      if (jsonText.startsWith('json')) jsonText = jsonText.substring(4);
      jsonText = jsonText.trim();
    }
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Erro ao gerar Flash Quiz:", error);
    return null;
  }
}

/**
 * Generate a complete, ordered study curriculum from today until exam date.
 * Generates up to MAX_SESSIONS sessions; the populate step cycles through
 * them when the study period is longer (natural spaced repetition).
 */
const MAX_SESSIONS = 120; // safe output-token budget for Gemini

export async function generateFullCurriculum(params: {
  disciplinas: string[];
  horasPorDia: number;
  dataProva: string;    // "YYYY-MM-DD"
  dataInicio: string;   // "YYYY-MM-DD"
  dificuldades: string;
  cargo: string;
  totalBlocos: number;  // actual blocks in period (informational, capped internally)
}): Promise<FullCurriculum | null> {

  const sessionsToGenerate = Math.min(params.totalBlocos, MAX_SESSIONS);

  const prompt = `Você é um Coach de Concursos Públicos especializado em planejamento estratégico.

MISSÃO: Gerar um plano de estudos COMPLETO e ORDENADO que cobre TODO o conteúdo antes da prova.

PARÂMETROS:
- Cargo: ${params.cargo}
- Início: ${params.dataInicio}
- Prova: ${params.dataProva}
- Horas/dia: ${params.horasPorDia}h
- Sessões a gerar: ${sessionsToGenerate}
- Dificuldades: ${params.dificuldades || 'Não informadas'}
- Disciplinas (use SEM alterações): ${params.disciplinas.join(' | ')}

ESTRATÉGIA (${sessionsToGenerate} sessões de 50 min):
- Primeiros 35%: TEORIA — fundamentos, da mais difícil à mais fácil, alternando disciplinas.
- Próximos 35%: EXERCÍCIOS — questões de provas anteriores, foco nos temas cobrados.
- Próximos 20%: REVISÃO — intercalada, mapas mentais, questões mistas.
- Últimos 10%: SIMULADO — simulados cronometrados, revisão de erros críticos.

REGRAS:
1. Use APENAS os nomes de disciplina da lista, sem alterações.
2. Títulos específicos: ex "Redes — Modelo OSI camadas 1-4", "Ex. AF/GO-2022 Infraestrutura q1-25".
3. Distribua proporcionalmente: disciplinas difíceis recebem mais blocos.
4. Gere EXATAMENTE ${sessionsToGenerate} objetos no array sessoes.

Responda APENAS JSON (sem markdown, sem texto fora do JSON):
{"estrategia":"frase resumo da abordagem","sessoes":[{"nome_disciplina":"Nome exato","titulo":"Conteúdo","fase":"Teoria"}]}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.1 },
    });

    const text = response.text || '';
    // Robust extraction: find first { ... } block, handles markdown fences or leading text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Gemini] No JSON found in response. First 300 chars:', text.slice(0, 300));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as FullCurriculum;
    if (!parsed.sessoes || parsed.sessoes.length === 0) {
      console.error('[Gemini] Parsed curriculum has no sessions:', parsed);
      return null;
    }
    console.info(`[Gemini] Generated ${parsed.sessoes.length} sessions.`);
    return parsed;
  } catch (err) {
    console.error('[Gemini] generateFullCurriculum error:', err);
    return null;
  }
}

/**
 * Convert the first N sessions into a WeekSchedule preview for display.
 * N = blocksPerDay × 7 (one week).
 */
export function sessionsToPreviewSchedule(
  sessions: StudySession[],
  semanaInicio: string,
  blocosPerDia: number,
): WeekSchedule {
  const toTime = (startMins: number) => {
    const h = Math.floor(startMins / 60) % 24;
    const m = startMins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };
  const DIAS = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];

  const cronograma: DiaGerado[] = Array.from({ length: 7 }, (_, dayIdx) => {
    const d = new Date(semanaInicio + 'T12:00:00');
    d.setDate(d.getDate() + dayIdx);
    const data = d.toISOString().split('T')[0];

    const dayStart = dayIdx * blocosPerDia;
    const daySessions = sessions.slice(dayStart, dayStart + blocosPerDia);

    const blocos: BlocoGerado[] = daySessions.map((s, i) => {
      const startMins = 8 * 60 + i * 60; // 08:00, 09:00, ... (60 min slots incl gap)
      return {
        nome_disciplina: s.nome_disciplina,
        hora_inicio: toTime(startMins),
        hora_fim: toTime(startMins + 50),
        titulo: s.titulo,
      };
    });

    return { data, dia_semana: DIAS[dayIdx], blocos };
  });

  return { cronograma };
}


export async function analyzeEdital(editalText: string): Promise<EditalAnalysis | null> {
  const prompt = `Você é um especialista em concursos públicos fiscais de alto nível (Receita Federal, PGFN, TCU, AGU, TRF).

Analise o seguinte texto de edital de concurso público e extraia as disciplinas/matérias que serão cobradas na prova.

Para cada disciplina, você deve:
1. Identificar o nome oficial da disciplina
2. Estimar o peso relativo no edital (proporção de questões), de 1 a 10
3. Gerar uma lista de tarefas de estudo sequenciais e realistas para cobrir a disciplina do zero até o nível avançado (máximo 15 tarefas por disciplina, foco nas subtarefas mais relevantes para acertar questões)
4. Estimar total_tarefas (número de subtópicos do edital) e total_aulas (estimativa de aulas do curso)

Responda SOMENTE com um objeto JSON válido, sem markdown, sem explicações, exatamente neste formato:
{
  "concurso": "Nome do Concurso",
  "disciplinas": [
    {
      "nome_disciplina": "Nome da Disciplina",
      "total_tarefas": 20,
      "total_aulas": 40,
      "peso_edital": 8,
      "tarefas": [
        "Estudo do Tópico A - conceitos e definições",
        "Estudo do Tópico B - legislação base",
        "Resolução de 20 questões sobre Tópico A",
        "Revisão de erros - Tópico A e B"
      ]
    }
  ]
}

TEXTO DO EDITAL:
${editalText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
      }
    });

    const rawText = response.text || '';
    // Strip possible markdown code fences
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed: EditalAnalysis = JSON.parse(cleaned);
    return parsed;
  } catch (error) {
    console.error("Erro ao analisar edital:", error);
    return null;
  }
}
