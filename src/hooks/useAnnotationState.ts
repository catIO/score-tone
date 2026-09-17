import { useState, useCallback, useEffect, useRef } from 'react';
import type { AnnotationStroke, AnnotationTool } from '../services/storageService';
import { createAnnotationService } from '../services/annotationService';
import { useLibraryStorage } from './useLibraryStorage';

export type CurrentTool = AnnotationTool | 'eraser';

export const PEN_SIZES = [1.5, 3, 5, 8, 14] as const;
export const HIGHLIGHTER_SIZES = [10, 16, 24, 34, 48] as const;

export const ANNOTATION_PALETTE = [
  // Row 1: Monochromes
  '#111827', '#4B5563', '#9CA3AF', '#E5E7EB', '#FFFFFF',
  // Row 2: Soft pastels
  '#F87171', '#FDE047', '#86EFAC', '#93C5FD', '#FDBA74',
  // Row 3: Vibrant primaries
  '#EF4444', '#EAB308', '#22C55E', '#3B82F6', '#F97316',
  // Row 4: Deep notation tones
  '#B91C1C', '#D97706', '#15803D', '#1D4ED8', '#78350F',
] as const;

export interface UseAnnotationStateReturn {
  isAnnotating: boolean;
  setIsAnnotating: (active: boolean | ((prev: boolean) => boolean)) => void;
  activeTool: CurrentTool;
  setActiveTool: (tool: CurrentTool) => void;
  activeSizeIndex: number;
  setActiveSizeIndex: (index: number) => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
  currentStrokeSize: number;
  pageStrokes: Record<number, AnnotationStroke[]>;
  loadPageStrokes: (pageNumber: number) => Promise<void>;
  addStroke: (pageNumber: number, stroke: AnnotationStroke) => void;
  removeStrokes: (pageNumber: number, strokeIds: string[]) => void;
  undo: (pageNumber: number) => void;
  redo: (pageNumber: number) => void;
  clearPage: (pageNumber: number) => void;
  canUndo: (pageNumber: number) => boolean;
  canRedo: (pageNumber: number) => boolean;
}

export function useAnnotationState(fileId?: string): UseAnnotationStateReturn {
  const { db } = useLibraryStorage();
  const [annotationService] = useState(() => createAnnotationService(db));
  const [isAnnotating, setIsAnnotating] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<CurrentTool>('pen');
  const [activeSizeIndex, setActiveSizeIndex] = useState<number>(2); // Default to middle size index (5px pen / 24px highlighter)
  const [activeColor, setActiveColor] = useState<string>(ANNOTATION_PALETTE[0]); // Black by default
  const [pageStrokes, setPageStrokes] = useState<Record<number, AnnotationStroke[]>>({});

  // History stacks for undo / redo per page
  const undoStacksRef = useRef<Record<number, AnnotationStroke[][]>>({});
  const redoStacksRef = useRef<Record<number, AnnotationStroke[][]>>({});
  const loadedPagesRef = useRef<Set<number>>(new Set());

  // Reset state when file changes
  useEffect(() => {
    setPageStrokes({});
    undoStacksRef.current = {};
    redoStacksRef.current = {};
    loadedPagesRef.current.clear();
  }, [fileId]);

  const loadPageStrokes = useCallback(async (pageNumber: number) => {
    if (!fileId || loadedPagesRef.current.has(pageNumber)) return;
    loadedPagesRef.current.add(pageNumber);
    const strokes = await annotationService.getPageAnnotations(fileId, pageNumber);
    setPageStrokes(prev => ({ ...prev, [pageNumber]: strokes }));
  }, [fileId]);

  const addStroke = useCallback((pageNumber: number, stroke: AnnotationStroke) => {
    if (!fileId) return;

    setPageStrokes(prev => {
      const current = prev[pageNumber] || [];
      const updated = [...current, stroke];

      // Push previous state to undo stack
      const uStack = undoStacksRef.current[pageNumber] || [];
      undoStacksRef.current[pageNumber] = [...uStack, current];
      // Reset redo stack on new action
      redoStacksRef.current[pageNumber] = [];

      // Queue background debounced IndexedDB save
      annotationService.queueSavePageAnnotations(fileId, pageNumber, updated);

      return { ...prev, [pageNumber]: updated };
    });
  }, [fileId]);

  const removeStrokes = useCallback((pageNumber: number, strokeIds: string[]) => {
    if (!fileId || strokeIds.length === 0) return;

    setPageStrokes(prev => {
      const current = prev[pageNumber] || [];
      const idSet = new Set(strokeIds);
      const updated = current.filter(s => !idSet.has(s.id));

      if (updated.length === current.length) return prev;

      const uStack = undoStacksRef.current[pageNumber] || [];
      undoStacksRef.current[pageNumber] = [...uStack, current];
      redoStacksRef.current[pageNumber] = [];

      annotationService.queueSavePageAnnotations(fileId, pageNumber, updated);

      return { ...prev, [pageNumber]: updated };
    });
  }, [fileId]);

  const undo = useCallback((pageNumber: number) => {
    if (!fileId) return;

    const uStack = undoStacksRef.current[pageNumber] || [];
    if (uStack.length === 0) return;

    setPageStrokes(prev => {
      const current = prev[pageNumber] || [];
      const previousState = uStack[uStack.length - 1];
      undoStacksRef.current[pageNumber] = uStack.slice(0, -1);

      const rStack = redoStacksRef.current[pageNumber] || [];
      redoStacksRef.current[pageNumber] = [...rStack, current];

      annotationService.queueSavePageAnnotations(fileId, pageNumber, previousState);

      return { ...prev, [pageNumber]: previousState };
    });
  }, [fileId]);

  const redo = useCallback((pageNumber: number) => {
    if (!fileId) return;

    const rStack = redoStacksRef.current[pageNumber] || [];
    if (rStack.length === 0) return;

    setPageStrokes(prev => {
      const current = prev[pageNumber] || [];
      const nextState = rStack[rStack.length - 1];
      redoStacksRef.current[pageNumber] = rStack.slice(0, -1);

      const uStack = undoStacksRef.current[pageNumber] || [];
      undoStacksRef.current[pageNumber] = [...uStack, current];

      annotationService.queueSavePageAnnotations(fileId, pageNumber, nextState);

      return { ...prev, [pageNumber]: nextState };
    });
  }, [fileId]);

  const clearPage = useCallback((pageNumber: number) => {
    if (!fileId) return;

    setPageStrokes(prev => {
      const current = prev[pageNumber] || [];
      if (current.length === 0) return prev;

      const uStack = undoStacksRef.current[pageNumber] || [];
      undoStacksRef.current[pageNumber] = [...uStack, current];
      redoStacksRef.current[pageNumber] = [];

      annotationService.queueSavePageAnnotations(fileId, pageNumber, []);

      return { ...prev, [pageNumber]: [] };
    });
  }, [fileId]);

  const canUndo = useCallback((pageNumber: number): boolean => {
    return (undoStacksRef.current[pageNumber] || []).length > 0;
  }, []);

  const canRedo = useCallback((pageNumber: number): boolean => {
    return (redoStacksRef.current[pageNumber] || []).length > 0;
  }, []);

  const currentStrokeSize = activeTool === 'highlighter'
    ? HIGHLIGHTER_SIZES[activeSizeIndex] || 24
    : PEN_SIZES[activeSizeIndex] || 5;

  return {
    isAnnotating,
    setIsAnnotating,
    activeTool,
    setActiveTool,
    activeSizeIndex,
    setActiveSizeIndex,
    activeColor,
    setActiveColor,
    currentStrokeSize,
    pageStrokes,
    loadPageStrokes,
    addStroke,
    removeStrokes,
    undo,
    redo,
    clearPage,
    canUndo,
    canRedo,
  };
}
