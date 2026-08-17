import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { normalizeMusicXmlForOsmd } from '../services/musicXmlService';
import { audioPlaybackService, type ScheduledNoteEvent, type PlaybackState } from '../services/audioPlaybackService';
import { Loader2, AlertCircle } from 'lucide-react';

// Declare OSMD global if loaded via script tag
declare global {
  interface Window {
    opensheetmusicdisplay?: any;
  }
}

interface MusicXmlViewerProps {
  xmlContent: string;
  zoom: number;
  onRenderComplete?: (metadata: { totalPages: number }) => void;
}

export const MusicXmlViewer: React.FC<MusicXmlViewerProps> = memo(({
  xmlContent,
  zoom,
  onRenderComplete,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<any>(null);
  const onRenderCompleteRef = useRef(onRenderComplete);
  onRenderCompleteRef.current = onRenderComplete;

  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(audioPlaybackService.getState());

  // Automatically scroll the container to keep the active cursor comfortably in view
  const autoScrollToCursor = useCallback((smooth: boolean = true) => {
    const osmd = osmdRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!osmd?.cursor?.cursorElement || !scrollContainer) return;

    const cursorEl = osmd.cursor.cursorElement;
    const cursorRect = cursorEl.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    // Trigger scroll if cursor moves into top 15% or bottom 35% of the viewport
    const idealTop = containerRect.top + containerRect.height * 0.28;
    const topThreshold = containerRect.top + 70;
    const bottomThreshold = containerRect.bottom - 160;

    if (cursorRect.top < topThreshold || cursorRect.bottom > bottomThreshold) {
      const scrollDiff = cursorRect.top - idealTop;
      scrollContainer.scrollBy({
        top: scrollDiff,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Listen to playback state & synchronize cues from single source of truth
  useEffect(() => {
    return audioPlaybackService.subscribeState((state) => {
      setPlaybackState(state);
    });
  }, []);

  // Jump OSMD visual cursor to specific measure and scroll into view
  const jumpCursorToMeasure = useCallback((targetMeasureIndex: number) => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;

    try {
      osmd.cursor.reset();
      while (!osmd.cursor.iterator.EndReached && osmd.cursor.iterator.CurrentMeasureIndex < targetMeasureIndex) {
        osmd.cursor.next();
      }
      osmd.cursor.show();
      setTimeout(() => autoScrollToCursor(true), 60);
    } catch (err) {
      console.warn('Error jumping OSMD cursor:', err);
    }
  }, [autoScrollToCursor]);

  // Initialize and render OSMD score
  const renderScore = useCallback(async () => {
    if (!containerRef.current || !xmlContent) return;

    const OSMD = window.opensheetmusicdisplay?.OpenSheetMusicDisplay;
    if (!OSMD) {
      setRenderError('OpenSheetMusicDisplay library is still loading. Please wait or reload.');
      return;
    }

    setLoading(true);
    setRenderError(null);

    try {
      containerRef.current.innerHTML = '';

      const osmd = new OSMD(containerRef.current, {
        autoResize: false,
        backend: 'svg',
        backgroundColor: '#ffffff',
        drawTitle: true,
        drawComposer: true,
        drawMeasureNumbers: true,
        drawCredits: true,
        newSystemFromXML: false,
        newPageFromXML: false,
      });

      osmdRef.current = osmd;

      const cleanXml = normalizeMusicXmlForOsmd(xmlContent);
      await osmd.load(cleanXml);

      osmd.zoom = zoom;
      osmd.render();

      const svgs = containerRef.current.querySelectorAll('svg');
      svgs.forEach((svg: SVGElement) => {
        svg.style.backgroundColor = '#ffffff';
      });

      if (osmd.cursor) {
        osmd.cursor.show();
        osmd.cursor.reset();
      }

      setLoading(false);

      if (onRenderCompleteRef.current) {
        const svgPages = containerRef.current.querySelectorAll('svg[id*="osmdSvgPage"], svg');
        const pageCount = svgPages.length || 1;
        onRenderCompleteRef.current({ totalPages: pageCount });
      }
    } catch (err: any) {
      console.error('Failed to render MusicXML score:', err);
      setRenderError(err.message || 'Failed to render MusicXML score.');
      setLoading(false);
    }
  }, [xmlContent]);

  // Handle zoom changes smoothly
  useEffect(() => {
    if (osmdRef.current && !loading) {
      try {
        osmdRef.current.zoom = zoom;
        osmdRef.current.render();
        if (osmdRef.current.cursor) {
          osmdRef.current.cursor.show();
        }
        const svgs = containerRef.current?.querySelectorAll('svg');
        svgs?.forEach((svg: SVGElement) => {
          svg.style.backgroundColor = '#ffffff';
        });
      } catch (err) {
        console.warn('Error adjusting zoom on OSMD:', err);
      }
    }
  }, [zoom, loading]);

  // Cursor tracking during playback
  useEffect(() => {
    let lastStepTime = -1;

    const unsubscribeNote = audioPlaybackService.subscribeNote((_event: ScheduledNoteEvent, currentBeat: number) => {
      if (!osmdRef.current?.cursor) return;

      if (currentBeat > lastStepTime) {
        lastStepTime = currentBeat;
        try {
          osmdRef.current.cursor.next();
          autoScrollToCursor(true);
        } catch {
          // ignore cursor edge bounds
        }
      }
    });

    const unsubscribeState = audioPlaybackService.subscribeState((state) => {
      if (!osmdRef.current?.cursor) return;

      if (!state.isPlaying && !state.isPaused && state.currentBeat === 0) {
        lastStepTime = -1;
        try {
          osmdRef.current.cursor.reset();
          osmdRef.current.cursor.show();
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
          // ignore
        }
      }
    });

    return () => {
      unsubscribeNote();
      unsubscribeState();
    };
  }, []);

  // Mount effect
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (!window.opensheetmusicdisplay) {
      timer = setTimeout(() => {
        renderScore();
      }, 300);
    } else {
      renderScore();
    }

    return () => clearTimeout(timer);
  }, [renderScore]);

  // Helper: Retrieve graphical measure bounds from OSMD GraphicSheet
  const getGraphicMeasure = useCallback((targetMeasureNum: number) => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet?.MusicPages) return null;

    for (let pIdx = 0; pIdx < osmd.GraphicSheet.MusicPages.length; pIdx++) {
      const page = osmd.GraphicSheet.MusicPages[pIdx];
      for (const system of page.MusicSystems || []) {
        for (const staffLine of system.StaffLines || []) {
          for (const m of staffLine.Measures || []) {
            if (m.MeasureNumber === targetMeasureNum) {
              const pos = m.PositionAndShape;
              if (pos) {
                return {
                  pageIndex: pIdx,
                  x: pos.AbsolutePosition.x * 10,
                  y: pos.AbsolutePosition.y * 10,
                  width: pos.Size.width * 10,
                  height: (pos.BorderBottom - pos.BorderTop) * 10 || 50,
                  topY: (pos.AbsolutePosition.y + pos.BorderTop) * 10,
                  bottomY: (pos.AbsolutePosition.y + pos.BorderBottom) * 10,
                };
              }
            }
          }
        }
      }
    }
    return null;
  }, []);

  // Render on-score [IN] and [OUT] cue badges directly in SVG with click-to-clear
  useEffect(() => {
    if (!containerRef.current || !osmdRef.current) return;
    const svgs = containerRef.current.querySelectorAll('svg');
    if (svgs.length === 0) return;

    // Clear old cue badges across all SVG pages
    svgs.forEach(s => {
      const oldCues = s.querySelectorAll('.scoretone-cue-badge');
      oldCues.forEach(el => el.remove());
    });

    const startM = playbackState.loopRange?.startMeasure ?? null;
    const endM = playbackState.loopRange?.endMeasure ?? null;

    // Render IN Cue (Triangle pointing forward / right)
    if (startM !== null && startM >= 0) {
      const gMeasure = getGraphicMeasure(startM);
      if (gMeasure && svgs[gMeasure.pageIndex]) {
        const svg = svgs[gMeasure.pageIndex];
        const inGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        inGroup.setAttribute('class', 'scoretone-cue-badge');
        inGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        inGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const x = gMeasure.x;
        const topY = gMeasure.topY;

        // Forward / Right-pointing triangle arrow (enlarged, no text)
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${x},${topY - 18} ${x + 16},${topY - 9} ${x},${topY}`);
        arrow.setAttribute('fill', '#ea580c');
        arrow.setAttribute('stroke', '#ffffff');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linejoin', 'round');

        inGroup.appendChild(arrow);
        svg.appendChild(inGroup);
      }
    }

    // Render OUT Cue (Triangle pointing backward / left)
    if (endM !== null && endM >= 0 && endM !== startM) {
      const gMeasure = getGraphicMeasure(endM);
      if (gMeasure && svgs[gMeasure.pageIndex]) {
        const svg = svgs[gMeasure.pageIndex];
        const outGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        outGroup.setAttribute('class', 'scoretone-cue-badge');
        outGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        outGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const xEnd = gMeasure.x + gMeasure.width;
        const topY = gMeasure.topY;

        // Backward / Left-pointing triangle arrow (enlarged, no text)
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${xEnd},${topY - 18} ${xEnd - 16},${topY - 9} ${xEnd},${topY}`);
        arrow.setAttribute('fill', '#ea580c');
        arrow.setAttribute('stroke', '#ffffff');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linejoin', 'round');

        outGroup.appendChild(arrow);
        svg.appendChild(outGroup);
      }
    }
  }, [playbackState.loopRange, getGraphicMeasure]);

  // Click on score: find exact measure from OSMD geometric layout
  const handleScoreClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !osmdRef.current?.GraphicSheet) return;
    const target = e.target as HTMLElement | SVGElement;
    const svg = target.closest('svg') as SVGSVGElement | null;
    if (!svg) return;

    // Transform screen click coordinates to exact SVG vector coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());
    const clickX = svgP.x;
    const clickY = svgP.y;

    // Search OSMD measures geometrically
    let clickedMeasureNum: number | null = null;
    let minDistance = Infinity;

    const osmd = osmdRef.current;
    for (const page of osmd.GraphicSheet.MusicPages || []) {
      for (const system of page.MusicSystems || []) {
        for (const staffLine of system.StaffLines || []) {
          const measures = staffLine.Measures || [];
          for (let mIdx = 0; mIdx < measures.length; mIdx++) {
            const m = measures[mIdx];
            const pos = m.PositionAndShape;
            if (pos && m.MeasureNumber !== undefined) {
              // For first measure on staff, extend x0 to 0 to catch clef/key signature clicks
              const x0 = mIdx === 0 ? 0 : pos.AbsolutePosition.x * 10;
              const x1 = (pos.AbsolutePosition.x + pos.Size.width) * 10;
              const y0 = (pos.AbsolutePosition.y + pos.BorderTop) * 10;
              const y1 = (pos.AbsolutePosition.y + pos.BorderBottom) * 10;

              // Check if inside measure box with vertical tolerance
              if (clickX >= x0 && clickX <= x1 && clickY >= (y0 - 30) && clickY <= (y1 + 30)) {
                clickedMeasureNum = m.MeasureNumber;
                break;
              }

              // Track nearest measure center
              const centerX = (pos.AbsolutePosition.x * 10 + x1) / 2;
              const centerY = (y0 + y1) / 2;
              const dist = Math.hypot(clickX - centerX, (clickY - centerY) * 1.8);
              if (dist < minDistance) {
                minDistance = dist;
                clickedMeasureNum = m.MeasureNumber;
              }
            }
          }
          if (clickedMeasureNum !== null && minDistance === 0) break;
        }
      }
    }

    if (clickedMeasureNum === null) return;

    // Toggle off if clicking the exact same measure when only IN is set
    if (playbackState.loopRange?.startMeasure === clickedMeasureNum && !playbackState.loopRange.endMeasure && !e.shiftKey) {
      audioPlaybackService.clearLoop();
      return;
    }

    const measureIndex = Math.max(0, clickedMeasureNum > 0 ? clickedMeasureNum - 1 : 0);
    const measureRange = audioPlaybackService.getMeasureBeatRange(measureIndex) || { startBeat: 0, endBeat: 4 };

    if (e.shiftKey && playbackState.loopRange?.startMeasure !== undefined) {
      // Shift+Click: Set OUT Cue point and enable loop
      const startM = Math.min(playbackState.loopRange.startMeasure, clickedMeasureNum);
      const endM = Math.max(playbackState.loopRange.startMeasure, clickedMeasureNum);
      const startRange = audioPlaybackService.getMeasureBeatRange(Math.max(0, startM - 1));
      const endRange = audioPlaybackService.getMeasureBeatRange(Math.max(0, endM - 1));

      if (startRange && endRange) {
        audioPlaybackService.setLoop(startRange.startBeat, endRange.endBeat, startM, endM);
        jumpCursorToMeasure(Math.max(0, startM - 1));
      }
    } else {
      // Normal Click: Set IN Cue point, seek playback to measure, and play forward without loop
      audioPlaybackService.setInCue(measureRange.startBeat, clickedMeasureNum);
      audioPlaybackService.seek(measureRange.startBeat);
      jumpCursorToMeasure(measureIndex);
    }
  }, [playbackState.loopRange, jumpCursorToMeasure]);

  return (
    <div
      ref={scrollContainerRef}
      tabIndex={-1}
      className="w-full h-full flex flex-col select-none outline-none overflow-auto"
      style={{
        backgroundColor: 'var(--pdf-bg)',
        transition: 'background-color var(--transition-md)',
      }}
    >
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-xs z-20">
          <Loader2 className="w-10 h-10 text-orange-400 animate-spin mb-2" />
          <p className="text-sm font-medium text-slate-300">Rendering MusicXML Score…</p>
        </div>
      )}

      {/* Error Message */}
      {renderError && (
        <div className="m-auto max-w-md p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-center flex flex-col items-center gap-3 z-30">
          <AlertCircle className="w-8 h-8 text-rose-400" />
          <p className="font-semibold text-base text-rose-300">Score Rendering Error</p>
          <p className="text-xs text-rose-200/80">{renderError}</p>
          <button
            onClick={() => renderScore()}
            className="mt-2 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors"
          >
            Retry Render
          </button>
        </div>
      )}

      {/* Scoped styles for OSMD rendered SVG score pages */}
      <style>{`
        .osmd-score-canvas svg {
          max-width: 100% !important;
          height: auto !important;
          background-color: #ffffff !important;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
          border-radius: 4px;
          margin-bottom: 24px;
          cursor: pointer;
        }
      `}</style>

      {/* Sheet Music Score Paper Page */}
      <div className="w-full flex flex-col items-center py-6 px-2 sm:px-6">
        <div
          ref={containerRef}
          onClick={handleScoreClick}
          className="osmd-score-canvas w-full flex flex-col items-center justify-center transition-all"
          style={{
            maxWidth: '920px',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
});

export default MusicXmlViewer;
