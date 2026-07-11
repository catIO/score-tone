import React, { useEffect, useRef, useState } from 'react';
import { pdfService, type PDFDocumentProxy } from '../services/pdfService';
import { Loader2 } from 'lucide-react';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotate?: number;
  onRenderSuccess?: () => void;
  onRenderError?: (error: unknown) => void;
}

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  rotate = 0,
  onRenderSuccess,
  onRenderError
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activeRender: { cancel: () => void } | null = null;
    const canvas = canvasRef.current;
    
    if (!canvas) return;

    setRendering(true);
    setError(null);

    // Trigger PDF.js render page
    activeRender = pdfService.renderPage(pdfDoc, pageNumber, canvas, {
      scale,
      rotate,
      onComplete: () => {
        setRendering(false);
        if (onRenderSuccess) onRenderSuccess();
      },
      onError: (err) => {
        setRendering(false);
        setError('Failed to render page.');
        if (onRenderError) onRenderError(err);
      }
    });

    return () => {
      if (activeRender) {
        activeRender.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale, rotate, onRenderSuccess, onRenderError]);

  return (
    <div className="relative inline-flex items-center justify-center bg-transparent shadow-md rounded">
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-xs z-10">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 text-rose-300 text-xs p-4 text-center z-10">
          {error}
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full block" />
    </div>
  );
};
export default PdfPageCanvas;
