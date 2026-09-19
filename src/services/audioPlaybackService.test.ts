import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { audioPlaybackService } from './audioPlaybackService';

describe('audioPlaybackService loop repetitions', () => {
  beforeEach(() => {
    audioPlaybackService.stop();
    audioPlaybackService.clearLoop();
    audioPlaybackService.resetLoopRepetitions();
  });

  afterEach(() => {
    audioPlaybackService.stop();
    audioPlaybackService.clearLoop();
    audioPlaybackService.resetLoopRepetitions();
    vi.restoreAllMocks();
  });

  it('initializes with 0 loop repetitions', () => {
    const state = audioPlaybackService.getState();
    expect(state.loopRepetitions).toBe(0);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);
  });

  it('resets repetitions on seek', () => {
    // Simulate repetitions set
    (audioPlaybackService as unknown as { loopRepetitions: number }).loopRepetitions = 3;
    expect(audioPlaybackService.getLoopRepetitions()).toBe(3);

    audioPlaybackService.seek(0);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);
  });

  it('resets repetitions on rewind', () => {
    (audioPlaybackService as unknown as { loopRepetitions: number }).loopRepetitions = 5;
    expect(audioPlaybackService.getLoopRepetitions()).toBe(5);

    audioPlaybackService.rewind();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);
  });

  it('resets repetitions on stop', () => {
    (audioPlaybackService as unknown as { loopRepetitions: number }).loopRepetitions = 4;
    expect(audioPlaybackService.getLoopRepetitions()).toBe(4);

    audioPlaybackService.stop();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);
  });

  it('resets repetitions on setLoop, setInCue, clearLoop, and toggleLoop', () => {
    const service = audioPlaybackService as unknown as { loopRepetitions: number };

    service.loopRepetitions = 2;
    audioPlaybackService.setInCue(10);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    service.loopRepetitions = 3;
    audioPlaybackService.setLoop(10, 20, 3, 5);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    service.loopRepetitions = 4;
    audioPlaybackService.toggleLoop();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    service.loopRepetitions = 5;
    audioPlaybackService.clearLoop();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    service.loopRepetitions = 6;
    audioPlaybackService.applyLoopRange({ startBeat: 0, endBeat: 8 });
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);
  });

  it('increments loopRepetitions immediately upon loop completion before countdown starts', () => {
    vi.useFakeTimers();
    audioPlaybackService.setLoopPauseSeconds(2);
    audioPlaybackService.applyLoopRange({ startBeat: 0, endBeat: 8, startMeasure: 1, endMeasure: 2 });
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    // Spy on play to prevent actual Web Audio calls
    vi.spyOn(audioPlaybackService, 'play').mockResolvedValue();

    // Trigger restartLoopCycle (loop has completed)
    (audioPlaybackService as unknown as { restartLoopCycle: () => void }).restartLoopCycle();

    // Success counter increments immediately when loop completes, as countdown starts
    expect(audioPlaybackService.getState().loopPauseActive).toBe(true);
    expect(audioPlaybackService.getState().loopPauseRemaining).toBe(2);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(1);
    expect(audioPlaybackService.getState().loopRepetitions).toBe(1);

    // Advance 1 second
    vi.advanceTimersByTime(1000);
    expect(audioPlaybackService.getState().loopPauseRemaining).toBe(1);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(1);

    // Advance 1 more second: countdown ends -> loopPauseActive becomes false and play is triggered
    vi.advanceTimersByTime(1000);
    expect(audioPlaybackService.getState().loopPauseActive).toBe(false);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(1);
    expect(audioPlaybackService.getState().loopRepetitions).toBe(1);
    expect(audioPlaybackService.play).toHaveBeenCalledTimes(1);

    // Second loop cycle ends -> increments immediately to 2
    (audioPlaybackService as unknown as { restartLoopCycle: () => void }).restartLoopCycle();
    expect(audioPlaybackService.getState().loopPauseActive).toBe(true);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(2);

    // Advance countdown for second cycle
    vi.advanceTimersByTime(2000);
    expect(audioPlaybackService.getState().loopPauseActive).toBe(false);
    expect(audioPlaybackService.getLoopRepetitions()).toBe(2);
    expect(audioPlaybackService.play).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('increments loopRepetitions immediately when restartLoopCycle runs with loopPauseSeconds = 0', () => {
    audioPlaybackService.setLoopPauseSeconds(0);
    audioPlaybackService.applyLoopRange({ startBeat: 0, endBeat: 8, startMeasure: 1, endMeasure: 2 });
    expect(audioPlaybackService.getLoopRepetitions()).toBe(0);

    vi.spyOn(audioPlaybackService, 'play').mockResolvedValue();

    (audioPlaybackService as unknown as { restartLoopCycle: () => void }).restartLoopCycle();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(1);
    expect(audioPlaybackService.getState().loopRepetitions).toBe(1);

    (audioPlaybackService as unknown as { restartLoopCycle: () => void }).restartLoopCycle();
    expect(audioPlaybackService.getLoopRepetitions()).toBe(2);
    expect(audioPlaybackService.getState().loopRepetitions).toBe(2);
  });
});
