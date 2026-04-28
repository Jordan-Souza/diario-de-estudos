import { supabase } from './supabase';
import { addDays, format } from 'date-fns';

export async function scheduleReviewTask({
  userId,
  disciplinaId,
  tituloTarefa,
  totQuestoes,
  totAcertos,
  dataExecucao
}: {
  userId: string;
  disciplinaId: string;
  tituloTarefa: string;
  totQuestoes: number;
  totAcertos: number;
  dataExecucao: string; // YYYY-MM-DD
}) {
  const performance = totQuestoes > 0 ? (totAcertos / totQuestoes) * 100 : 0;
  
  let daysToAdd = 1;
  if (performance > 70) {
    daysToAdd = 25;
  } else if (performance >= 50) {
    daysToAdd = 7;
  } else {
    daysToAdd = 1;
  }

  // Parse original execution date (T12:00:00 to avoid timezone shift)
  const execDate = new Date(dataExecucao + 'T12:00:00');
  const targetDateObj = addDays(execDate, daysToAdd);
  const targetDateStr = format(targetDateObj, 'yyyy-MM-dd');

  // Query existing blocks on that date to find insertion point
  const { data: existingBlocks } = await supabase
    .from('cronograma_dia')
    .select('hora_fim, ordem')
    .eq('user_id', userId)
    .eq('data', targetDateStr)
    .order('ordem', { ascending: false });

  let startTimeStr = '08:00';
  let nextOrdem = 0;

  if (existingBlocks && existingBlocks.length > 0) {
    const lastBlock = existingBlocks[0]; // descending order means highest ordem comes first
    if (lastBlock.hora_fim) {
      startTimeStr = lastBlock.hora_fim.slice(0, 5); // ensures "HH:mm"
    }
    nextOrdem = (lastBlock.ordem || 0) + 1;
  }

  // Calculate End Time (+30 minutes)
  const [hoursStr, minutesStr] = startTimeStr.split(':');
  let hours = parseInt(hoursStr, 10);
  let minutes = parseInt(minutesStr, 10);
  minutes += 30;
  
  if (minutes >= 60) {
    hours += Math.floor(minutes / 60);
    minutes = minutes % 60;
  }
  
  // Cap at end of day to prevent weird formatting if they study late
  if (hours > 23) {
    hours = 23;
    minutes = 59;
  }
  
  const endTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  // Insert the revision block into the user's schedule
  await supabase.from('cronograma_dia').insert({
    user_id: userId,
    disciplina_id: disciplinaId,
    data: targetDateStr,
    hora_inicio: startTimeStr,
    hora_fim: endTimeStr,
    titulo_override: `Revisão: ${tituloTarefa}`,
    ordem: nextOrdem
  });
}
