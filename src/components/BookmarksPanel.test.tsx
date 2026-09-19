import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarksPanel } from './BookmarksPanel';
import type { Bookmark, ScoreFile } from '../services/storageService';
import type { PlaybackState } from '../services/audioPlaybackService';
import { audioPlaybackService } from '../services/audioPlaybackService';

const mockFile: ScoreFile = {
  id: 'test-file-1',
  name: 'Sonata in C.xml',
  source: 'local',
  fileType: 'musicxml',
  lastOpened: Date.now(),
  lastPage: 1,
  offline: true,
  bookmarks: [],
};

const mockLoopBookmark: Bookmark = {
  id: 'bm-loop-1',
  name: 'm. 9–10',
  page: 1,
  createdAt: 1000,
  type: 'loop',
  loopRange: {
    startBeat: 32,
    endBeat: 40,
    startMeasure: 9,
    endMeasure: 10,
  },
  bpm: 60,
};

const mockPageBookmark: Bookmark = {
  id: 'bm-page-1',
  name: 'Movement II',
  page: 3,
  createdAt: 1000,
  type: 'page',
};

const mockPlaybackState: PlaybackState = {
  isPlaying: false,
  isPaused: false,
  currentBeat: 0,
  totalBeats: 100,
  bpm: 80,
  volume: 0.8,
  countInActive: false,
  loopEnabled: false,
  loopRange: null,
};

describe('BookmarksPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders saved practice sections with play, edit, and overflow buttons', () => {
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark, mockPageBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    expect(screen.getByText('Saved Practice Sections')).toBeTruthy();
    expect(screen.getByText('m. 9–10')).toBeTruthy();
    expect(screen.getByText('m. 9–10 • 60 BPM')).toBeTruthy();

    // Verify buttons for loop: play, edit, more options
    expect(screen.getByRole('button', { name: 'Play loop' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit loop' })).toBeTruthy();
    const moreBtns = screen.getAllByRole('button', { name: 'More options' });
    expect(moreBtns.length).toBe(2);
  });

  it('opens overflow menu with Edit, Share link, and Delete options', async () => {
    const onDeleteBookmark = vi.fn();
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onDeleteBookmark={onDeleteBookmark}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    const moreBtn = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(moreBtn);

    const menu = screen.getByRole('menu');
    expect(menu).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /share link/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeTruthy();

    // Click delete from overflow menu
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(onDeleteBookmark).toHaveBeenCalledWith('bm-loop-1');
  });

  it('copies bookmark link to clipboard via overflow menu', async () => {
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const shareBtn = screen.getByRole('menuitem', { name: /share link/i });
    fireEvent.click(shareBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('loopStartM=9')
    );
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });

  it('enters loop edit mode from the card Edit button and updates BPM, in/out points, and name', async () => {
    const onUpdateBookmark = vi.fn();
    vi.spyOn(audioPlaybackService, 'getBeatRangeForMeasures').mockReturnValue({
      startBeat: 40,
      endBeat: 56,
    });

    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onUpdateBookmark={onUpdateBookmark}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    // Click Edit button
    fireEvent.click(screen.getByRole('button', { name: 'Edit loop' }));

    // Edit card should be visible
    expect(screen.getByTestId('edit-card-bm-loop-1')).toBeTruthy();
    expect(screen.getByText('Edit Loop')).toBeTruthy();

    const nameInput = screen.getByLabelText('Bookmark name') as HTMLInputElement;
    expect(nameInput.value).toBe('m. 9–10');

    const startMeasureInput = screen.getByLabelText('Start measure') as HTMLInputElement;
    expect(startMeasureInput.value).toBe('9');

    const endMeasureInput = screen.getByLabelText('End measure') as HTMLInputElement;
    expect(endMeasureInput.value).toBe('10');

    const bpmInput = screen.getByLabelText('BPM') as HTMLInputElement;
    expect(bpmInput.value).toBe('60');

    // Increase BPM using +5 stepper
    fireEvent.click(screen.getByRole('button', { name: '+5' }));
    expect(bpmInput.value).toBe('65');

    // Increase start measure
    fireEvent.click(screen.getByRole('button', { name: 'Increase start measure' }));
    expect(startMeasureInput.value).toBe('10');

    // Increase end measure
    fireEvent.click(screen.getByRole('button', { name: 'Increase end measure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase end measure' }));
    expect(endMeasureInput.value).toBe('12');

    // Name should auto-update since it followed the measure convention
    expect(nameInput.value).toBe('m. 10–12');

    // Or custom name
    fireEvent.change(nameInput, { target: { value: 'Guitar Solo Section' } });
    expect(nameInput.value).toBe('Guitar Solo Section');

    // Click Save
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdateBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bm-loop-1',
        name: 'Guitar Solo Section',
        bpm: 65,
        loopRange: expect.objectContaining({
          startMeasure: 10,
          endMeasure: 12,
          startBeat: 40,
          endBeat: 56,
        }),
      })
    );

    // Edit card should close
    expect(screen.queryByTestId('edit-card-bm-loop-1')).toBeNull();
  });

  it('supports "Use active selection" button in edit mode when a loop is active on score', async () => {
    const onUpdateBookmark = vi.fn();
    const activePlaybackState: PlaybackState = {
      ...mockPlaybackState,
      bpm: 92,
      loopEnabled: true,
      loopRange: {
        startBeat: 64,
        endBeat: 80,
        startMeasure: 17,
        endMeasure: 20,
      },
    };

    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onUpdateBookmark={onUpdateBookmark}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={activePlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    // Click Edit button
    fireEvent.click(screen.getByRole('button', { name: 'Edit loop' }));

    // Click "Use active selection"
    const useActiveBtn = screen.getByRole('button', { name: 'Use active selection on score' });
    fireEvent.click(useActiveBtn);

    const startMeasureInput = screen.getByLabelText('Start measure') as HTMLInputElement;
    expect(startMeasureInput.value).toBe('17');

    const endMeasureInput = screen.getByLabelText('End measure') as HTMLInputElement;
    expect(endMeasureInput.value).toBe('20');

    const bpmInput = screen.getByLabelText('BPM') as HTMLInputElement;
    expect(bpmInput.value).toBe('92');

    const nameInput = screen.getByLabelText('Bookmark name') as HTMLInputElement;
    expect(nameInput.value).toBe('m. 17–20');

    // Click Save
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdateBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bm-loop-1',
        name: 'm. 17–20',
        bpm: 92,
        loopRange: expect.objectContaining({
          startMeasure: 17,
          endMeasure: 20,
          startBeat: 64,
          endBeat: 80,
        }),
      })
    );
  });

  it('allows cancelling edit without saving changes', () => {
    const onUpdateBookmark = vi.fn();
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onUpdateBookmark={onUpdateBookmark}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit loop' }));
    expect(screen.getByTestId('edit-card-bm-loop-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('edit-card-bm-loop-1')).toBeNull();
    expect(onUpdateBookmark).not.toHaveBeenCalled();
  });

  it('can open edit mode from the overflow menu as well', () => {
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockLoopBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={true}
        />
      </StrictMode>
    );

    // Open overflow menu
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    // Click Edit inside menu
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    expect(screen.getByTestId('edit-card-bm-loop-1')).toBeTruthy();
  });

  it('enters page bookmark edit mode and updates name and page', () => {
    const onUpdateBookmark = vi.fn();
    render(
      <StrictMode>
        <BookmarksPanel
          file={mockFile}
          bookmarks={[mockPageBookmark]}
          currentPage={1}
          onPageChange={vi.fn()}
          onAddBookmark={vi.fn()}
          onUpdateBookmark={onUpdateBookmark}
          onDeleteBookmark={vi.fn()}
          onClose={vi.fn()}
          playbackState={mockPlaybackState}
          isMusicXml={false}
        />
      </StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit bookmark' }));
    expect(screen.getByTestId('edit-card-bm-page-1')).toBeTruthy();
    expect(screen.getByText('Edit Bookmark')).toBeTruthy();

    const nameInput = screen.getByLabelText('Bookmark name') as HTMLInputElement;
    expect(nameInput.value).toBe('Movement II');

    const pageInput = screen.getByLabelText('Page number') as HTMLInputElement;
    expect(pageInput.value).toBe('3');

    fireEvent.change(nameInput, { target: { value: 'Movement III Presto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase page' }));
    expect(pageInput.value).toBe('4');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdateBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bm-page-1',
        name: 'Movement III Presto',
        page: 4,
      })
    );
  });
});
