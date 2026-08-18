/**
 * Web Audio Playback Service for MusicXML Scores
 * Features polyphonic synthesis, count-in metronome clicks, tempo scaling,
 * pause/resume tracking, and cursor event synchronization.
 */

export interface ScheduledNoteEvent {
  timeInBeats: number;
  durationInBeats: number;
  midi: number;
  frequency: number;
  voice?: number;
  measureIndex: number;
}

export interface LoopRange {
  startBeat: number;
  endBeat: number;
  startMeasure?: number;
  endMeasure?: number;
  startNoteX?: number;
  startNoteTopY?: number;
  startNotePageIndex?: number;
  endNoteX?: number;
  endNoteTopY?: number;
  endNotePageIndex?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  totalBeats: number;
  bpm: number;
  volume: number;
  countInActive: boolean;
  loopEnabled: boolean;
  loopRange: LoopRange | null;
}

type StateListener = (state: PlaybackState) => void;
type NoteListener = (note: ScheduledNoteEvent, currentBeat: number) => void;

class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private currentXml: string | null = null;
  private scheduledNotes: ScheduledNoteEvent[] = [];
  private totalBeats: number = 0;
  private beatsPerBar: number = 4;
  private beatType: number = 4;

  private isCurrentlyPlaying: boolean = false;
  private isCurrentlyPaused: boolean = false;
  private pausedTimeInBeats: number = 0;
  private startTime: number = 0;
  private activeBpm: number = 80;
  private playbackVolume: number = 0.8; // 0.0 - 1.0
  private enableCountIn: boolean = true;

  // A-B Loop State
  private loopEnabled: boolean = false;
  private loopRange: LoopRange | null = null;

  private activeNodes: AudioScheduledSourceNode[] = [];
  private masterGain: GainNode | null = null;
  private playbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private cursorInterval: ReturnType<typeof setInterval> | null = null;
  private loopPauseTimeout: ReturnType<typeof setTimeout> | null = null;

  private stateListeners: Set<StateListener> = new Set();
  private noteListeners: Set<NoteListener> = new Set();

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  private midiToFrequency(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private parsePitchToMidi(pitchEl: Element): number {
    const step = pitchEl.querySelector('step')?.textContent?.trim().toUpperCase() || 'C';
    const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);
    const alter = parseInt(pitchEl.querySelector('alter')?.textContent || '0', 10);

    const stepToSemitone: Record<string, number> = {
      C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
    };

    return 12 + (octave * 12) + (stepToSemitone[step] ?? 0) + alter;
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public subscribeNote(listener: NoteListener): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  private notifyState(countInActive: boolean = false): void {
    const state = this.getState(countInActive);
    this.stateListeners.forEach(listener => listener(state));
  }

  public getState(countInActive: boolean = false): PlaybackState {
    return {
      isPlaying: this.isCurrentlyPlaying,
      isPaused: this.isCurrentlyPaused,
      currentBeat: this.getCurrentBeat(),
      totalBeats: this.totalBeats,
      bpm: this.activeBpm,
      volume: Math.round(this.playbackVolume * 100),
      countInActive,
      loopEnabled: this.loopEnabled && this.loopRange !== null,
      loopRange: this.loopRange,
    };
  }

  public getCurrentBeat(): number {
    if (!this.isCurrentlyPlaying && !this.isCurrentlyPaused) return 0;
    if (this.isCurrentlyPaused) return this.pausedTimeInBeats;
    if (!this.audioContext || this.startTime === 0) return 0;

    const elapsedSeconds = Math.max(0, this.audioContext.currentTime - this.startTime);
    const beatsPerSec = this.activeBpm / 60;
    return Math.min(this.totalBeats, elapsedSeconds * beatsPerSec);
  }

  public setVolume(percent: number): void {
    const clamped = Math.max(0, Math.min(100, percent));
    this.playbackVolume = clamped / 100;
    if (this.masterGain && this.audioContext) {
      try {
        this.masterGain.gain.setValueAtTime(this.playbackVolume, this.audioContext.currentTime);
      } catch {
        // Gain update fallback
      }
    }
    this.notifyState();
  }

  public setCountIn(enabled: boolean): void {
    this.enableCountIn = enabled;
  }

  public getCountIn(): boolean {
    return this.enableCountIn;
  }

  public getCurrentXml(): string | null {
    return this.currentXml;
  }

  public getTimeSignature(): { beats: number; beatType: number } {
    return { beats: this.beatsPerBar, beatType: this.beatType };
  }

  public async loadMusicXml(musicXml: string): Promise<{ bpm: number; totalMeasures: number; beatsPerBar: number }> {
    this.stop();
    this.currentXml = musicXml;
    this.scheduledNotes = [];
    this.totalBeats = 0;

    const parser = new DOMParser();
    const doc = parser.parseFromString(musicXml, 'text/xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid MusicXML data');
    }

    // Determine divisions
    let divisions = 1;
    const divisionsEl = doc.querySelector('divisions');
    if (divisionsEl) {
      divisions = parseInt(divisionsEl.textContent || '1', 10) || 1;
    }

    // Determine Time signature
    const timeEl = doc.querySelector('time');
    if (timeEl) {
      const beats = parseInt(timeEl.querySelector('beats')?.textContent || '4', 10);
      const beatType = parseInt(timeEl.querySelector('beat-type')?.textContent || '4', 10);
      if (!isNaN(beats) && beats > 0) this.beatsPerBar = beats;
      if (!isNaN(beatType) && beatType > 0) this.beatType = beatType;
    }

    // Determine initial tempo
    let detectedBpm = 80;
    const soundTempo = doc.querySelector('sound[tempo]');
    if (soundTempo) {
      const t = parseFloat(soundTempo.getAttribute('tempo') || '');
      if (!isNaN(t) && t > 0) detectedBpm = Math.round(t);
    }
    this.activeBpm = detectedBpm;

    const parts = doc.querySelectorAll('part');
    if (parts.length === 0) {
      throw new Error('No parts found in MusicXML');
    }

    let maxBeatsOverall = 0;

    parts.forEach((part, partIndex) => {
      const measures = part.querySelectorAll('measure');
      let partTime = 0;
      const activeTies = new Map<string, ScheduledNoteEvent>();

      measures.forEach((measure, measureIndex) => {
        let lastNoteDuration = 0;
        const children = measure.children;

        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const tagName = child.tagName.toLowerCase();

          if (tagName === 'note') {
            const pitchEl = child.querySelector('pitch');
            const durationEl = child.querySelector('duration');
            const isChord = !!child.querySelector('chord');
            const isRest = !!child.querySelector('rest');

            if (durationEl) {
              const durVal = parseFloat(durationEl.textContent || '1');
              const durationInBeats = durVal / divisions;

              let noteStartTime = partTime;
              if (isChord) {
                noteStartTime = partTime - lastNoteDuration;
              }

              if (pitchEl && !isRest) {
                try {
                  const midi = this.parsePitchToMidi(pitchEl);
                  const frequency = this.midiToFrequency(midi);
                  const voice = parseInt(child.querySelector('voice')?.textContent || '1', 10);
                  const tieKey = `${partIndex}_${voice}_${midi}`;

                  const isTieStop = !!child.querySelector('tie[type="stop"]') || !!child.querySelector('tied[type="stop"]');
                  const isTieStart = !!child.querySelector('tie[type="start"]') || !!child.querySelector('tied[type="start"]');

                  if (isTieStop && activeTies.has(tieKey)) {
                    // Extend the duration of the previous tied note without re-triggering sound
                    const prevNote = activeTies.get(tieKey)!;
                    prevNote.durationInBeats += durationInBeats;
                    if (!isTieStart) {
                      activeTies.delete(tieKey);
                    }
                  } else {
                    const newEvent: ScheduledNoteEvent = {
                      timeInBeats: noteStartTime,
                      durationInBeats,
                      midi,
                      frequency,
                      voice,
                      measureIndex,
                    };
                    this.scheduledNotes.push(newEvent);

                    if (isTieStart) {
                      activeTies.set(tieKey, newEvent);
                    }
                  }
                } catch (err) {
                  console.warn('Error parsing note pitch:', err);
                }
              }

              if (!isChord) {
                partTime += durationInBeats;
                lastNoteDuration = durationInBeats;
              }
            }
          } else if (tagName === 'backup') {
            const durEl = child.querySelector('duration');
            if (durEl) {
              partTime -= parseFloat(durEl.textContent || '0') / divisions;
            }
          } else if (tagName === 'forward') {
            const durEl = child.querySelector('duration');
            if (durEl) {
              partTime += parseFloat(durEl.textContent || '0') / divisions;
            }
          }
        }
      });

      if (partTime > maxBeatsOverall) {
        maxBeatsOverall = partTime;
      }
    });

    // Sort scheduled notes chronologically
    this.scheduledNotes.sort((a, b) => a.timeInBeats - b.timeInBeats);
    this.totalBeats = maxBeatsOverall;

    this.notifyState();
    return {
      bpm: this.activeBpm,
      totalMeasures: doc.querySelectorAll('measure').length,
      beatsPerBar: this.beatsPerBar,
    };
  }

  public setInCue(startBeat: number, startMeasure?: number, noteMeta?: { x?: number; topY?: number; pageIndex?: number }): void {
    this.loopRange = {
      startBeat,
      endBeat: this.totalBeats,
      startMeasure,
      endMeasure: undefined,
      startNoteX: noteMeta?.x,
      startNoteTopY: noteMeta?.topY,
      startNotePageIndex: noteMeta?.pageIndex,
    };
    this.loopEnabled = false;
    this.notifyState();
  }

  public setLoop(
    startBeat: number,
    endBeat: number,
    startMeasure?: number,
    endMeasure?: number,
    noteMeta?: {
      startNoteX?: number;
      startNoteTopY?: number;
      startNotePageIndex?: number;
      endNoteX?: number;
      endNoteTopY?: number;
      endNotePageIndex?: number;
    }
  ): void {
    if (startBeat >= endBeat) return;
    this.loopRange = {
      startBeat,
      endBeat,
      startMeasure,
      endMeasure,
      ...noteMeta,
    };
    this.loopEnabled = true;

    const current = this.getCurrentBeat();
    if (current < startBeat || current >= endBeat) {
      this.seek(startBeat);
    } else {
      this.notifyState();
    }
  }

  public toggleLoop(enabled?: boolean): void {
    this.loopEnabled = enabled !== undefined ? enabled : !this.loopEnabled;
    if (this.loopEnabled) {
      if (!this.loopRange) {
        this.loopRange = { startBeat: 0, endBeat: this.totalBeats, startMeasure: 1, endMeasure: undefined };
      }
      const current = this.getCurrentBeat();
      if (current < this.loopRange.startBeat || current >= this.loopRange.endBeat) {
        this.seek(this.loopRange.startBeat);
        return;
      }
    }
    this.notifyState();
  }

  public clearLoop(): void {
    this.loopRange = null;
    this.loopEnabled = false;
    this.notifyState();
  }

  public getLoopRange(): LoopRange | null {
    return this.loopRange;
  }

  public getScheduledNotes(): ScheduledNoteEvent[] {
    return this.scheduledNotes;
  }

  public getMeasureBeatRange(measureIndex: number): { startBeat: number; endBeat: number } | null {
    const notesInMeasure = this.scheduledNotes.filter(n => n.measureIndex === measureIndex);
    if (notesInMeasure.length === 0) return null;
    const startBeat = Math.min(...notesInMeasure.map(n => n.timeInBeats));
    const endBeat = Math.max(...notesInMeasure.map(n => n.timeInBeats + n.durationInBeats));
    return { startBeat, endBeat };
  }

  public async play(tempo?: number): Promise<void> {
    if (this.isCurrentlyPlaying) return;
    if (tempo && tempo >= 20 && tempo <= 300) {
      this.activeBpm = tempo;
    }

    if (this.scheduledNotes.length === 0) {
      throw new Error('No notes loaded to play');
    }

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.isCurrentlyPlaying = true;
    const wasPaused = this.isCurrentlyPaused;
    this.isCurrentlyPaused = false;

    // Clean any prior active nodes
    this.activeNodes.forEach(node => {
      try { node.stop(); } catch { /* ignore */ }
    });
    this.activeNodes = [];

    // Loop bounds check
    const isLoopActive = this.loopEnabled && this.loopRange !== null;
    if (isLoopActive && this.loopRange) {
      if (this.pausedTimeInBeats < this.loopRange.startBeat || this.pausedTimeInBeats >= this.loopRange.endBeat) {
        this.pausedTimeInBeats = this.loopRange.startBeat;
      }
    }

    const secondsPerBeat = 60 / this.activeBpm;
    const countInBeats = (!wasPaused && this.enableCountIn && !isLoopActive) ? this.beatsPerBar : 0;
    const countInDuration = countInBeats * secondsPerBeat;
    const now = ctx.currentTime;

    this.startTime = now + countInDuration - (this.pausedTimeInBeats * secondsPerBeat);

    // Create Master Gain
    const master = ctx.createGain();
    this.masterGain = master;
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(this.playbackVolume, now + 0.05);

    // Schedule Count-in clicks
    if (countInBeats > 0) {
      this.notifyState(true);
      for (let i = 0; i < countInBeats; i++) {
        const clickTime = now + (i * secondsPerBeat);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(master);

        // First beat is high click (880Hz), other beats 587Hz
        osc.frequency.value = i === 0 ? 880 : 587;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0, clickTime);
        gain.gain.linearRampToValueAtTime(0.3, clickTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.09);

        osc.start(clickTime);
        osc.stop(clickTime + 0.1);
        this.activeNodes.push(osc);
      }
    }

    // Schedule score notes within bounds
    const loopEnd = (isLoopActive && this.loopRange) ? this.loopRange.endBeat : this.totalBeats;

    this.scheduledNotes.forEach(event => {
      if (event.timeInBeats + event.durationInBeats <= this.pausedTimeInBeats) {
        return;
      }
      if (event.timeInBeats >= loopEnd) {
        return;
      }

      try {
        const relStartBeats = event.timeInBeats - this.pausedTimeInBeats;
        const isPartial = relStartBeats < 0;
        const startOffset = Math.max(0, relStartBeats) * secondsPerBeat;
        const rawDur = (isPartial ? (event.timeInBeats + event.durationInBeats - this.pausedTimeInBeats) : event.durationInBeats) * secondsPerBeat;
        const maxDur = (loopEnd - Math.max(this.pausedTimeInBeats, event.timeInBeats)) * secondsPerBeat;
        const dur = Math.min(rawDur, maxDur);

        if (dur <= 0) return;

        const noteStart = Math.max(ctx.currentTime, now + countInDuration + startOffset);
        const noteEnd = noteStart + dur;

        // Acoustic musical tone synthesizer
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        osc.type = 'triangle';
        osc.frequency.value = event.frequency;

        filter.type = 'lowpass';
        filter.Q.value = 1.0;

        const attack = 0.008;
        const release = 0.08;

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.45, noteStart + attack);
        gain.gain.exponentialRampToValueAtTime(0.01, noteEnd + release);

        filter.frequency.setValueAtTime(2400, noteStart);
        filter.frequency.exponentialRampToValueAtTime(450, noteStart + Math.min(0.12, dur));

        osc.start(noteStart);
        osc.stop(noteEnd + release + 0.05);
        this.activeNodes.push(osc);
      } catch (err) {
        console.warn('Error scheduling note audio:', err);
      }
    });

    // Start cursor tracking interval
    if (this.cursorInterval) clearInterval(this.cursorInterval);
    let lastNotifiedIndex = -1;

    this.cursorInterval = setInterval(() => {
      if (!this.isCurrentlyPlaying || !this.audioContext) return;
      const currentBeat = this.getCurrentBeat();

      // Instant loop wrap-around when reaching the out-point
      if (this.loopEnabled && this.loopRange && currentBeat >= this.loopRange.endBeat) {
        this.restartLoopCycle();
        return;
      }

      // Find active note under current beat
      for (let i = 0; i < this.scheduledNotes.length; i++) {
        const n = this.scheduledNotes[i];
        if (n.timeInBeats <= currentBeat && (n.timeInBeats + n.durationInBeats) > currentBeat) {
          if (lastNotifiedIndex !== i) {
            lastNotifiedIndex = i;
            this.noteListeners.forEach(l => l(n, currentBeat));
          }
          break;
        }
      }
    }, 20);

    // Timeout fallback when piece or loop completes
    const remainingBeats = Math.max(0, loopEnd - this.pausedTimeInBeats);
    const totalPlaybackDurationSec = countInDuration + (remainingBeats * secondsPerBeat);

    if (this.playbackTimeout) clearTimeout(this.playbackTimeout);
    this.playbackTimeout = setTimeout(() => {
      if (this.loopEnabled && this.loopRange) {
        this.restartLoopCycle();
      } else {
        this.stop();
      }
    }, Math.max(0, totalPlaybackDurationSec * 1000));

    this.notifyState();
  }

  private restartLoopCycle(): void {
    if (!this.loopEnabled || !this.loopRange) return;
    this.stopInternal(false);
    this.isCurrentlyPlaying = false;
    this.isCurrentlyPaused = true;
    this.pausedTimeInBeats = this.loopRange.startBeat;

    this.notifyState();

    // 3-second practice pause before beginning next cycle from the IN point
    this.loopPauseTimeout = setTimeout(() => {
      this.loopPauseTimeout = null;
      if (!this.loopEnabled || !this.loopRange) return;
      this.isCurrentlyPaused = false;
      this.play(this.activeBpm).catch(err => {
        console.warn('Error looping playback:', err);
      });
    }, 3000);
  }

  public pause(): void {
    if (!this.isCurrentlyPlaying) return;

    this.pausedTimeInBeats = this.getCurrentBeat();
    this.isCurrentlyPlaying = false;
    this.isCurrentlyPaused = true;

    this.stopInternal(false);
    this.notifyState();
  }

  public stop(): void {
    this.isCurrentlyPlaying = false;
    this.isCurrentlyPaused = false;
    this.pausedTimeInBeats = this.loopEnabled && this.loopRange ? this.loopRange.startBeat : 0;
    this.stopInternal(true);
    this.notifyState();
  }

  public rewind(): void {
    if (this.loopEnabled && this.loopRange) {
      this.seek(this.loopRange.startBeat);
    } else {
      this.stop();
    }
  }

  public seek(targetBeat: number): void {
    const clamped = Math.max(0, Math.min(this.totalBeats, targetBeat));
    const wasPlaying = this.isCurrentlyPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.pausedTimeInBeats = clamped;
    this.isCurrentlyPaused = clamped > 0;
    this.notifyState();
    if (wasPlaying) {
      this.play(this.activeBpm);
    }
  }

  public setTempo(newBpm: number): void {
    const clamped = Math.max(20, Math.min(260, newBpm));
    const wasPlaying = this.isCurrentlyPlaying;

    if (wasPlaying) {
      const currentBeat = this.getCurrentBeat();
      this.pause();
      this.activeBpm = clamped;
      this.pausedTimeInBeats = currentBeat;
      this.play(clamped);
    } else {
      this.activeBpm = clamped;
      this.notifyState();
    }
  }

  private stopInternal(resetContext: boolean): void {
    if (this.loopPauseTimeout) {
      clearTimeout(this.loopPauseTimeout);
      this.loopPauseTimeout = null;
    }
    if (this.playbackTimeout) {
      clearTimeout(this.playbackTimeout);
      this.playbackTimeout = null;
    }
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
      this.cursorInterval = null;
    }

    this.activeNodes.forEach(node => {
      try { node.stop(); } catch { /* ignore */ }
    });
    this.activeNodes = [];
    this.masterGain = null;

    if (resetContext && this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  public isPaused(): boolean {
    return this.isCurrentlyPaused;
  }
}

export const audioPlaybackService = new AudioPlaybackService();
