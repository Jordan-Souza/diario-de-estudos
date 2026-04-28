/**
 * AmbientPlayer — player de fundo reutilizável (ruído branco/marrom/rádio)
 * usado no Pomodoro, no Quiz Flash e em qualquer tela de foco.
 */
import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const AMBIENT_SOUNDS = [
  { label: 'Silêncio', url: '' },
  { label: 'Ruído Marrom (Foco Suave)', url: 'brown' },
  { label: 'Ruído Branco (Chuva Leve)', url: 'white' },
  { label: 'Rádio Clássica', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { label: 'Rádio Lofi Study', url: 'https://ice1.somafm.com/defcon-128-mp3' },
];

interface AmbientPlayerProps {
  playing: boolean;      // externally controlled — play when quiz/timer is active
  /** extra CSS class for the wrapper */
  className?: string;
  /** dark skin (for Pomodoro dark bg) vs light skin (default) */
  dark?: boolean;
}

export function AmbientPlayer({ playing, className = '', dark = false }: AmbientPlayerProps) {
  const [soundUrl, setSoundUrl] = useState('');
  const [volume, setVolume] = useState(0.5);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume * 0.6;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
  }, [volume]);

  // Main audio engine
  useEffect(() => {
    // Tear down previous
    sourceRef.current?.stop();
    ctxRef.current?.close();
    gainNodeRef.current = null;
    ctxRef.current = null;
    sourceRef.current = null;
    audioRef.current?.pause();

    if (!playing || !soundUrl) return;

    if (soundUrl === 'white' || soundUrl === 'brown') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      ctxRef.current = ctx;

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (soundUrl === 'white') {
          data[i] = white * 0.1;
        } else {
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 1.5;
        }
      }

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = soundUrl === 'brown' ? 400 : 1200;

      const gain = ctx.createGain();
      gain.gain.value = volume;
      gainNodeRef.current = gain;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      sourceRef.current = src;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } else {
      // Radio / streaming URL
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = volume * 0.6;
      if (audio.src !== soundUrl) audio.src = soundUrl;
      audio.play().catch(e => console.warn('AmbientPlayer play failed:', e));
    }

    return () => {
      sourceRef.current?.stop();
      ctxRef.current?.close();
      audioRef.current?.pause();
      gainNodeRef.current = null;
    };
  }, [playing, soundUrl]);

  const selectBase = dark
    ? 'bg-stone-900 border-stone-800 text-stone-400'
    : 'bg-white border-borderSubtle text-textMain';

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Sound selector */}
      <select
        className={`${selectBase} border text-xs rounded-full px-4 py-1.5 focus:outline-none focus:ring-1 cursor-pointer text-center w-full`}
        value={soundUrl}
        onChange={e => setSoundUrl(e.target.value)}
        title="Som de Fundo"
      >
        {AMBIENT_SOUNDS.map(s => (
          <option key={s.label} value={s.url}>{s.label}</option>
        ))}
      </select>

      {/* Volume slider */}
      {soundUrl && (
        <div className="flex items-center gap-2 w-full px-1">
          {volume === 0
            ? <VolumeX className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-stone-500' : 'text-textMuted'}`} />
            : <Volume2 className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-stone-500' : 'text-textMuted'}`} />
          }
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${dark ? 'bg-stone-800 accent-stone-500' : 'bg-borderSubtle accent-primary'}`}
            title="Volume"
          />
        </div>
      )}

      <audio ref={audioRef} loop />
    </div>
  );
}
