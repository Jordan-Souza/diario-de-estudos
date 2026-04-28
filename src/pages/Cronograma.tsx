import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { scheduleReviewTask } from '../lib/scheduler';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, addDays, startOfWeek, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check, Loader2, CheckCircle2, PlayCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { generateFullCurriculum, sessionsToPreviewSchedule, type FullCurriculum, type WeekSchedule } from '../lib/gemini';
import { Sparkles, Trash } from 'lucide-react';
import { PomodoroTimerDialog } from '../components/PomodoroTimerDialog';

// ─── Color palette ────────────────────────────────────────────────────────────
const DISC_COLORS = [
  { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  { bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  { bg: 'bg-rose-100',    text: 'text-rose-800',    border: 'border-rose-200',    dot: 'bg-rose-500'    },
  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    border: 'border-cyan-200',    dot: 'bg-cyan-500'    },
  { bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
  { bg: 'bg-pink-100',    text: 'text-pink-800',    border: 'border-pink-200',    dot: 'bg-pink-500'    },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Disciplina { id: string; nome_disciplina: string; }
interface TaskCiclo {
  id: string;
  user_id: string;
  disciplina_id: string;
  trilha_numero: string;
  titulo_tarefa: string;
  status: string;
  nome_disciplina?: string;
}
interface BlocoAgenda {
  id: string;
  disciplina_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  titulo_override: string | null;
  ordem: number;
  nome_disciplina?: string;
}

// ─── Helper: compute next free 50-min slot in a day ──────────────────────────
function nextSlot(dayBlocos: BlocoAgenda[]): { start: string; end: string } {
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toTime = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  if (dayBlocos.length === 0) return { start: '08:00', end: '08:50' };

  const latestEnd = dayBlocos.reduce(
    (max, b) => {
      const t = toMins(b.hora_fim.slice(0, 5));
      return t > max ? t : max;
    },
    0
  );
  const gapMins = latestEnd + 10;   // 10-min gap
  return { start: toTime(gapMins), end: toTime(gapMins + 50) };
}

// ─── Acronym generator ───────────────────────────────────────────────────────
const STOP = new Set(['de','do','da','dos','das','e','a','o','as','os','em','para','com','por','ao','à','um','uma','no','na']);
function makeAcronym(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 1 && !STOP.has(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  // First letter of each significant word, up to 4 chars
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase();
}

// ─── Draggable Discipline Chip (header) ───────────────────────────────────────
function DisciplineChip({
  disc, colorIdx,
}: { disc: Disciplina; colorIdx: number }) {
  const color = DISC_COLORS[colorIdx % DISC_COLORS.length];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `disc-${disc.id}`,
    data: { type: 'discipline', disciplina: disc },
  });
  const acronym = makeAcronym(disc.nome_disciplina);

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={disc.nome_disciplina}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 md:px-2.5 md:py-1 rounded-full text-[10px] md:text-[11px] font-bold cursor-grab active:cursor-grabbing select-none transition-all
        ${color.bg} ${color.text} ${isDragging ? 'opacity-30' : 'opacity-100'} shadow-sm`}
    >
      <span className={`w-2 h-2 md:w-1.5 md:h-1.5 rounded-full shrink-0 ${color.dot}`} />
      <span>{acronym}</span>
      <span className="hidden xl:inline text-[10px] font-normal opacity-70 max-w-[80px] truncate">{disc.nome_disciplina}</span>
    </span>
  );
}

// ─── Sortable Block Card — compact pill ──────────────────────────────────────
function BlocoCard({
  bloco, colorIdx, onEdit, onDelete, onComplete, onStartTimer,
}: {
  bloco: BlocoAgenda; colorIdx: number;
  onEdit: (b: BlocoAgenda) => void;
  onDelete: (id: string) => void;
  onComplete: (b: BlocoAgenda) => void;
  onStartTimer: (b: BlocoAgenda) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: bloco.id, data: { type: 'block', bloco } });

  const color = DISC_COLORS[colorIdx % DISC_COLORS.length];
  const label = bloco.titulo_override || bloco.nome_disciplina || '';
  const acronym = makeAcronym(label);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.25 : 1 }}
      title={label}
      className={`group relative flex items-center gap-1.5 rounded-md border px-2 py-1 select-none cursor-default
        ${color.border} ${color.bg}`}
    >
      {/* Drag handle — only the colored dot */}
      <button
        {...listeners}
        {...attributes}
        className="shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
      >
        <span className={`block w-2 h-2 rounded-full ${color.dot}`} />
      </button>

      {/* Acronym + time */}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold leading-none ${color.text}`}>{acronym}</p>
        <p className="text-[9px] text-gray-400 mt-0.5 leading-none">
          {bloco.hora_inicio.slice(0, 5)}–{bloco.hora_fim.slice(0, 5)}
        </p>
      </div>

      {/* Minimal ghost action buttons — appear on hover */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 bg-white/90 backdrop-blur-sm p-0.5 rounded shadow-sm border border-black/5 z-10">
        <button
          onClick={e => { e.stopPropagation(); onStartTimer(bloco); }}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-blue-100 transition-colors"
          title="Iniciar Pomodoro"
        >
          <PlayCircle className="w-3 h-3 text-blue-500" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onComplete(bloco); }}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-emerald-100 transition-colors"
          title="Registar conclusão"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEdit(bloco); }}
          className={`w-4 h-4 rounded flex items-center justify-center hover:bg-black/10 transition-colors`}
        >
          <Pencil className={`w-3 h-3 ${color.text}`} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(bloco.id); }}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Day Column: Droppable + Sortable ────────────────────────────────────────
function DayColumn({
  date, blocos, disciplinaColorMap, onAdd, onEdit, onDelete, onComplete, onStartTimer,
}: {
  date: Date;
  blocos: BlocoAgenda[];
  disciplinaColorMap: Record<string, number>;
  onAdd: (date: Date) => void;
  onEdit: (b: BlocoAgenda) => void;
  onDelete: (id: string) => void;
  onComplete: (b: BlocoAgenda) => void;
  onStartTimer: (b: BlocoAgenda) => void;
}) {
  const today = isToday(date);
  const dayStr = format(date, 'yyyy-MM-dd');

  // Make the whole column droppable for discipline chips
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop-${dayStr}` });

  return (
    <div
      ref={setDropRef}
      className={`flex flex-col min-h-[440px] md:min-h-[480px] w-[80vw] md:w-auto shrink-0 snap-center md:snap-align-none rounded-xl border transition-all duration-150
        ${today ? 'border-primary/30 bg-primary/[0.01]' : 'border-borderSubtle bg-surface/20'}
        ${isOver ? 'ring-2 ring-primary/25 bg-primary/[0.02]' : ''}`}
    >
      {/* Day header */}
      <div className={`px-3 py-2.5 border-b ${today ? 'border-black/10' : 'border-borderSubtle'} flex items-center justify-between`}>
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${today ? 'text-black' : 'text-textMuted'}`}>
            {format(date, 'EEE', { locale: ptBR })}
          </p>
          <p className={`text-xl font-bold leading-tight ${today ? 'text-black' : 'text-textMain'}`}>
            {format(date, 'd')}
          </p>
          {today && <span className="text-[9px] font-bold uppercase tracking-widest text-black/50">Hoje</span>}
        </div>
        <button
          onClick={() => onAdd(date)}
          className="w-6 h-6 rounded-full border border-borderSubtle bg-white hover:bg-surface flex items-center justify-center transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-textMuted" />
        </button>
      </div>

      {/* Sortable blocks area */}
      <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
        <SortableContext
          items={blocos.map(b => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {blocos.map(bloco => (
            <BlocoCard
              key={bloco.id}
              bloco={bloco}
              colorIdx={disciplinaColorMap[bloco.disciplina_id] ?? 0}
              onEdit={onEdit}
              onDelete={onDelete}
              onComplete={onComplete}
              onStartTimer={onStartTimer}
            />
          ))}
        </SortableContext>

        {blocos.length === 0 && (
          <div
            className={`flex items-center justify-center h-16 rounded-lg border-2 border-dashed transition-colors text-[10px] text-textMuted
              ${isOver ? 'border-primary/50 bg-primary/5 text-primary' : 'border-borderSubtle'}`}
          >
            {isOver ? '↓ Solte' : ''}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Cronograma Page ─────────────────────────────────────────────────────
export function Cronograma() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [blocos, setBlocos] = useState<BlocoAgenda[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BlocoAgenda | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formDisc, setFormDisc] = useState('');
  const [formTitulo, setFormTitulo] = useState('');
  const [formInicio, setFormInicio] = useState('08:00');
  const [formFim, setFormFim] = useState('08:50');
  const [saving, setSaving] = useState(false);

  // Active drag info
  const [activeType, setActiveType] = useState<'block' | 'discipline' | null>(null);
  const [activeBloco, setActiveBloco] = useState<BlocoAgenda | null>(null);
  const [activeDisc, setActiveDisc] = useState<Disciplina | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ── AI Wizard state ─────────────────────────────────────────────────────
  type WizardStep = 'idle' | 'config' | 'generating' | 'preview' | 'saving' | 'done';
  const [wizStep, setWizStep] = useState<WizardStep>('idle');
  const [wizCargo, setWizCargo] = useState('Auditor-Fiscal da Fazenda Estadual - TI (FCC)');
  const [wizDataProva, setWizDataProva] = useState('');
  const [wizHoras, setWizHoras] = useState(4);
  const [wizDific, setWizDific] = useState('Infraestrutura de TIC');
  const [wizTemplate, setWizTemplate] = useState<FullCurriculum | null>(null);
  const [wizSchedule, setWizSchedule] = useState<WeekSchedule | null>(null);
  const [wizError, setWizError] = useState('');
  const [wizTotalDias, setWizTotalDias] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);

  // ── Completion (Concluído) state ───────────────────────────────────────────
  const [completionBloco, setCompletionBloco] = useState<BlocoAgenda | null>(null);
  const [pendingTasks, setPendingTasks] = useState<TaskCiclo[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskCiclo | null>(null);
  const [cmpDate, setCmpDate] = useState(new Date().toISOString().split('T')[0]);
  const [cmpQuestions, setCmpQuestions] = useState('');
  const [cmpCorrect, setCmpCorrect] = useState('');
  const [completing, setCompleting] = useState(false);

  // ── Pomodoro Timer State ────────────────────────────────────────────────
  const [timerBloco, setTimerBloco] = useState<BlocoAgenda | null>(null);

  const openTimer = (bloco: BlocoAgenda) => {
    setTimerBloco(bloco);
  };


  const handleGenerateSchedule = async () => {
    if (!wizDataProva) { setWizError('Informe a data do concurso.'); return; }
    setWizError('');
    setWizStep('generating');

    const startDate = format(weekStart, 'yyyy-MM-dd');
    const examDate  = new Date(wizDataProva + 'T12:00:00');
    const today     = new Date(startDate + 'T12:00:00');
    const diffDays  = Math.max(Math.floor((examDate.getTime() - today.getTime()) / 86400000), 1);
    const blocosPerDia = Math.floor(wizHoras / (50 / 60));
    const totalBlocos  = diffDays * blocosPerDia; // passed for info; Gemini caps at 120
    setWizTotalDias(diffDays);

    const curriculum = await generateFullCurriculum({
      disciplinas: disciplinas.map(d => d.nome_disciplina),
      horasPorDia: wizHoras,
      dataProva: wizDataProva,
      dataInicio: startDate,
      dificuldades: wizDific,
      cargo: wizCargo,
      totalBlocos,
    });

    if (!curriculum) {
      setWizError('Erro ao gerar currículo. Tente novamente.');
      setWizStep('config');
      return;
    }
    setWizTemplate(curriculum);
    // Build preview of week 1
    setWizSchedule(sessionsToPreviewSchedule(curriculum.sessoes, startDate, blocosPerDia));
    setWizStep('preview');
  };

  const handlePopulateSchedule = async () => {
    if (!wizSchedule || !wizTemplate) return;
    setWizStep('saving');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setWizStep('preview'); return; }

    // Fuzzy disc name → id
    const findDiscId = (nome: string): string | null => {
      const key = nome.toLowerCase();
      const exact = disciplinas.find(d => d.nome_disciplina.toLowerCase() === key);
      if (exact) return exact.id;
      const fuzzy = disciplinas.find(d =>
        d.nome_disciplina.toLowerCase().includes(key) || key.includes(d.nome_disciplina.toLowerCase())
      );
      return fuzzy?.id ?? null;
    };

    const toTime = (startMins: number) => {
      const h = Math.floor(startMins / 60) % 24;
      const m = startMins % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };

    const blocosPerDia = Math.floor(wizHoras / (50 / 60));
    const examDate   = new Date(wizDataProva + 'T12:00:00');
    const startDate  = format(weekStart, 'yyyy-MM-dd');
    const inserts: any[] = [];

    // Walk through every study day from start to exam
    let sessionIdx = 0;
    let cursor = new Date(startDate + 'T12:00:00');

    while (cursor <= examDate) {
      const dateStr = format(cursor, 'yyyy-MM-dd');
      // Cycle through sessions if period is longer than what Gemini generated
      const totalSessions = wizTemplate.sessoes.length;
      const daySessions = Array.from({ length: blocosPerDia }, (_, i) => {
        const idx = (sessionIdx + i) % totalSessions;
        return wizTemplate.sessoes[idx];
      });
      sessionIdx += blocosPerDia;

      daySessions.forEach((sessao, i) => {
        const discId = findDiscId(sessao.nome_disciplina);
        if (!discId) return;
        const startMins = 8 * 60 + i * 60;
        inserts.push({
          user_id: userData.user!.id,
          disciplina_id: discId,
          data: dateStr,
          hora_inicio: toTime(startMins),
          hora_fim: toTime(startMins + 50),
          titulo_override: sessao.titulo,
          ordem: i,
        });
      });

      cursor = addDays(cursor, 1);
    }

    // Insert in batches of 200
    for (let i = 0; i < inserts.length; i += 200) {
      await supabase.from('cronograma_dia').insert(inserts.slice(i, i + 200));
    }

    setWizStep('done');
    fetchAll();
  };

  // ── Clear all schedule ────────────────────────────────────────────────────
  const handleClearSchedule = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase.from('cronograma_dia').delete().eq('user_id', userData.user.id);
    setBlocos([]);
    setClearOpen(false);
  };

  // ── Open completion dialog ─────────────────────────────────────────────────
  const openCompletionDialog = async (bloco: BlocoAgenda) => {
    setCompletionBloco(bloco);
    setSelectedTask(null);
    setCmpQuestions('');
    setCmpCorrect('');
    setCmpDate(new Date().toISOString().split('T')[0]);
    setTasksLoading(true);
    const { data } = await supabase
      .from('tarefas_ciclo')
      .select('*')
      .eq('disciplina_id', bloco.disciplina_id)
      .neq('status', 'Concluído')
      .order('trilha_numero', { ascending: true });
    setPendingTasks(data ?? []);
    setTasksLoading(false);
  };

  const handleCompleteTask = async () => {
    if (!selectedTask || !cmpQuestions || !cmpCorrect || !cmpDate) return;
    setCompleting(true);
    
    await supabase
      .from('tarefas_ciclo')
      .update({
        status: 'Concluído',
        data_execucao: cmpDate,
        tot_questoes_feitas: Number(cmpQuestions),
        tot_acertos: Number(cmpCorrect),
      })
      .eq('id', selectedTask.id);

    // Schedule automatic review based on performance
    await scheduleReviewTask({
      userId: selectedTask.user_id,
      disciplinaId: selectedTask.disciplina_id,
      tituloTarefa: selectedTask.titulo_tarefa,
      totQuestoes: Number(cmpQuestions),
      totAcertos: Number(cmpCorrect),
      dataExecucao: cmpDate
    });

    setPendingTasks(prev => prev.filter(t => t.id !== selectedTask.id));
    
    // Notify MicroCiclo (or any listener) that a task was completed
    window.dispatchEvent(new CustomEvent('taskCompleted', { detail: { taskId: selectedTask.id } }));
    
    // Reload calendar if the scheduled day is within the current week
    fetchAll();

    setSelectedTask(null);
    setCmpQuestions('');
    setCmpCorrect('');
    setCompleting(false);
  };


  const closeCompletion = () => {
    setCompletionBloco(null);
    setPendingTasks([]);
    setSelectedTask(null);
    setCmpQuestions('');
    setCmpCorrect('');
  };

  const closeWizard = () => {
    setWizStep('idle');
    setWizTemplate(null);
    setWizSchedule(null);
    setWizTotalDias(0);
    setWizError('');
  };

  const disciplinaColorMap: Record<string, number> = {};
  disciplinas.forEach((d, i) => { disciplinaColorMap[d.id] = i; });

  const blocosForDay = (date: Date) =>
    blocos
      .filter(b => b.data === format(date, 'yyyy-MM-dd'))
      .sort((a, b) => a.ordem !== b.ordem ? a.ordem - b.ordem : a.hora_inicio.localeCompare(b.hora_inicio));

  // ─── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => { fetchAll(); }, [weekStart]);

  const fetchAll = async () => {
    setLoading(true);
    const from = format(weekDays[0], 'yyyy-MM-dd');
    const to   = format(weekDays[6], 'yyyy-MM-dd');

    const [{ data: discData }, { data: blocoData }] = await Promise.all([
      supabase.from('disciplinas_evolucao').select('id, nome_disciplina').order('nome_disciplina'),
      supabase
        .from('cronograma_dia')
        .select('*, disciplinas_evolucao(nome_disciplina)')
        .gte('data', from)
        .lte('data', to)
        .order('ordem', { ascending: true }),
    ]);

    if (discData) {
      setDisciplinas(discData);
      if (discData.length > 0) setFormDisc(discData[0].id);
    }
    if (blocoData) {
      setBlocos(blocoData.map((b: any) => ({
        ...b,
        nome_disciplina: b.disciplinas_evolucao?.nome_disciplina,
      })));
    }
    setLoading(false);
  };

  // ─── CRUD ───────────────────────────────────────────────────────────────
  const openAddModal = (date: Date) => {
    setEditTarget(null);
    const dayStr = format(date, 'yyyy-MM-dd');
    const { start, end } = nextSlot(blocos.filter(b => b.data === dayStr));
    setFormDate(dayStr);
    setFormDisc(disciplinas[0]?.id ?? '');
    setFormTitulo('');
    setFormInicio(start);
    setFormFim(end);
    setModalOpen(true);
  };

  const openEditModal = (bloco: BlocoAgenda) => {
    setEditTarget(bloco);
    setFormDate(bloco.data);
    setFormDisc(bloco.disciplina_id);
    setFormTitulo(bloco.titulo_override ?? '');
    setFormInicio(bloco.hora_inicio.slice(0, 5));
    setFormFim(bloco.hora_fim.slice(0, 5));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formDisc || !formDate) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setSaving(false); return; }

    const payload = {
      user_id: userData.user.id,
      disciplina_id: formDisc,
      data: formDate,
      hora_inicio: formInicio,
      hora_fim: formFim,
      titulo_override: formTitulo.trim() || null,
      ordem: editTarget?.ordem ?? blocos.filter(b => b.data === formDate).length,
    };

    if (editTarget) {
      await supabase.from('cronograma_dia').update(payload).eq('id', editTarget.id);
    } else {
      await supabase.from('cronograma_dia').insert(payload);
    }

    setModalOpen(false);
    setSaving(false);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('cronograma_dia').delete().eq('id', id);
    setBlocos(prev => prev.filter(b => b.id !== id));
  };

  // ─── Discipline drop → create block ────────────────────────────────────
  const createBlockFromDiscipline = async (disc: Disciplina, targetDay: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const dayBlocos = blocos.filter(b => b.data === targetDay);
    const { start, end } = nextSlot(dayBlocos);

    const payload = {
      user_id: userData.user.id,
      disciplina_id: disc.id,
      data: targetDay,
      hora_inicio: start,
      hora_fim: end,
      titulo_override: null,
      ordem: dayBlocos.length,
    };

    const { data: inserted } = await supabase
      .from('cronograma_dia')
      .insert(payload)
      .select('*, disciplinas_evolucao(nome_disciplina)')
      .single();

    if (inserted) {
      setBlocos(prev => [...prev, {
        ...inserted,
        nome_disciplina: inserted.disciplinas_evolucao?.nome_disciplina,
      }]);
    }
  };

  // ─── DnD handlers ───────────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const { data } = event.active;
    if (data.current?.type === 'discipline') {
      setActiveType('discipline');
      setActiveDisc(data.current.disciplina);
    } else {
      setActiveType('block');
      const bloco = blocos.find(b => b.id === event.active.id);
      setActiveBloco(bloco ?? null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type === 'discipline') return;

    // Block-to-block cross-day move
    const activeBloc = blocos.find(b => b.id === active.id);
    if (!activeBloc) return;

    const overId = String(over.id);
    const overBloc = blocos.find(b => b.id === overId);
    const targetDate = overBloc ? overBloc.data : overId.startsWith('drop-') ? overId.replace('drop-', '') : activeBloc.data;

    if (targetDate !== activeBloc.data) {
      setBlocos(prev => prev.map(b => b.id === activeBloc.id ? { ...b, data: targetDate } : b));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveType(null);
    setActiveBloco(null);
    setActiveDisc(null);

    if (!over) return;

    // ── Case 1: dropped a discipline chip ──────────────────────────────
    if (active.data.current?.type === 'discipline') {
      const disc: Disciplina = active.data.current.disciplina;
      const overId = String(over.id);

      let targetDay: string | null = null;
      if (overId.startsWith('drop-')) {
        targetDay = overId.replace('drop-', '');
      } else {
        const overBloc = blocos.find(b => b.id === overId);
        if (overBloc) targetDay = overBloc.data;
      }

      if (targetDay) await createBlockFromDiscipline(disc, targetDay);
      return;
    }

    // ── Case 2: reordering/moving an existing block ────────────────────
    const activeBloc = blocos.find(b => b.id === active.id);
    if (!activeBloc) return;

    const dayBlocos = blocos
      .filter(b => b.data === activeBloc.data)
      .sort((a, b) => a.ordem - b.ordem);

    const oldIndex = dayBlocos.findIndex(b => b.id === active.id);
    const newIndex = dayBlocos.findIndex(b => b.id === over.id);

    let reordered = dayBlocos;
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      reordered = arrayMove(dayBlocos, oldIndex, newIndex);
    }

    const withOrders = reordered.map((b, i) => ({ ...b, ordem: i }));
    setBlocos(prev => [
      ...prev.filter(b => b.data !== activeBloc.data),
      ...withOrders,
    ]);

    for (const b of withOrders) {
      await supabase.from('cronograma_dia').update({ data: b.data, ordem: b.ordem }).eq('id', b.id);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 md:space-y-6 pb-20">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-textMain">Cronograma</h2>
          <p className="text-textMuted text-xs md:text-sm">
            {format(weekDays[0], "d 'de' MMM", { locale: ptBR })} –{' '}
            {format(weekDays[6], "d 'de' MMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 md:flex-none gap-1.5 text-xs"
            onClick={() => setWizStep('config')}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="md:inline">Gerar IA</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 md:flex-none gap-1.5 text-red-500 text-xs"
            onClick={() => setClearOpen(true)}
          >
            <Trash className="w-3.5 h-3.5" />
            <span className="md:inline">Limpar</span>
          </Button>
          <div className="flex items-center gap-1 w-full md:w-auto justify-between md:justify-start">
            <Button variant="outline" size="sm" className="px-3" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoje</Button>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setWeekStart(d => addDays(d, -7))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setWeekStart(d => addDays(d, 7))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-textMuted text-sm py-10">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* ── Discipline chips (draggable source) ── */}
          <div className="flex flex-wrap gap-2 p-3 bg-surface rounded-xl border border-borderSubtle">
            <span className="text-[11px] font-semibold text-textMuted self-center mr-1 whitespace-nowrap">
              Arraste para o dia →
            </span>
            {disciplinas.map((d, i) => (
              <DisciplineChip key={d.id} disc={d} colorIdx={i} />
            ))}
          </div>

          {/* ── Week grid ── */}
          <div className="flex overflow-x-auto md:grid md:grid-cols-7 gap-3 pb-4 md:pb-0 snap-x snap-mandatory hide-scrollbar group/grid">
            {weekDays.map(day => (
              <DayColumn
                key={format(day, 'yyyy-MM-dd')}
                date={day}
                blocos={blocosForDay(day)}
                disciplinaColorMap={disciplinaColorMap}
                onAdd={openAddModal}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onComplete={openCompletionDialog}
                onStartTimer={openTimer}
              />
            ))}
          </div>

          {/* ── Drag overlays ── */}
          <DragOverlay dropAnimation={{ duration: 120, easing: 'ease' }}>
            {activeType === 'discipline' && activeDisc && (() => {
              const idx = disciplinas.findIndex(d => d.id === activeDisc.id);
              const color = DISC_COLORS[idx % DISC_COLORS.length];
              const acronym = makeAcronym(activeDisc.nome_disciplina);
              return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold shadow-xl rotate-2 cursor-grabbing
                  ${color.bg} ${color.text} border ${color.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {acronym}
                </span>
              );
            })()}

            {activeType === 'block' && activeBloco && (() => {
              const cIdx = disciplinaColorMap[activeBloco.disciplina_id] ?? 0;
              const color = DISC_COLORS[cIdx % DISC_COLORS.length];
              const label = activeBloco.titulo_override || activeBloco.nome_disciplina || '';
              const acronym = makeAcronym(label);
              return (
                <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 shadow-lg rotate-1 cursor-grabbing ${color.bg} ${color.border}`}>
                  <span className={`block w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                  <div>
                    <p className={`text-[11px] font-bold leading-none ${color.text}`}>{acronym}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{activeBloco.hora_inicio.slice(0,5)}–{activeBloco.hora_fim.slice(0,5)}</p>
                  </div>
                </div>
              );
            })()}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Completion (Concluído) Dialog ── */}
      <Dialog open={!!completionBloco} onOpenChange={open => !open && closeCompletion()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Registar Conclusão
            </DialogTitle>
          </DialogHeader>

          {completionBloco && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-textMuted">
                Disciplina: <strong>{completionBloco.nome_disciplina ?? ''}</strong>
              </p>

              {/* Task list */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">
                  Tarefa concluída
                  {!tasksLoading && <span className="text-textMuted font-normal ml-1">({pendingTasks.length} pendente{pendingTasks.length !== 1 ? 's' : ''})</span>}
                </label>
                {tasksLoading ? (
                  <div className="flex items-center gap-2 text-xs text-textMuted py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> A carregar tarefas...
                  </div>
                ) : pendingTasks.length === 0 ? (
                  <p className="text-xs text-textMuted py-2">Nenhuma tarefa pendente nesta disciplina.</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-borderSubtle divide-y divide-borderSubtle">
                    {pendingTasks.map((task, idx) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface/60 transition-colors
                          ${selectedTask?.id === task.id ? 'bg-emerald-50 border-l-2 border-emerald-400' : ''}`}
                      >
                        <span className="shrink-0 w-5 h-5 rounded-full bg-surface border border-borderSubtle flex items-center justify-center text-[10px] font-semibold text-textMuted mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-textMuted">{task.trilha_numero}</p>
                          <p className="text-sm font-medium text-textMain leading-snug">{task.titulo_tarefa}</p>
                        </div>
                        {selectedTask?.id === task.id && (
                          <CheckCircle2 className="shrink-0 w-4 h-4 text-emerald-500 ml-auto mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date + score */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">Data da conclusão</label>
                <Input type="date" value={cmpDate} onChange={e => setCmpDate(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-textMain">Questões feitas</label>
                  <Input type="number" min="0" placeholder="Ex: 20" value={cmpQuestions} onChange={e => setCmpQuestions(e.target.value)} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-textMain">Acertos</label>
                  <Input type="number" min="0" placeholder="Ex: 17" value={cmpCorrect} onChange={e => setCmpCorrect(e.target.value)} />
                </div>
              </div>
              {cmpQuestions && cmpCorrect && Number(cmpQuestions) > 0 && (
                <div className="text-sm flex items-center gap-2">
                  <span className="text-textMuted">Desempenho:</span>
                  {(() => {
                    const pct = (Number(cmpCorrect) / Number(cmpQuestions)) * 100;
                    return (
                      <>
                        <span className={`font-bold text-base ${pct >= 80 ? 'text-emerald-600' : pct < 70 ? 'text-red-500' : 'text-amber-600'}`}>
                          {pct.toFixed(1)}%
                        </span>
                        {pct < 70 && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">Revisão Necessária</span>}
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeCompletion}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  onClick={handleCompleteTask}
                  disabled={completing || !selectedTask || !cmpQuestions || !cmpCorrect}
                >
                  {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Conclusão
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Modal ── */}
      <Dialog open={modalOpen} onOpenChange={o => !o && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Bloco' : 'Novo Bloco de Estudo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textMain">Data</label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textMain">Disciplina</label>
              <select
                className="w-full h-10 border border-borderSubtle rounded-md px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                value={formDisc}
                onChange={e => setFormDisc(e.target.value)}
              >
                {disciplinas.map(d => <option key={d.id} value={d.id}>{d.nome_disciplina}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-textMain">
                Título personalizado <span className="text-textMuted font-normal">(opcional)</span>
              </label>
              <Input
                placeholder="Ex: Revisão de pontos fracos"
                value={formTitulo}
                onChange={e => setFormTitulo(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-textMain">Início</label>
                <Input type="time" value={formInicio} onChange={e => setFormInicio(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-textMain">Fim</label>
                <Input type="time" value={formFim} onChange={e => setFormFim(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !formDisc}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              {editTarget ? 'Guardar' : 'Adicionar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI Schedule Wizard ── */}
      <Dialog open={wizStep !== 'idle'} onOpenChange={open => !open && closeWizard()}>
        <DialogContent className={wizStep === 'preview' ? 'max-w-2xl' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {wizStep === 'config' && 'Gerar Cronograma com IA'}
              {wizStep === 'generating' && 'Analisando seu perfil...'}
              {wizStep === 'preview' && 'Cronograma Sugerido pela IA'}
              {wizStep === 'saving' && 'Populando calendário...'}
              {wizStep === 'done' && 'Pronto!'}
            </DialogTitle>
          </DialogHeader>

          {wizStep === 'config' && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">Cargo / Concurso</label>
                <Input value={wizCargo} onChange={e => setWizCargo(e.target.value)} placeholder="Ex: Auditor-Fiscal TI (FCC)" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">Data do Concurso</label>
                <Input type="date" value={wizDataProva} onChange={e => setWizDataProva(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">Horas disponíveis por dia</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="1" max="12" step="0.5" value={wizHoras}
                    onChange={e => setWizHoras(Number(e.target.value))} className="flex-1 accent-black" />
                  <span className="text-sm font-bold w-12 text-center">{wizHoras}h</span>
                </div>
                <p className="text-xs text-textMuted">≈ {Math.floor(wizHoras / (50/60))} blocos de 50 min por dia</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-textMain">Maiores dificuldades (opcional)</label>
                <Input value={wizDific} onChange={e => setWizDific(e.target.value)} placeholder="Ex: Infraestrutura de TIC" />
              </div>
              <div className="text-xs text-textMuted bg-surface rounded-lg p-3 space-y-1">
                <p className="font-semibold">Período que será populado:</p>
                <p>{format(weekStart, "d 'de' MMMM 'de' yyyy", { locale: ptBR })} → {wizDataProva ? format(new Date(wizDataProva + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '...'}</p>
                {wizDataProva && (() => {
                  const dias = Math.max(Math.floor((new Date(wizDataProva + 'T12:00:00').getTime() - new Date(format(weekStart,'yyyy-MM-dd') + 'T12:00:00').getTime()) / 86400000), 0);
                  const bpd = Math.floor(wizHoras / (50/60));
                  const total = dias * bpd;
                  return <p className="text-[10px]">≈ {dias} dias · {total} blocos totais · IA gera até 120 sessões únicas, repetidas em ciclos com revisão espaçada</p>;
                })()}
              </div>
              {wizError && <p className="text-xs text-red-500">{wizError}</p>}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeWizard}>Cancelar</Button>
                <Button className="flex-1 gap-1.5" onClick={handleGenerateSchedule} disabled={!wizDataProva}>
                  <Sparkles className="w-3.5 h-3.5" /> Gerar Cronograma
                </Button>
              </div>
            </div>
          )}

          {wizStep === 'generating' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-textMuted" />
              <p className="font-medium text-textMain">O Coach IA está montando sua semana ideal...</p>
              <p className="text-sm text-textMuted">Isso pode levar alguns segundos</p>
            </div>
          )}

          {wizStep === 'preview' && wizSchedule && (
            <div className="space-y-4 py-2">
              {wizTemplate && (
                <div className="text-xs bg-surface rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-textMain">Estratégia da IA:</p>
                  <p className="text-textMuted">{wizTemplate.estrategia}</p>
                  <p className="text-textMuted">Exibindo a 1ª semana do plano · {wizTotalDias} dias até a prova · {wizTemplate.sessoes.length} sessões únicas geradas</p>
                </div>
              )}
              <p className="text-sm text-textMuted">Revise a 1ª semana do plano. Clique em <strong>Confirmar e Popular</strong> para inserir todo o período no calendário.</p>
              <div className="grid grid-cols-7 gap-1.5 max-h-[52vh] overflow-y-auto">
                {wizSchedule.cronograma.map(dia => {
                  const dayDate = new Date(dia.data + 'T12:00:00');
                  return (
                    <div key={dia.data} className="space-y-1">
                      <div className="text-center pb-1 border-b border-borderSubtle">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-textMuted">
                          {format(dayDate, 'EEE', { locale: ptBR })}
                        </p>
                        <p className="text-base font-bold text-textMain">{format(dayDate, 'd')}</p>
                      </div>
                      {dia.blocos.map((bloco, i) => {
                        const discIdx = disciplinas.findIndex(d =>
                          d.nome_disciplina.toLowerCase() === bloco.nome_disciplina.toLowerCase() ||
                          bloco.nome_disciplina.toLowerCase().includes(d.nome_disciplina.toLowerCase()) ||
                          d.nome_disciplina.toLowerCase().includes(bloco.nome_disciplina.toLowerCase())
                        );
                        const color = DISC_COLORS[(discIdx >= 0 ? discIdx : i) % DISC_COLORS.length];
                        return (
                          <div key={i} title={`${bloco.nome_disciplina}: ${bloco.titulo}`}
                            className={`rounded px-1.5 py-1 border ${color.border} ${color.bg}`}>
                            <p className={`text-[10px] font-bold leading-none ${color.text}`}>
                              {makeAcronym(bloco.nome_disciplina)}
                            </p>
                            <p className="text-[8px] text-gray-400 mt-0.5 leading-none">
                              {bloco.hora_inicio}–{bloco.hora_fim}
                            </p>
                            <p className={`text-[8px] leading-tight mt-0.5 ${color.text} opacity-70 line-clamp-2`}>
                              {bloco.titulo}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setWizStep('config')}>Regenerar</Button>
                <Button className="flex-1 gap-1.5" onClick={handlePopulateSchedule}>
                  <Check className="w-4 h-4" /> Confirmar e Popular
                </Button>
              </div>
            </div>
          )}

          {wizStep === 'saving' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-textMuted" />
              <p className="font-medium text-textMain">A inserir blocos no calendário...</p>
            </div>
          )}

          {wizStep === 'done' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="font-semibold text-textMain">Cronograma populado com sucesso!</p>
              <p className="text-sm text-textMuted">Pode ajustar arrastando e editando no calendário.</p>
              <Button className="px-8" onClick={closeWizard}>Ver Cronograma</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Clear Confirmation Dialog ── */}
      <Dialog open={clearOpen} onOpenChange={o => !o && setClearOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash className="w-4 h-4" /> Limpar todo o cronograma?
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-textMain">
              Todos os blocos em <strong>todas as semanas</strong> serão apagados permanentemente.
            </p>
            <p className="text-xs text-textMuted">Esta ação não pode ser desfeita.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setClearOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600 text-white gap-1.5"
              onClick={handleClearSchedule}
            >
              <Trash className="w-3.5 h-3.5" /> Limpar tudo
            </Button>
          </div>
        </DialogContent>
    </Dialog>

      {/* ── Pomodoro Timer Dialog ── */}
      <PomodoroTimerDialog
        isOpen={!!timerBloco}
        title={timerBloco?.titulo_override || timerBloco?.nome_disciplina || ''}
        subtitle={timerBloco?.nome_disciplina || ''}
        disciplinaId={timerBloco?.disciplina_id || ''}
        onClose={() => setTimerBloco(null)}
        onFinish={() => {
          if (timerBloco) {
            openCompletionDialog(timerBloco);
            setTimerBloco(null);
          }
        }}
      />
    </div>
  );
}
