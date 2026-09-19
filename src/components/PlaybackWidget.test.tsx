import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackWidget } from './PlaybackWidget';
import type { PlaybackState } from '../services/audioPlaybackService';

const basePlaybackState: PlaybackState = {
  isPlaying: false,
  isPaused: false,
  currentBeat: 0,
  totalBeats: 100,
  bpm: 100,
  volume: 80,
  countInActive: false,
  loopEnabled: true,
  loopRange: {
    startBeat: 0,
    endBeat: 8,
    startMeasure: 1,
    endMeasure: 2,
  },
  loopRepetitions: 0,
  loopPauseActive: false,
  loopPauseRemaining: 0,
  loopPauseSeconds: 3,
};

function renderWidget(playbackState: PlaybackState, options: { trackLoopRepetitions?: boolean; onToggleTrackLoopRepetitions?: (enabled: boolean) => void } = {}) {
  return render(
    <StrictMode>
      <PlaybackWidget
        playbackState={playbackState}
        onTogglePlay={vi.fn()}
        onRewind={vi.fn()}
        onBpmChange={vi.fn()}
        onVolumeChange={vi.fn()}
        countInEnabled={true}
        onToggleCountIn={vi.fn()}
        onToggleLoop={vi.fn()}
        trackLoopRepetitions={options.trackLoopRepetitions ?? true}
        onToggleTrackLoopRepetitions={options.onToggleTrackLoopRepetitions}
      />
    </StrictMode>
  );
}

describe('PlaybackWidget loop repetition UI', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders repeat icon initially when loopRepetitions is 0', () => {
    renderWidget({
      ...basePlaybackState,
      loopRepetitions: 0,
      loopPauseActive: false,
    });

    const loopBtn = screen.getByRole('button', { name: 'Toggle Loop Mode' });
    expect(loopBtn).toBeTruthy();
    // Has svg icon
    expect(loopBtn.querySelector('svg.lucide-repeat')).toBeTruthy();
  });

  it('renders countdown in cycle icon when resting between loops (loopPauseActive = true)', () => {
    renderWidget({
      ...basePlaybackState,
      loopPauseActive: true,
      loopPauseRemaining: 3,
      loopRepetitions: 0,
    });

    const loopBtn = screen.getByRole('button', { name: /resting between loops: 3s/i });
    expect(loopBtn).toBeTruthy();
    expect(within(loopBtn).getByText('3')).toBeTruthy();
    // No streak badge when loopRepetitions is 0
    expect(screen.queryByLabelText(/repetition/i)).toBeNull();
  });

  it('renders both countdown in cycle icon and separate success counter when resting with streak', () => {
    renderWidget({
      ...basePlaybackState,
      loopPauseActive: true,
      loopPauseRemaining: 3,
      loopRepetitions: 4,
    });

    // Countdown is inside cycle icon button
    const loopBtn = screen.getByRole('button', { name: /resting between loops: 3s/i });
    expect(loopBtn).toBeTruthy();
    expect(within(loopBtn).getByText('3')).toBeTruthy();

    // Success counter is present separately
    const streakEl = screen.getByLabelText(/4 repetitions in a row/i);
    expect(streakEl).toBeTruthy();
    expect(within(streakEl).getByText('4')).toBeTruthy();

    // Success counter appears before countdown loop button in the DOM
    expect(streakEl.compareDocumentPosition(loopBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Both share exact size w-8 h-8 rounded-lg
    expect(streakEl.className).toContain('w-8 h-8 rounded-lg');
    expect(loopBtn.className).toContain('w-8 h-8 rounded-lg');
  });

  it('renders streak counter in separate space after first repetition finishes', () => {
    renderWidget({
      ...basePlaybackState,
      loopPauseActive: false,
      loopRepetitions: 1,
    });

    const loopBtn = screen.getByRole('button', { name: 'Toggle Loop Mode' });
    expect(loopBtn).toBeTruthy();
    expect(loopBtn.querySelector('svg.lucide-repeat')).toBeTruthy();

    const streakEl = screen.getByLabelText(/1 repetition in a row/i);
    expect(streakEl).toBeTruthy();
    expect(within(streakEl).getByText('1')).toBeTruthy();
  });

  it('renders streak counter in separate space on higher streaks', () => {
    renderWidget({
      ...basePlaybackState,
      loopPauseActive: false,
      loopRepetitions: 5,
    });

    const loopBtn = screen.getByRole('button', { name: 'Toggle Loop Mode' });
    expect(loopBtn).toBeTruthy();
    expect(loopBtn.querySelector('svg.lucide-repeat')).toBeTruthy();

    const streakEl = screen.getByLabelText(/5 repetitions in a row/i);
    expect(streakEl).toBeTruthy();
    expect(within(streakEl).getByText('5')).toBeTruthy();
  });

  it('hides repetition count and reverts to standard repeat button when trackLoopRepetitions is false', () => {
    renderWidget(
      {
        ...basePlaybackState,
        loopPauseActive: false,
        loopRepetitions: 5,
      },
      { trackLoopRepetitions: false }
    );

    const loopBtn = screen.getByRole('button', { name: 'Toggle Loop Mode' });
    expect(loopBtn).toBeTruthy();
    expect(screen.queryByText('5')).toBeNull();
    expect(loopBtn.querySelector('svg.lucide-repeat')).toBeTruthy();
  });
});
