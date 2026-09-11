import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, ChevronDown, Volume2, VolumeX, Clock, Repeat, Brain, Sparkles } from 'lucide-react';
import type { PlaybackState } from '../services/audioPlaybackService';

interface PlaybackWidgetProps {
  playbackState: PlaybackState;
  onTogglePlay: () => void;
  onRewind: () => void;
  onBpmChange: (bpm: number) => void;
  onVolumeChange: (vol: number) => void;
  countInEnabled: boolean;
  onToggleCountIn: (enabled: boolean) => void;
  onToggleLoop?: () => void;
  loopPauseSeconds?: number;
  onLoopPauseSecondsChange?: (seconds: number) => void;
}

export const PlaybackWidget: React.FC<PlaybackWidgetProps> = ({
  playbackState,
  onTogglePlay,
  onRewind,
  onBpmChange,
  onVolumeChange,
  countInEnabled,
  onToggleCountIn,
  onToggleLoop,
  loopPauseSeconds,
  onLoopPauseSecondsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevVolumeRef = useRef<number>(playbackState.volume || 80);

  const effectiveLoopPauseSec = loopPauseSeconds !== undefined ? loopPauseSeconds : (playbackState.loopPauseSeconds ?? 0);
  const lastNonZeroPauseRef = useRef<number>(effectiveLoopPauseSec > 0 ? effectiveLoopPauseSec : 8);

  useEffect(() => {
    if (effectiveLoopPauseSec > 0) {
      lastNonZeroPauseRef.current = effectiveLoopPauseSec;
    }
  }, [effectiveLoopPauseSec]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleBpmStep = (delta: number) => {
    const nextBpm = Math.max(30, Math.min(240, playbackState.bpm + delta));
    onBpmChange(nextBpm);
  };

  const handleMuteToggle = () => {
    if (playbackState.volume > 0) {
      prevVolumeRef.current = playbackState.volume;
      onVolumeChange(0);
    } else {
      onVolumeChange(prevVolumeRef.current || 80);
    }
  };

  const isLoopActive = playbackState.loopEnabled;

  return (
    <div className="relative inline-flex items-center gap-1 bg-[#1a1a24] border border-[#2e2e3e] rounded-xl px-1.5 py-1 shadow-md select-none" ref={popoverRef}>
      {/* Rewind Button: In loop mode -> go to IN point; in normal mode -> go to beginning */}
      <button
        onClick={onRewind}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all focus:outline-none"
        title={
          playbackState.loopRange
            ? `Go to In Point (m. ${playbackState.loopRange.startMeasure || '1'}) (R)`
            : 'Go to Beginning (R)'
        }
        aria-label="Rewind"
      >
        <SkipBack className="w-4 h-4 fill-current" />
      </button>

      {/* Play / Pause Toggle Button */}
      <button
        onClick={onTogglePlay}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 active:bg-white/20 transition-all focus:outline-none"
        title={playbackState.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        aria-label={playbackState.isPlaying ? 'Pause' : 'Play'}
      >
        {playbackState.isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Loop Mode Toggle Button */}
      <button
        onClick={onToggleLoop}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all focus:outline-none ${
          playbackState.loopPauseActive
            ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse'
            : isLoopActive
            ? 'bg-orange-500/25 text-orange-400 border border-orange-500/50 shadow-sm'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
        }`}
        title={
          playbackState.loopPauseActive
            ? `Resting between loops: ${playbackState.loopPauseRemaining ?? 0}s remaining (L to toggle)`
            : isLoopActive
            ? `Loop Mode: ON (${playbackState.loopRange ? `m.${playbackState.loopRange.startMeasure}–${playbackState.loopRange.endMeasure}` : 'Active'}) — Click to toggle (L)`
            : 'Enable Loop Mode (L)'
        }
        aria-label="Toggle Loop Mode"
      >
        {playbackState.loopPauseActive ? (
          <span className="font-mono font-bold text-xs tabular-nums text-amber-300">
            {playbackState.loopPauseRemaining ?? 0}
          </span>
        ) : (
          <Repeat className="w-4 h-4" />
        )}
      </button>

      {/* BPM & Settings Popover Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold transition-all focus:outline-none ${
          isOpen
            ? 'bg-white/15 text-white'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
        title="Tempo & Playback Settings"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-serif leading-none font-bold text-slate-300">♩</span>
        <span className="tabular-nums font-mono text-xs">{playbackState.bpm}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <>
          {/* Backdrop to absorb outside clicks and prevent page-down / score clicks */}
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 sm:w-80 bg-[#16161d] border border-[#2f2f3d] rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
            style={{ color: 'var(--md-on-surface, #e2e8f0)' }}
          >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <span className="text-xs font-semibold tracking-wide uppercase text-slate-400 flex items-center gap-1.5">
              Tempo & Audio Settings
            </span>
            <span className="text-xs font-mono font-bold text-orange-300">
              {playbackState.bpm} BPM
            </span>
          </div>

          {/* Tempo Controls */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
              <span>Tempo</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBpmStep(-5)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 active:bg-white/20 text-slate-200 font-bold flex items-center justify-center transition-colors text-sm"
                title="−5 BPM"
              >
                −
              </button>
              <input
                type="range"
                min="30"
                max="240"
                value={playbackState.bpm}
                onChange={(e) => onBpmChange(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <button
                onClick={() => handleBpmStep(5)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 active:bg-white/20 text-slate-200 font-bold flex items-center justify-center transition-colors text-sm"
                title="+5 BPM"
              >
                +
              </button>
            </div>

            {/* Quick Speed Multipliers */}
            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
              {[0.5, 0.75, 1.0, 1.25].map(multiplier => {
                const calculatedBpm = Math.round(playbackState.bpm * multiplier);
                return (
                  <button
                    key={multiplier}
                    onClick={() => onBpmChange(calculatedBpm)}
                    className="py-1 px-1.5 text-[10px] font-medium rounded-md bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-center"
                  >
                    {multiplier}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volume Control */}
          <div className="mb-4 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
              <span className="flex items-center gap-1">
                {playbackState.volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-slate-400" />}
                Volume
              </span>
              <span className="text-xs text-slate-400 font-mono">{playbackState.volume}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMuteToggle}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 flex items-center justify-center"
                title={playbackState.volume === 0 ? 'Unmute' : 'Mute'}
              >
                {playbackState.volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={playbackState.volume}
                onChange={(e) => onVolumeChange(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>

          {/* Count-In Toggle */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <label htmlFor="countInToggle" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>1-Bar Count-In Metronome</span>
            </label>
            <input
              id="countInToggle"
              type="checkbox"
              checked={countInEnabled}
              onChange={(e) => onToggleCountIn(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 text-orange-600 focus:ring-orange-500 bg-slate-700 cursor-pointer accent-orange-500"
            />
          </div>

          {/* Pause Before Next Loop (Loop Mode) */}
          <div className="pt-3 mt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label htmlFor="loopPauseToggle" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span>Pause Between Loops</span>
              </label>
              <input
                id="loopPauseToggle"
                type="checkbox"
                checked={effectiveLoopPauseSec > 0}
                onChange={(e) => {
                  const nextVal = e.target.checked ? (lastNonZeroPauseRef.current || 8) : 0;
                  onLoopPauseSecondsChange?.(nextVal);
                }}
                className="w-4 h-4 rounded border-slate-600 text-orange-600 focus:ring-orange-500 bg-slate-700 cursor-pointer accent-orange-500"
              />
            </div>

            {effectiveLoopPauseSec > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-[11px] text-slate-400">Pause duration</span>
                  <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                    {effectiveLoopPauseSec}s
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="1"
                    value={effectiveLoopPauseSec}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      lastNonZeroPauseRef.current = val;
                      onLoopPauseSecondsChange?.(val);
                    }}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                {/* Presets */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {[
                    { sec: 5, label: '5s', tag: 'Fast' },
                    { sec: 8, label: '8s', tag: 'Optimal', recommended: true },
                    { sec: 10, label: '10s', tag: 'Deep' },
                  ].map(({ sec, label, tag, recommended }) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        lastNonZeroPauseRef.current = sec;
                        onLoopPauseSecondsChange?.(sec);
                      }}
                      className={`py-1.5 px-1 rounded-lg font-medium transition-all flex flex-col items-center gap-0.5 ${
                        effectiveLoopPauseSec === sec
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50 shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <span className="font-bold text-xs">{label}</span>
                      <span className={`text-[8px] uppercase tracking-wider ${recommended ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                        {tag}{recommended ? ' ★' : ''}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Optimal Brain Performance Callout */}
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] leading-relaxed text-amber-200/90 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-200">Optimal Brain Performance (5–10s): </span>
                    Cognitive neuroscience shows a 5–10s micro-rest between practice reps triggers fast-forward neural replay in the hippocampus and motor cortex—cementing muscle memory while releasing physical tension.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )}
  </div>
  );
};

export default PlaybackWidget;
