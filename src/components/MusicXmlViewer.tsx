import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { normalizeMusicXmlForOsmd } from '../services/musicXmlService';
import { audioPlaybackService, type PlaybackState } from '../services/audioPlaybackService';
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


  // Listen to playback state & synchronize cues from single source of truth
  useEffect(() => {
    return audioPlaybackService.subscribeState((state) => {
      setPlaybackState(state);
    });
  }, []);


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
        osmd.cursor.cursorOptions = {
          type: 0,
          color: '#ea580c',
          alpha: 0.85,
          follow: false,
        };
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

  // Real-time Visual Playback Tracking Line & Auto-Scroll (GPU-efficient DOM reuse)
  useEffect(() => {
    let animId: number;
    let lastCheckedMeasure = -1;

    const getOrCreateCursor = (svg: SVGSVGElement): { group: SVGGElement; line: SVGLineElement } => {
      let group = svg.querySelector('.scoretone-playback-cursor') as SVGGElement | null;
      let line: SVGLineElement | null = null;
      if (!group) {
        group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'scoretone-playback-cursor');
        group.setAttribute('style', 'pointer-events: none;');

        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', '#ea580c');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('style', 'filter: drop-shadow(0 0 5px rgba(234, 88, 12, 0.85));');

        group.appendChild(line);
        svg.appendChild(group);
      } else {
        line = group.querySelector('line') as SVGLineElement;
      }
      return { group, line: line! };
    };

    const updatePlaybackCursor = () => {
      const isPlaying = playbackState.isPlaying;
      const isPaused = playbackState.isPaused;
      const svgs = containerRef.current?.querySelectorAll('svg');
      if (!svgs || svgs.length === 0 || !osmdRef.current?.GraphicSheet) {
        if (isPlaying) animId = requestAnimationFrame(updatePlaybackCursor);
        return;
      }

      if (!isPlaying && !isPaused && playbackState.currentBeat === 0) {
        svgs.forEach(s => {
          const group = s.querySelector('.scoretone-playback-cursor') as HTMLElement | null;
          if (group) group.style.display = 'none';
        });
        return;
      }

      const currentBeat = audioPlaybackService.getCurrentBeat();
      const notes = audioPlaybackService.getScheduledNotes();
      if (notes.length === 0) {
        if (isPlaying) animId = requestAnimationFrame(updatePlaybackCursor);
        return;
      }

      // Determine current measure from current beat
      let currentMeasureIndex = 0;
      let measureStartBeat = 0;
      let measureEndBeat = 4;

      for (let m = 0; m < 2000; m++) {
        const range = audioPlaybackService.getMeasureBeatRange(m);
        if (!range) break;
        if (currentBeat >= range.startBeat && currentBeat < range.endBeat) {
          currentMeasureIndex = m;
          measureStartBeat = range.startBeat;
          measureEndBeat = range.endBeat;
          break;
        } else if (currentBeat >= range.endBeat) {
          currentMeasureIndex = m;
          measureStartBeat = range.startBeat;
          measureEndBeat = range.endBeat;
        }
      }

      const gMeasure = getGraphicMeasure(currentMeasureIndex + 1);
      if (gMeasure && svgs[gMeasure.pageIndex]) {
        const activeSvg = svgs[gMeasure.pageIndex];
        const measureDuration = Math.max(0.001, measureEndBeat - measureStartBeat);
        const progress = Math.max(0, Math.min(1, (currentBeat - measureStartBeat) / measureDuration));
        let cursorX = gMeasure.x + (gMeasure.width * progress);

        // Snap to exact selected notehead when at IN point
        if (playbackState.loopRange?.startNoteX !== undefined &&
            Math.abs(currentBeat - playbackState.loopRange.startBeat) < 0.05 &&
            gMeasure.pageIndex === (playbackState.loopRange.startNotePageIndex ?? gMeasure.pageIndex)) {
          cursorX = playbackState.loopRange.startNoteX;
        }

        const topY = gMeasure.topY;
        const bottomY = gMeasure.bottomY;

        // Update active page cursor line in place
        svgs.forEach((s, idx) => {
          const { group, line } = getOrCreateCursor(s as SVGSVGElement);
          if (idx === gMeasure.pageIndex) {
            group.style.display = '';
            line.setAttribute('x1', `${cursorX}`);
            line.setAttribute('y1', `${topY - 4}`);
            line.setAttribute('x2', `${cursorX}`);
            line.setAttribute('y2', `${bottomY + 4}`);
          } else {
            group.style.display = 'none';
          }
        });

        // Auto-scroll check on measure transitions or when playing
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer && isPlaying && lastCheckedMeasure !== currentMeasureIndex) {
          lastCheckedMeasure = currentMeasureIndex;
          const pt = activeSvg.createSVGPoint();
          pt.x = cursorX;
          pt.y = bottomY;
          const ctm = activeSvg.getScreenCTM();
          if (ctm) {
            const screenPt = pt.matrixTransform(ctm);
            const containerRect = scrollContainer.getBoundingClientRect();
            const bottomThreshold = containerRect.bottom - 130;
            const topThreshold = containerRect.top + 40;

            if (screenPt.y > bottomThreshold || screenPt.y < topThreshold) {
              const idealScreenTop = containerRect.top + 80;
              const topPt = activeSvg.createSVGPoint();
              topPt.x = cursorX;
              topPt.y = topY;
              const screenTopPt = topPt.matrixTransform(ctm);
              const scrollDiff = screenTopPt.y - idealScreenTop;
              scrollContainer.scrollBy({
                top: scrollDiff,
                behavior: 'smooth',
              });
            }
          }
        }
      }

      if (isPlaying) {
        animId = requestAnimationFrame(updatePlaybackCursor);
      }
    };

    updatePlaybackCursor();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [playbackState.isPlaying, playbackState.isPaused, playbackState.currentBeat, getGraphicMeasure]);


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

  // Helper: Find closest individual musical note to click coordinates (Measure-scoped matching)
  const findClosestGraphicNote = useCallback((clickX: number, clickY: number, pageIndex: number) => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet?.MusicPages) return null;

    const page = osmd.GraphicSheet.MusicPages[pageIndex];
    if (!page) return null;

    const scheduled = audioPlaybackService.getScheduledNotes();

    // Step 1: Find the exact measure containing the click coordinates
    let matchedMeasure: any = null;
    let matchedMeasureNum = 1;
    let matchedMeasureIndex = 0;
    let minMeasureDist = Infinity;

    for (const system of page.MusicSystems || []) {
      for (const staffLine of system.StaffLines || []) {
        for (let mIdx = 0; mIdx < (staffLine.Measures || []).length; mIdx++) {
          const m = staffLine.Measures[mIdx];
          const mPos = m.PositionAndShape;
          if (!mPos) continue;

          const num = m.MeasureNumber || (mIdx + 1);
          const mIdxCalc = num > 0 ? num - 1 : mIdx;
          const x0 = mPos.AbsolutePosition.x * 10;
          const x1 = (mPos.AbsolutePosition.x + mPos.Size.width) * 10;
          const y0 = (mPos.AbsolutePosition.y + mPos.BorderTop) * 10 - 25;
          const y1 = (mPos.AbsolutePosition.y + mPos.BorderBottom) * 10 + 25;

          if (clickX >= x0 && clickX <= x1 && clickY >= y0 && clickY <= y1) {
            matchedMeasure = m;
            matchedMeasureNum = num;
            matchedMeasureIndex = mIdxCalc;
            minMeasureDist = 0;
            break;
          }

          const centerX = (x0 + x1) / 2;
          const centerY = (y0 + y1) / 2;
          const dist = Math.hypot(clickX - centerX, (clickY - centerY) * 1.8);
          if (dist < minMeasureDist) {
            minMeasureDist = dist;
            matchedMeasure = m;
            matchedMeasureNum = num;
            matchedMeasureIndex = mIdxCalc;
          }
        }
        if (minMeasureDist === 0) break;
      }
      if (minMeasureDist === 0) break;
    }

    if (!matchedMeasure) return null;

    const mPos = matchedMeasure.PositionAndShape;
    const measureTopY = (mPos.AbsolutePosition.y + mPos.BorderTop) * 10;
    const measureBottomY = (mPos.AbsolutePosition.y + mPos.BorderBottom) * 10;
    const notesInMeasure = scheduled.filter(sn => sn.measureIndex === matchedMeasureIndex);
    const measureRange = audioPlaybackService.getMeasureBeatRange(matchedMeasureIndex) || { startBeat: 0, endBeat: 4 };

    // Step 2: Inside the matched measure, find the closest staff entry / notehead
    const staffEntries = matchedMeasure.staffEntries || [];
    if (staffEntries.length > 0 && notesInMeasure.length > 0) {
      let closestEntryX = staffEntries[0].PositionAndShape.AbsolutePosition.x * 10;
      let closestNoteObj = notesInMeasure[0];
      let minXDist = Infinity;

      for (let seIdx = 0; seIdx < staffEntries.length; seIdx++) {
        const se = staffEntries[seIdx];
        const entryX = se.PositionAndShape.AbsolutePosition.x * 10;
        const frac = se.relInMeasureTimestamp;
        const beatOffset = frac
          ? ((typeof frac.RealValue === 'number' ? frac.RealValue : (frac.Numerator / frac.Denominator)) * 4)
          : 0;
        const targetBeat = measureRange.startBeat + beatOffset;

        // Find the scheduled note corresponding to this staff entry timestamp
        let matchedNote = notesInMeasure.find(n => Math.abs(n.timeInBeats - targetBeat) < 0.05);
        if (!matchedNote) {
          matchedNote = notesInMeasure.reduce((prev, curr) =>
            Math.abs(curr.timeInBeats - targetBeat) < Math.abs(prev.timeInBeats - targetBeat) ? curr : prev
          , notesInMeasure[0]);
        }

        const xDist = Math.abs(clickX - entryX);
        if (xDist < minXDist) {
          minXDist = xDist;
          closestEntryX = entryX;
          closestNoteObj = matchedNote;
        }
      }

      return {
        x: closestEntryX,
        topY: measureTopY,
        bottomY: measureBottomY,
        pageIndex,
        measureNum: matchedMeasureNum,
        timeInBeats: closestNoteObj.timeInBeats,
        durationInBeats: closestNoteObj.durationInBeats,
      };
    }

    // Fallback: estimate note from click position within measure
    if (notesInMeasure.length > 0) {
      const measureDuration = Math.max(0.001, measureRange.endBeat - measureRange.startBeat);
      const relativeClickX = Math.max(0, Math.min(1, (clickX - (mPos.AbsolutePosition.x * 10)) / (mPos.Size.width * 10)));
      const estimatedBeat = measureRange.startBeat + (relativeClickX * measureDuration);

      const closestNoteObj = notesInMeasure.reduce((prev, curr) =>
        Math.abs(curr.timeInBeats - estimatedBeat) < Math.abs(prev.timeInBeats - estimatedBeat) ? curr : prev
      , notesInMeasure[0]);

      const noteProgress = (closestNoteObj.timeInBeats - measureRange.startBeat) / measureDuration;
      const noteX = (mPos.AbsolutePosition.x * 10) + (mPos.Size.width * 10 * noteProgress);

      return {
        x: noteX,
        topY: measureTopY,
        bottomY: measureBottomY,
        pageIndex,
        measureNum: matchedMeasureNum,
        timeInBeats: closestNoteObj.timeInBeats,
        durationInBeats: closestNoteObj.durationInBeats,
      };
    }

    return {
      x: mPos.AbsolutePosition.x * 10,
      topY: measureTopY,
      bottomY: measureBottomY,
      pageIndex,
      measureNum: matchedMeasureNum,
      timeInBeats: measureRange.startBeat,
      durationInBeats: measureRange.endBeat - measureRange.startBeat,
    };
  }, []);

  // Render on-score [IN] and [OUT] cue badges directly in SVG above selected notes
  useEffect(() => {
    if (!containerRef.current || !osmdRef.current) return;
    const svgs = containerRef.current.querySelectorAll('svg');
    if (svgs.length === 0) return;

    // Clear old cue badges across all SVG pages
    svgs.forEach(s => {
      const oldCues = s.querySelectorAll('.scoretone-cue-badge');
      oldCues.forEach(el => el.remove());
    });

    const loopRange = playbackState.loopRange;
    if (!loopRange) return;

    // Render IN Cue (Triangle pointing forward / right above selected note)
    if (loopRange.startNoteX !== undefined && loopRange.startNotePageIndex !== undefined) {
      const svg = svgs[loopRange.startNotePageIndex];
      if (svg) {
        const inGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        inGroup.setAttribute('class', 'scoretone-cue-badge');
        inGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        inGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const x = loopRange.startNoteX;
        const topY = loopRange.startNoteTopY ?? 40;

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${x},${topY - 18} ${x + 16},${topY - 9} ${x},${topY}`);
        arrow.setAttribute('fill', '#ea580c');
        arrow.setAttribute('stroke', '#ffffff');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linejoin', 'round');

        inGroup.appendChild(arrow);
        svg.appendChild(inGroup);
      }
    } else if (loopRange.startMeasure !== undefined && loopRange.startMeasure >= 0) {
      const gMeasure = getGraphicMeasure(loopRange.startMeasure);
      if (gMeasure && svgs[gMeasure.pageIndex]) {
        const svg = svgs[gMeasure.pageIndex];
        const inGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        inGroup.setAttribute('class', 'scoretone-cue-badge');
        inGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        inGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const measureRange = audioPlaybackService.getMeasureBeatRange(Math.max(0, loopRange.startMeasure - 1)) || { startBeat: 0, endBeat: 4 };
        const mDur = Math.max(0.001, measureRange.endBeat - measureRange.startBeat);
        const inProgress = Math.max(0, Math.min(1, (loopRange.startBeat - measureRange.startBeat) / mDur));
        const x = gMeasure.x + (gMeasure.width * inProgress);
        const topY = gMeasure.topY;

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

    // Render OUT Cue (Triangle pointing backward / left above selected note)
    if (loopRange.endNoteX !== undefined && loopRange.endNotePageIndex !== undefined) {
      const svg = svgs[loopRange.endNotePageIndex];
      if (svg) {
        const outGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        outGroup.setAttribute('class', 'scoretone-cue-badge');
        outGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        outGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const xEnd = loopRange.endNoteX;
        const topY = loopRange.endNoteTopY ?? 40;

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${xEnd},${topY - 18} ${xEnd - 16},${topY - 9} ${xEnd},${topY}`);
        arrow.setAttribute('fill', '#ea580c');
        arrow.setAttribute('stroke', '#ffffff');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linejoin', 'round');

        outGroup.appendChild(arrow);
        svg.appendChild(outGroup);
      }
    } else if (loopRange.endMeasure !== undefined && loopRange.endMeasure >= 0 && (loopRange.endMeasure !== loopRange.startMeasure || loopRange.endBeat !== loopRange.startBeat)) {
      const gMeasure = getGraphicMeasure(loopRange.endMeasure);
      if (gMeasure && svgs[gMeasure.pageIndex]) {
        const svg = svgs[gMeasure.pageIndex];
        const outGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        outGroup.setAttribute('class', 'scoretone-cue-badge');
        outGroup.setAttribute('style', 'cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));');
        outGroup.onclick = (e) => {
          e.stopPropagation();
          audioPlaybackService.clearLoop();
        };

        const measureRange = audioPlaybackService.getMeasureBeatRange(Math.max(0, loopRange.endMeasure - 1)) || { startBeat: 0, endBeat: 4 };
        const mDur = Math.max(0.001, measureRange.endBeat - measureRange.startBeat);
        const outProgress = Math.max(0, Math.min(1, (loopRange.endBeat - measureRange.startBeat) / mDur));
        const xEnd = gMeasure.x + (gMeasure.width * outProgress);
        const topY = gMeasure.topY;

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

  // Click on score: select exact note for IN / OUT cue points
  const handleScoreClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !osmdRef.current?.GraphicSheet) return;
    const target = e.target as HTMLElement | SVGElement;
    const svg = target.closest('svg') as SVGSVGElement | null;
    if (!svg) return;

    // Find which SVG page was clicked
    const svgs = Array.from(containerRef.current.querySelectorAll('svg'));
    const pageIndex = Math.max(0, svgs.indexOf(svg));

    // Transform screen click coordinates to SVG vector coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());
    const clickX = svgP.x;
    const clickY = svgP.y;

    // Find closest note to click
    const note = findClosestGraphicNote(clickX, clickY, pageIndex);
    if (!note) return;

    if (e.shiftKey && playbackState.loopRange?.startBeat !== undefined) {
      // Shift+Click: Set OUT point at this note and activate loop
      const startBeat = playbackState.loopRange.startBeat;
      const endBeat = note.timeInBeats + note.durationInBeats;
      const startM = playbackState.loopRange.startMeasure || note.measureNum;
      const endM = note.measureNum;

      const minBeat = Math.min(startBeat, endBeat);
      const maxBeat = Math.max(startBeat, endBeat);
      const minM = startBeat <= endBeat ? startM : endM;
      const maxM = startBeat <= endBeat ? endM : startM;

      audioPlaybackService.setLoop(minBeat, maxBeat, minM, maxM, {
        startNoteX: playbackState.loopRange.startNoteX ?? note.x,
        startNoteTopY: playbackState.loopRange.startNoteTopY ?? note.topY,
        startNotePageIndex: playbackState.loopRange.startNotePageIndex ?? pageIndex,
        endNoteX: note.x,
        endNoteTopY: note.topY,
        endNotePageIndex: pageIndex,
      });
    } else {
      // Normal Click: Set IN point at this note and seek playback
      audioPlaybackService.setInCue(note.timeInBeats, note.measureNum, {
        x: note.x,
        topY: note.topY,
        pageIndex,
      });
      audioPlaybackService.seek(note.timeInBeats);
    }
  }, [playbackState.loopRange, findClosestGraphicNote]);

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
        .osmd-score-canvas {
          position: relative !important;
        }
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
