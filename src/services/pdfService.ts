import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js Worker to use the Vite bundled asset url.
// This is optimal for PWA offline caching since Vite will copy and version this file.
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PageViewportSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export const pdfService = {
  // Load PDF from Blob or ArrayBuffer
  async loadDocument(data: Blob | ArrayBuffer | string): Promise<pdfjsLib.PDFDocumentProxy> {
    let sourceData: Uint8Array | string;

    if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      sourceData = new Uint8Array(buffer);
    } else if (data instanceof ArrayBuffer) {
      sourceData = new Uint8Array(data);
    } else {
      sourceData = data; // URL string
    }

    const loadingTask = pdfjsLib.getDocument(
      typeof sourceData === 'string' ? { url: sourceData } : { data: sourceData }
    );
    return loadingTask.promise;
  },

  // Get dimensions of a page without rendering it
  async getPageSize(pdfDoc: pdfjsLib.PDFDocumentProxy, pageNumber: number, rotate = 0): Promise<PageViewportSize> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation: rotate });
    return {
      width: viewport.width,
      height: viewport.height,
      aspectRatio: viewport.width / viewport.height
    };
  },

  // Render a PDF page onto a canvas
  renderPage(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    options: {
      scale: number;
      rotate?: number;
      onComplete?: () => void;
      onError?: (err: unknown) => void;
    }
  ): { cancel: () => void } {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Clear canvas before drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Get viewport based on target scale and rotation
        const viewport = page.getViewport({
          scale: options.scale,
          rotation: options.rotate || 0
        });

        // Set high-DPI scaling for Retina/Tablet displays
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.scale(dpr, dpr);

        renderTask = page.render({
          canvasContext: ctx,
          viewport: viewport
        });

        await renderTask.promise;
        
        if (!cancelled && options.onComplete) {
          options.onComplete();
        }
      } catch (err: unknown) {
        // RenderTask cancellation throws an error, ignore it if we triggered it
        if (err instanceof Error && err.name === 'RenderingCancelledException') {
          return;
        }
        if (!cancelled && options.onError) {
          options.onError(err);
        }
      }
    };

    render();

    return {
      cancel: () => {
        cancelled = true;
        if (renderTask) {
          renderTask.cancel();
        }
      }
    };
  }
};
export type { PDFDocumentProxy } from 'pdfjs-dist';
export type { RenderTask } from 'pdfjs-dist';
export type PDFPageProxy = pdfjsLib.PDFPageProxy;
export type PDFDocumentLoadingTask = pdfjsLib.PDFDocumentLoadingTask;
