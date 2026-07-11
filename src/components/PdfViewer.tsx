import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { PDFDocumentProxy, PageViewportSize } from '../services/pdfService';
import { pdfService } from '../services/pdfService';
import PdfPageCanvas from './PdfPageCanvas';

interface PdfViewerProps {
  pdfDoc: PDFDocumentProxy;
  currentPage: number;
  onPageChange: (page: number) => void;
  fitMode: 'width' | 'height';
  scrollMode: 'single' | 'continuous';
  twoPageLandscape: boolean;
  onTotalPages: (total: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfDoc,
  currentPage,
  onPageChange,
  fitMode,
  scrollMode,
  twoPageLandscape,
  onTotalPages
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 1000 });
  const [pageSize, setPageSize] = useState<PageViewportSize | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, PageViewportSize>>({});
  const totalPages = pdfDoc.numPages;

  // Track page size of current page
  useEffect(() => {
    onTotalPages(totalPages);
    const fetchPageSize = async () => {
      try {
        const size = await pdfService.getPageSize(pdfDoc, currentPage);
        setPageSize(size);
        setPageSizes((prev) => ({ ...prev, [currentPage]: size }));
      } catch (err) {
        console.error('Failed to get page size', err);
      }
    };
    fetchPageSize();
  }, [pdfDoc, currentPage, totalPages, onTotalPages]);

  // Monitor container sizing resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      // Safeguard against zero dimensions
      setContainerSize({
        width: width || 800,
        height: height || 1000
      });
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Determine if landscape two-page layout should activate
  const isLandscape = containerSize.width > containerSize.height;
  const isTwoPageActive = scrollMode === 'single' && twoPageLandscape && isLandscape;

  // Calculate rendering scale
  const scale = useMemo(() => {
    if (!pageSize) return 1.0;

    const gap = 32; // page margins/padding
    const availableWidth = isTwoPageActive ? (containerSize.width - gap * 3) / 2 : containerSize.width - gap * 2;
    const availableHeight = containerSize.height - gap * 2;

    if (fitMode === 'width') {
      return availableWidth / pageSize.width;
    } else {
      return availableHeight / pageSize.height;
    }
  }, [pageSize, containerSize, fitMode, isTwoPageActive]);

  // Handle intersection observer scroll updates for continuous scrolling
  useEffect(() => {
    if (scrollMode !== 'continuous' || !containerRef.current) return;

    const observerOptions = {
      root: containerRef.current,
      rootMargin: '100px 0px', // Pre-trigger render ahead of viewport
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0', 10);
          if (pageNum && pageNum !== currentPage) {
            onPageChange(pageNum);
          }
        }
      });
    }, observerOptions);

    const children = containerRef.current.querySelectorAll('.continuous-page-row');
    children.forEach((child) => observer.observe(child));

    return () => observer.disconnect();
  }, [scrollMode, pdfDoc, onPageChange, currentPage]);

  // Render individual page with lazy loading component
  const PageRow = ({ pageNum }: { pageNum: number }) => {
    const [visible, setVisible] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect(); // Render once, don't unrender
          }
        },
        { rootMargin: '350px 0px' } // Pre-render when user is scrolling near
      );

      if (rowRef.current) observer.observe(rowRef.current);
      return () => observer.disconnect();
    }, []);

    // Estimate aspect ratio to prevent layouts shifting on lazy rendering
    const size = pageSizes[pageNum] || pageSize || { width: 612, height: 792, aspectRatio: 0.77 };
    const width = fitMode === 'width' ? containerSize.width - 64 : (containerSize.height - 64) * size.aspectRatio;
    const height = width / size.aspectRatio;

    return (
      <div
        ref={rowRef}
        data-page={pageNum}
        className="continuous-page-row flex justify-center py-4 w-full select-none"
        style={{ minHeight: `${height}px` }}
      >
        {visible ? (
          <PdfPageCanvas
            pdfDoc={pdfDoc}
            pageNumber={pageNum}
            scale={scale}
          />
        ) : (
          <div
            className="rounded border border-white/5 bg-slate-900/5 animate-pulse"
            style={{ width: `${width}px`, height: `${height}px` }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-auto flex select-none ${
        scrollMode === 'single' ? 'items-center justify-center' : 'flex-col items-center'
      }`}
      style={{
        backgroundColor: 'var(--pdf-bg)',
        transition: 'background-color var(--transition-md)'
      }}
    >
      {scrollMode === 'single' ? (
        <div className="flex gap-8 justify-center items-center py-6 px-4">
          <PdfPageCanvas
            pdfDoc={pdfDoc}
            pageNumber={currentPage}
            scale={scale}
          />

          {isTwoPageActive && currentPage + 1 <= totalPages && (
            <PdfPageCanvas
              pdfDoc={pdfDoc}
              pageNumber={currentPage + 1}
              scale={scale}
            />
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center py-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
            <PageRow key={num} pageNum={num} />
          ))}
        </div>
      )}
    </div>
  );
};
export default PdfViewer;
