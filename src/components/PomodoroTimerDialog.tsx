import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Play, Pause, Check, RotateCcw, Volume2 } from 'lucide-react';

interface PomodoroTimerDialogProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  disciplinaId: string;
  onClose: () => void;
  onFinish: () => void;
}

const AMBIENT_SOUNDS = [
  { label: 'Silêncio', url: '' },
  { label: 'Ruído Marrom (Foco Suave)', url: 'brown' },
  { label: 'Ruído Branco (Chuva Leve)', url: 'white' },
  { label: 'Rádio Clássica (Garantida)', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { label: 'Rádio Lofi Study', url: 'https://ice1.somafm.com/defcon-128-mp3' }
];

export function PomodoroTimerDialog({
  isOpen, title, subtitle, disciplinaId, onClose, onFinish
}: PomodoroTimerDialogProps) {
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerInitial, setTimerInitial] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [soundUrl, setSoundUrl] = useState<string>('');
  const [volume, setVolume] = useState<number>(0.5);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize when opened
  useEffect(() => {
    if (isOpen) {
      setTimerSeconds(25 * 60);
      setTimerInitial(25 * 60);
      setIsTimerRunning(false);
    }
  }, [isOpen]);

  // Main countdown
  useEffect(() => {
    let interval: any;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => setTimerSeconds(s => s - 1), 1000);
    } else if (isTimerRunning && timerSeconds === 0) {
      setIsTimerRunning(false);
      handleFinishTimer();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  // Sync volume seamlessly
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume * 0.6; // Radio offset
    if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
  }, [volume]);

  // Audio Engine
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let source: AudioBufferSourceNode | null = null;

    if (isTimerRunning && (soundUrl === 'white' || soundUrl === 'brown')) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          if (soundUrl === 'white') {
             data[i] = white * 0.1;
          } else {
             data[i] = (lastOut + (0.02 * white)) / 1.02;
             lastOut = data[i];
             data[i] *= 1.5;
          }
        }
        
        const filter = audioCtx.createBiquadFilter();
        if (soundUrl === 'brown') {
          filter.type = 'lowpass';
          filter.frequency.value = 400;
        } else {
          filter.type = 'lowpass';
          filter.frequency.value = 1200;
        }

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;
        gainNodeRef.current = gainNode;

        source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start();
      }
    } else if (audioRef.current) {
      if (isTimerRunning && soundUrl && soundUrl !== 'white' && soundUrl !== 'brown') {
        const audio = audioRef.current;
        audio.volume = volume * 0.6;
        if (audio.src !== soundUrl) audio.src = soundUrl;
        audio.play().catch(e => console.error('Play falhou:', e));
      } else {
        audioRef.current.pause();
      }
    }

    return () => {
      if (source) source.stop();
      if (audioCtx) audioCtx.close();
      gainNodeRef.current = null;
    };
  }, [isTimerRunning, soundUrl]);

  const handleFinishTimer = async () => {
    setIsTimerRunning(false);
    
    // Save analytics
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user && disciplinaId) {
      await supabase.from('sessoes_estudo').insert({
        user_id: userData.user.id,
        disciplina_id: disciplinaId,
        data: new Date().toISOString().split('T')[0],
        minutos_estudados: Math.floor(timerInitial / 60)
      });
    }
    
    // Cleanup and propagate
    onClose();
    onFinish();
  };

  const setPresetTime = (minutes: number) => {
    setTimerSeconds(minutes * 60);
    setTimerInitial(minutes * 60);
    setIsTimerRunning(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md bg-stone-950 border-stone-800 text-stone-100 sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center font-normal text-stone-400 text-sm tracking-widest uppercase">
            {title || 'FOMENTO DE FOCO'}
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-stone-500">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="py-8 flex flex-col items-center">
          <div className={`text-7xl font-light tracking-tighter tabular-nums mb-8 transition-colors duration-500 ${timerSeconds > 0 && timerSeconds <= 60 ? 'text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : ''}`}>
            {String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:
            {String(timerSeconds % 60).padStart(2, '0')}
          </div>

          <div className="flex gap-2 mb-8">
            {[5, 10, 15, 25, 50].map(m => (
              <button
                key={m}
                onClick={() => setPresetTime(m)}
                className="w-10 h-10 rounded-full bg-stone-900 border border-stone-800 hover:bg-stone-800 flex items-center justify-center text-xs font-medium text-stone-400 transition-colors"
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-center">
            <button
              onClick={() => setPresetTime(Math.floor(timerInitial / 60))}
              className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center text-stone-500 hover:text-stone-300 hover:bg-stone-900 transition-colors"
              title="Reset Timer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isTimerRunning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
            >
              {isTimerRunning ? (
                <Pause className="w-6 h-6 text-black fill-black" />
              ) : (
                <Play className="w-6 h-6 text-black fill-black ml-1" />
              )}
            </button>

            <button
              onClick={handleFinishTimer}
              className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center text-stone-500 hover:text-stone-300 hover:bg-stone-900 transition-colors"
              title="Finalizar agora"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 w-48">
            <select
              className="bg-stone-900 border border-stone-800 text-stone-400 text-xs rounded-full px-4 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-700 cursor-pointer text-center w-full"
              value={soundUrl}
              onChange={e => setSoundUrl(e.target.value)}
              title="Som de Fundo"
            >
              {AMBIENT_SOUNDS.map(s => (
                <option key={s.label} value={s.url}>{s.label}</option>
              ))}
            </select>

            {soundUrl && (
              <div className="flex items-center gap-2 w-full px-2">
                <Volume2 className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-stone-500"
                  title="Volume"
                />
              </div>
            )}
          </div>

          <audio ref={audioRef} src={soundUrl} loop />
        </div>
      </DialogContent>
    </Dialog>
  );
}
