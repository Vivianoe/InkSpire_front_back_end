'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react';

// Dynamic import PDF.js to avoid server-side rendering issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rangyLib: any = null;

const loadPdfJs = async () => {
  if (typeof window === 'undefined') return null;
  
  if (!pdfjsLib) {
    // Use global pdfjsLib from CDN (legacy build) injected in layout.tsx
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = (window as any).pdfjsLib;
    if (!g) {
      console.error('pdfjsLib not found on window. Ensure CDN script is loaded in layout.');
      return null;
    }
    pdfjsLib = g;
    // Worker was set in layout to the matching legacy worker on CDN
  }
  
  return pdfjsLib;
};

// Dynamically load rangy and class applier
const loadRangy = async () => {
  if (typeof window === 'undefined') return null;
  if (!rangyLib) {
    // rangy is UMD; default export may vary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core: any = await import('rangy');
    await import('rangy/lib/rangy-classapplier');
    rangyLib = (core as any).default || core;
    try { rangyLib.init(); } catch {}
  }
  return rangyLib;
};

interface PdfPreviewProps {
  file: File | null;
  onTextExtracted?: (text: string) => void;
  // External search input: a sentence or multiple phrases to highlight across the rendered PDF
  searchQueries?: string | string[];
  // Request scroll to the first highlight matching this fragment (case-insensitive substring)
  scrollToFragment?: string;
  // Scaffold index for direct matching (0-based, Card 1 -> index 0)
  scaffoldIndex?: number;
}

export default function PdfPreview({ file, searchQueries, scrollToFragment, scaffoldIndex }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [pageElements, setPageElements] = useState<Map<number, HTMLDivElement>>(new Map());
  const [overlayLayers, setOverlayLayers] = useState<Map<number, HTMLDivElement>>(new Map());
  const [viewportVersion, setViewportVersion] = useState(0);
  const basePageWidthRef = useRef<number | null>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const overlayLayersRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // rangy appliers
  const appliersRef = useRef<{ A: any | null; B: any | null }>({ A: null, B: null });

  // Inject PDF styles into document head
  useEffect(() => {
    const styleId = 'pdf-preview-styles';
    if (document.getElementById(styleId)) return; // Already injected

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* PDF Text Layer Styles */
      .textLayer {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        user-select: text;
        z-index: 10;
      }
      .textLayer * { 
        color: transparent !important; 
        -webkit-text-fill-color: transparent !important; 
        text-shadow: none !important; 
      }
      .textLayer span,
      .textLayer div {
        position: absolute;
        user-select: text;
        pointer-events: auto;
        cursor: text;
        line-height: normal;
        white-space: pre;
        transform-origin: 0% 0%;
      }
      
      /* PDF Highlight Styles - Override PDF.js defaults */
      mark.pdf-highlight,
      mark.pdf-highlight-alt {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        text-shadow: none !important;
        background: #ffcc14e3 !important;
        border-radius: 2px !important;
        padding: 0 !important;
        mix-blend-mode: multiply !important;
      }

      /* PDF Highlight Layer Styles */
      .highlightLayer .pdf-hit,
      div.highlightLayer .pdf-hit,
      .highlightLayer div.pdf-hit,
      div.highlightLayer div.pdf-hit,
      .highlightLayer .pdf-hit[style],
      div.highlightLayer .pdf-hit[style],
      .highlightLayer div.pdf-hit[style],
      div.highlightLayer div.pdf-hit[style] {
        position: absolute !important;
        background: #f1470e !important;
        border-radius: 2px !important;
        mix-blend-mode: multiply !important;
        opacity: 1 !important;
        transition: all 0.3s ease !important;
      }

      /* Text selection styles */
      .textLayer div::selection,
      .textLayer ::selection,
      div.textLayer div::selection,
      div.textLayer ::selection {
        background: #0785dee0 !important;
        color: inherit !important;
      }

      /* Highlight indicator for clicked sentences */
      .pdf-hit.highlighted,
      .pdf-hit.highlighted[style],
      mark.pdf-highlight.highlighted,
      mark.pdf-highlight-alt.highlighted,
      mark.pdf-highlight.highlighted[style],
      mark.pdf-highlight-alt.highlighted[style] {
        box-shadow: 0 0 0 3px rgba(255, 177, 20, 0.8), 0 0 10px rgba(255, 204, 20, 0.5) !important;
        z-index: 25 !important;
        transition: box-shadow 0.2s ease !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      // Style persists across component instances
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPdfDoc(null);
      setRenderedPages(new Set());
      setPageElements(new Map());
      return;
    }

    let cancelled = false;
    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        const pdfjs = await loadPdfJs();
        if (!pdfjs || cancelled) return;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        
        if (!cancelled) {
          console.log('PDF loaded successfully:', pdf);
          console.log('PDF pages:', pdf.numPages);
          setPdfDoc(pdf);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error('PDF loading error:', err);
        if (!cancelled) {
          setError(err?.message || 'PDF loading failed');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => { cancelled = true; };
  }, [file]);

  const calculateScale = (baseWidth: number) => {
    const padding = 48; // account for inner padding/margins
    const availableWidth = containerRef.current
      ? Math.max(containerRef.current.clientWidth - 32, 320)
      : Math.max(window.innerWidth - padding, 320);
    const minScale = 1;
    const maxScale = 1.5;
    const computed = availableWidth > 0 ? availableWidth / baseWidth : maxScale;
    return Math.min(maxScale, Math.max(minScale, computed));
  };

  // Render all pages
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;
    highlightRecordsRef.current = [];
    pageElementsRef.current = new Map();
    overlayLayersRef.current = new Map();
    setRenderedPages(new Set());
    setPageElements(new Map());
    setOverlayLayers(new Map());

    const renderPage = async (pageNumber: number, force = false) => {
      if (!pdfDoc || cancelled) return;

      try {
        const pdfjs = await loadPdfJs();
        if (!pdfjs || cancelled) return;
        if (!force && pageElementsRef.current.has(pageNumber)) {
          return;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        
        const baseViewport = page.getViewport({ scale: 1 });
        if (!basePageWidthRef.current) {
          basePageWidthRef.current = baseViewport.width;
        }

        const scale = calculateScale(baseViewport.width);
        const viewport = page.getViewport({ scale });

        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page';
        pageContainer.dataset.page = String(pageNumber);
        pageContainer.style.position = 'relative';
        pageContainer.style.display = 'block';
        pageContainer.style.margin = '16px auto';
        pageContainer.style.backgroundColor = '#ffffff';
        pageContainer.style.boxShadow = '0 4px 20px rgba(0,0,0,.15)';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
        pageContainer.style.setProperty('--scale-factor', String(scale));
        
        // Create Canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        // Handle high DPI displays for crisp rendering
        // Note: This only affects canvas rendering quality, not coordinate calculations
        // Coordinates are based on CSS pixels (viewport), which remains at scale 1.2
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(viewport.width * devicePixelRatio);
        canvas.height = Math.ceil(viewport.height * devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.display = 'block';

        // Scale the context to match device pixel ratio for crisp rendering
        context.scale(devicePixelRatio, devicePixelRatio);

        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;

        // Create text layer for text selection
        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.position = 'absolute';
        textLayer.style.inset = '0';
        textLayer.style.pointerEvents = 'auto';
        textLayer.style.userSelect = 'text';
        textLayer.style.zIndex = '10';
        textLayer.style.overflow = 'hidden';
        textLayer.style.setProperty('--scale-factor', String(scale));

        const textContent = await page.getTextContent({ includeMarkedContent: true });
        if (cancelled) return;

        await (pdfjs as any).renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
          textDivs: [],
          enhanceTextSelection: true,
        }).promise;
        if (cancelled) return;

        textLayer.style.pointerEvents = 'auto';

        // Create overlay layer for backend-driven highlights (below textLayer)
        const overlay = document.createElement('div');
        overlay.className = 'highlightLayer';
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '5';

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayer);
        pageContainer.appendChild(overlay);

        // Ensure pdf.js viewer CSS is loaded
        (function ensurePdfViewerCss(){
          const id = 'pdfjs-viewer-css-cdn';
          if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/web/pdf_viewer.css';
            document.head.appendChild(link);
          }
        })();

        console.log(`Page ${pageNumber} rendered successfully`);
        
        // Only update state if not cancelled
        if (!cancelled) {
          setRenderedPages(prev => {
            const next = new Set(prev);
            next.add(pageNumber);
            return next;
          });
          setPageElements(prev => {
            const next = new Map(prev);
            // No need to remove old element here, we replaced the map in effect cleanup
            // But good to be safe if we weren't clearing map
            next.set(pageNumber, pageContainer);
            pageElementsRef.current = next;
            return next;
          });
          setOverlayLayers(prev => {
            const next = new Map(prev);
            next.set(pageNumber, overlay);
            overlayLayersRef.current = next;
            return next;
          });
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (!cancelled) {
          console.error(`Page ${pageNumber} rendering error:`, err);
        }
      }
    };

    const renderAllPages = async () => {
      const force = viewportVersion > 0;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        await renderPage(i, force);
      }

      const r = await loadRangy();
      if (r && !cancelled) {
        appliersRef.current.A = r.createClassApplier('pdf-highlight', { elementTagName: 'mark' });
        appliersRef.current.B = r.createClassApplier('pdf-highlight-alt', { elementTagName: 'mark' });
      }
    };

    // Allow refs to attach before measuring width
    const id = window.requestAnimationFrame(() => {
      renderAllPages();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, viewportVersion]);

  useEffect(() => {
    if (!pdfDoc) return;

    const updateScale = () => {
      setViewportVersion((prev) => prev + 1);
    };

    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, [pdfDoc]);

  // Highlight/search helpers
  const highlightRecordsRef = useRef<any[]>([]);
  const pendingScrollRef = useRef<string | null>(null);
  const activeHighlightRef = useRef<HTMLElement | null>(null);

  function getTextNodesIn(root: Element) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes: Node[] = [];
    let n: Node | null; while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function buildIndex(nodes: Node[]) {
    const map: { node: Node; start: number; end: number }[] = [];
    let acc = '';
    for (const node of nodes) {
      const start = acc.length;
      const text = node.nodeValue || '';
      acc += text;
      map.push({ node, start, end: start + text.length });
    }
    return { text: acc, map };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function indexToDomRange(idxStart: number, idxEnd: number, map: any[]) {
    function locate(idx: number) {
      for (const e of map) { if (idx >= e.start && idx <= e.end) { return { node: e.node, offset: idx - e.start }; } }
      return null;
    }
    const a = locate(idxStart);
    const b = locate(idxEnd);
    if (!a || !b) return null;
    const r = rangyLib ? rangyLib.createRange() : document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function patternFromQueryLiteralFlexible(q: string) {
    const rawParts = q.trim().split(/\s+/).filter(Boolean);
    if (!rawParts.length) return '';

    const HYPHENS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212';
    const HYPHEN_CLASS = `[${HYPHENS}]`;
    const GAP = `(?:|[\\s\\u00A0]+|\\s*${HYPHEN_CLASS}\\s*)`;

    const SUP_DIGITS = '0-9\\u2070\\u00B2\\u00B3\\u2074-\\u2079';
    const DIGIT_CLASS = `[${SUP_DIGITS}]+`;
    const LBRACK = `[\\[\\uFF3B\\u301A]`;
    const RBRACK = `[\\]\\uFF3D\\u301B]`;
    const CITATION_PATTERN = `${LBRACK}\\s*${DIGIT_CLASS}(?:\\s*,\\s*${DIGIT_CLASS})*\\s*${RBRACK}`;

    const parts = rawParts.map(tok => /^\[\s*\d+(?:\s*,\s*\d+)*\s*\]$/.test(tok) ? CITATION_PATTERN : escapeRegExp(tok));
    return parts.join(GAP);
  }

  function clearHighlights() {
    overlayLayers.forEach(layer => { while (layer.firstChild) layer.removeChild(layer.firstChild); });
    highlightRecordsRef.current = [];
  }

  // Coordinates: X in [0,1]; Y as n + [0,1) (n = 1-based page number)
  function coordsPageEncodedY(rng: Range, pageEl: HTMLElement, pageNum: number) {
    const native: Range = (rng as any).nativeRange || rng;
    const rect = native.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();

    const fx = (rect.left - pageRect.left) / pageRect.width;
    const fx2 = (rect.right - pageRect.left) / pageRect.width;
    let fy = (rect.top - pageRect.top) / pageRect.height;
    let fy2 = (rect.bottom - pageRect.top) / pageRect.height;

    // Keep fractional Y in [0, 0.999]
    fy = Math.min(Math.max(fy, 0), 0.999);
    fy2 = Math.min(Math.max(fy2, 0), 0.999);

    return {
      positionStartX: +fx.toFixed(3),
      positionStartY: +(pageNum + fy).toFixed(3),
      positionEndX: +fx2.toFixed(3),
      positionEndY: +(pageNum + fy2).toFixed(3),
    };
  }

  function drawRectOnPage(pageNum: number, startX: number, startY: number, endX: number, endY: number) {
    const overlay = overlayLayers.get(pageNum);
    const pageContainer = pageElements.get(pageNum);
    if (!overlay || !pageContainer) return;

    const pageRect = pageContainer.getBoundingClientRect();
    const widthPx = pageRect.width;
    const heightPx = pageRect.height;

    const left = Math.max(0, Math.min(1, startX)) * widthPx;
    const top = Math.max(0, Math.min(0.999, startY - pageNum)) * heightPx;
    const right = Math.max(0, Math.min(1, endX)) * widthPx;
    const bottom = Math.max(0, Math.min(0.999, endY - pageNum)) * heightPx;

    const rect = document.createElement('div');
    rect.className = 'pdf-hit';
    // Set positioning styles only - let CSS handle the visual styles
    rect.style.position = 'absolute';
    rect.style.left = `${Math.min(left, right)}px`;
    rect.style.top = `${Math.min(top, bottom)}px`;
    rect.style.width = `${Math.abs(right - left)}px`;
    rect.style.height = `${Math.abs(bottom - top)}px`;

    overlay.appendChild(rect);
    return rect;
  }

  function renderBackendHighlights(records: any[], clearOverlayOnly = false) {
    if (!records || !records.length) return;
    // Clear overlay layers but preserve highlightRecordsRef if we're just adding overlays
    if (clearOverlayOnly) {
      overlayLayers.forEach(layer => { while (layer.firstChild) layer.removeChild(layer.firstChild); });
    } else {
      clearHighlights();
      // Restore records after clearing
      highlightRecordsRef.current = records;
    }
    records.forEach(rec => {
      if (rec.rangeType !== 'text') return;
      const p = rec.rangePage;
      drawRectOnPage(p, rec.positionStartX, rec.positionStartY, rec.positionEndX, rec.positionEndY);
    });
  }

  function clearAllHighlights() {
    const allHighlighted = document.querySelectorAll('.pdf-hit.highlighted, mark.pdf-highlight.highlighted, mark.pdf-highlight-alt.highlighted');
    allHighlighted.forEach((el) => {
      el.classList.remove('highlighted');
      (el as HTMLElement).style.removeProperty('box-shadow');
      (el as HTMLElement).style.removeProperty('z-index');
    });
    activeHighlightRef.current = null;
  }

  function highlightSentence(element: HTMLElement) {
    console.log('[Highlight] Highlighting element:', element, 'tagName:', element.tagName, 'className:', element.className);
    element.classList.add('highlighted');
    element.style.setProperty('box-shadow', '0 0 0 3px rgba(246, 162, 5, 0.89)', 'important');
    element.style.setProperty('z-index', '25', 'important');
  }

  function scrollToMatchFragment(fragment: string, scaffoldIdx?: number) {
    const list = highlightRecordsRef.current || [];
    
    if (!list.length) { 
      pendingScrollRef.current = fragment; 
      return; 
    }
    
    if (!containerRef.current) {
      return;
    }
    
    let rec: any = null;
    
    // Strategy 1: Direct index matching (most accurate)
    // Each scaffold corresponds to a query, and we want the first match of that query
    if (typeof scaffoldIdx === 'number' && scaffoldIdx >= 0) {
      // Get unique queries in order (as they appear in mockQueries)
      const seenQueries = new Set<string>();
      const orderedQueries: string[] = [];
      for (const r of list) {
        if (r.fragment && !seenQueries.has(r.fragment)) {
          seenQueries.add(r.fragment);
          orderedQueries.push(r.fragment);
        }
      }
      
      if (scaffoldIdx < orderedQueries.length) {
        const targetQuery = orderedQueries[scaffoldIdx];
        rec = list.find((r: any) => r.fragment === targetQuery);
      } else if (scaffoldIdx < list.length) {
        rec = list[scaffoldIdx];
      }
    }
    
    // Strategy 2: Text matching (fallback)
    if (!rec && fragment) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const target = norm(fragment);
      const targetCleaned = target.replace(/…/g, '').trim();
      
      rec = list.find((r: any) => {
        if (!r.fragment) return false;
        const pdfFrag = norm(r.fragment);
        const pdfFragCleaned = pdfFrag.replace(/…/g, '').trim();
        const pdfFirst50 = pdfFragCleaned.substring(0, 50);
        const targetFirst50 = targetCleaned.substring(0, 50);
        const pdfFirst100 = pdfFragCleaned.substring(0, 100);
        const targetFirst100 = targetCleaned.substring(0, 100);
        
        // Direct match
        if (pdfFrag.includes(target) || target.includes(pdfFrag)) return true;
        // Cleaned match
        if (pdfFragCleaned.includes(targetCleaned) || targetCleaned.includes(pdfFragCleaned)) return true;
        // First 50 chars match
        if (pdfFirst50 && targetFirst50 && pdfFirst50.length >= 30 && 
            (pdfFirst50.includes(targetFirst50) || targetFirst50.includes(pdfFirst50))) return true;
        // First 100 chars match
        if (pdfFirst100 && targetFirst100 && pdfFirst100.length >= 50 &&
            (pdfFirst100.includes(targetFirst100) || targetFirst100.includes(pdfFirst100))) return true;
        
        return false;
      });
    }
    
    if (!rec) {
      return;
    }
    
    const pageEl = pageElements.get(rec.rangePage);
    if (!pageEl) {
      return;
    }
    
    // Scroll to center highlight in viewport
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerHeight = containerRect.height;
    const pageHeight = pageEl.clientHeight;
    const highlightTop = (rec.positionStartY - rec.rangePage) * pageHeight;
    const absoluteTop = pageEl.offsetTop + highlightTop;
    const highlightHeight = (rec.positionEndY - rec.positionStartY) * pageHeight;
    const highlightCenter = absoluteTop + (highlightHeight / 2);
    const scrollTarget = highlightCenter - (containerHeight / 2);
    containerRef.current.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
    
    setTimeout(() => {
      console.log('[Highlight] Looking for highlight on page:', rec.rangePage, 'scaffoldIdx:', scaffoldIdx);
      const overlay = overlayLayers.get(rec.rangePage);
      if (!overlay || !pageEl) {
        console.warn('[Highlight] Overlay or pageEl not found');
        return;
      }
      
      const currentPageRect = pageEl.getBoundingClientRect();
      const currentPageHeight = pageEl.clientHeight;
      const currentPageWidth = pageEl.clientWidth;
      
      // Find highlights in overlay or textLayer
      const overlayHighlights = Array.from(overlay.querySelectorAll('.pdf-hit')) as HTMLElement[];
      const textLayer = pageEl.querySelector('.textLayer');
      const textHighlights = textLayer ? Array.from(textLayer.querySelectorAll('mark.pdf-highlight, mark.pdf-highlight-alt')) as HTMLElement[] : [];
      const highlights = overlayHighlights.length > 0 ? overlayHighlights : textHighlights;
      console.log('[Highlight] Found', highlights.length, 'highlights on page', rec.rangePage, '(overlay:', overlayHighlights.length, ', text:', textHighlights.length, ')');
      
      const matchingHighlights: HTMLElement[] = [];
      
      // Strategy 1: Match by fragment text
      if (rec.fragment) {
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const targetFragment = norm(rec.fragment);
        const targetPrefix = targetFragment.substring(0, 50);
        
        highlights.forEach((el, idx) => {
          if (el.tagName.toLowerCase() === 'mark') {
            const elText = norm(el.textContent || '');
            if (elText.includes(targetFragment) || 
                targetFragment.includes(elText) ||
                (targetPrefix.length >= 20 && elText.includes(targetPrefix)) ||
                (targetPrefix.length >= 20 && targetFragment.includes(elText.substring(0, 50)))) {
              matchingHighlights.push(el);
              console.log('[Highlight] Found matching mark element by text, index:', idx, 'text:', elText.substring(0, 50));
            }
          } else {
            // Coordinate matching for .pdf-hit elements
            const expectedTop = (rec.positionStartY - rec.rangePage) * currentPageHeight;
            const expectedLeft = rec.positionStartX * currentPageWidth;
            const rect = el.getBoundingClientRect();
            const elTop = rect.top - currentPageRect.top;
            const elLeft = rect.left - currentPageRect.left;
            const distance = Math.sqrt(Math.pow(elTop - expectedTop, 2) + Math.pow(elLeft - expectedLeft, 2));
            if (distance < 150) {
              matchingHighlights.push(el);
              console.log('[Highlight] Found .pdf-hit by coordinates, distance:', distance, 'index:', idx);
            }
          }
        });
      }
      
      // Strategy 2: Match by coordinates if no text matches
      if (matchingHighlights.length === 0 && typeof scaffoldIdx === 'number' && scaffoldIdx >= 0) {
        const expectedTop = (rec.positionStartY - rec.rangePage) * currentPageHeight;
        const expectedLeft = rec.positionStartX * currentPageWidth;
        const expectedBottom = (rec.positionEndY - rec.rangePage) * currentPageHeight;
        
        highlights.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          const elTop = rect.top - currentPageRect.top;
          const elLeft = rect.left - currentPageRect.left;
          const elBottom = rect.bottom - currentPageRect.top;
          const overlapsVertically = (elTop <= expectedBottom && elBottom >= expectedTop);
          const horizontalDistance = Math.abs(elLeft - expectedLeft);
          if (overlapsVertically && horizontalDistance < 200) {
            matchingHighlights.push(el);
            console.log('[Highlight] Found by coordinate overlap, index:', idx);
          }
        });
        
        if (matchingHighlights.length === 0 && scaffoldIdx < highlights.length) {
          matchingHighlights.push(highlights[scaffoldIdx]);
          console.log('[Highlight] Using index-based fallback, scaffoldIdx:', scaffoldIdx);
        }
      }
      
      clearAllHighlights();
      if (matchingHighlights.length > 0) {
        console.log('[Highlight] Found', matchingHighlights.length, 'matching highlights, adding box-shadow');
        matchingHighlights.forEach((el) => highlightSentence(el));
        activeHighlightRef.current = matchingHighlights[0];
      } else {
        console.warn('[Highlight] No matching highlight found. Total highlights:', highlights.length, 'scaffoldIdx:', scaffoldIdx);
      }
    }, 300);
  }

  function highlightInLayer(layer: Element, query: string, applier: any) {
    const nodes = getTextNodesIn(layer);
    if (!nodes.length) return 0;
    const { text, map } = buildIndex(nodes);

    const flags = 'gius';
    const pattern = patternFromQueryLiteralFlexible(query);
    if (!pattern) return 0;

    let re: RegExp;
    try { re = new RegExp(pattern, flags); }
    catch { return 0; }

    const pageEl = layer.closest('.page') as HTMLElement | null;
    const pageNum = pageEl ? parseInt(pageEl.dataset.page || '1', 10) : 1;

    let count = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rng: any = indexToDomRange(start, end, map);
      if (!rng) { if (m[0].length === 0) re.lastIndex++; continue; }

      try { applier.applyToRange(rng); } catch {}

      if (pageEl) {
        const coords = coordsPageEncodedY(rng, pageEl, pageNum);
        highlightRecordsRef.current.push({
          rangeType: 'text',
          rangePage: pageNum,
          rangeStart: start,
          rangeEnd: end,
          fragment: m[0],
          ...coords,
        });
      }

      try { rng.detach?.(); } catch {}
      count++;
      if (m[0].length === 0) re.lastIndex++;
    }
    return count;
  }

  // When all pages are rendered, fetch queries, highlight, and report coords
  useEffect(() => {
    if (!pdfDoc) return;
    const allRendered = renderedPages.size === pdfDoc.numPages && pdfDoc.numPages > 0;
    if (!allRendered) return;

    (async () => {
      // Strategy A: Server sends sentences → search locally → highlight → report coords
      try {
        if (!appliersRef.current.A || !appliersRef.current.B) {
          const r = await loadRangy();
          if (r) {
            appliersRef.current.A = r.createClassApplier('pdf-highlight', { elementTagName: 'mark' });
            appliersRef.current.B = r.createClassApplier('pdf-highlight-alt', { elementTagName: 'mark' });
          }
        }

        const qRes = await fetch('/api/queries');
        if (!qRes.ok) { clearHighlights(); return; }
        const { queries } = await qRes.json();
        const list: string[] = Array.isArray(queries) ? queries : [];

        clearHighlights();
        const layers = Array.from(containerRef.current!.querySelectorAll('.textLayer')) as Element[];
        let total = 0;
        layers.forEach(layer => {
          list.forEach((q, i) => {
            const applier = (i % 2 === 0) ? appliersRef.current.A : appliersRef.current.B;
            if (applier && q && q.trim()) total += highlightInLayer(layer, q, applier);
          });
        });

        const report = highlightRecordsRef.current || [];
        if (report.length) {
          try { await fetch('/api/highlight-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); } catch {}
          // Strategy A uses textLayer mark elements, not overlay
        }
        console.log(`Local search highlighted ${total} match(es) across ${layers.length} page(s).`);
      } catch {
        // Strategy B: Server returns coordinates directly
        try {
          const res = await fetch('/api/mock-highlights');
          if (res.ok) {
            const data = await res.json();
            renderBackendHighlights(data);
          } else {
            clearHighlights();
          }
        } catch {
          clearHighlights();
        }
      }
    })();
  }, [pdfDoc, renderedPages]);

  // Handle external scroll requests
  useEffect(() => {
    if (!scrollToFragment) return;
    const id = window.setTimeout(() => {
      try { scrollToMatchFragment(scrollToFragment, scaffoldIndex); } catch {}
    }, 100);
    return () => window.clearTimeout(id);
  }, [scrollToFragment, scaffoldIndex, renderedPages]);

  // Handle pending scroll requests after highlighting completes
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    if ((highlightRecordsRef.current || []).length === 0) return;
    const frag = pendingScrollRef.current;
    pendingScrollRef.current = null;
    scrollToMatchFragment(frag!, scaffoldIndex);
  }, [renderedPages, scaffoldIndex]);

  if (!file) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500">Please upload a PDF file to preview content</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center">
          <p className="text-red-600 mb-2">PDF loading failed</p>
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200">

      {/* PDF content area */}
      <div 
        ref={containerRef}
        style={{ 
          height: '800px',
          overflowY: 'scroll',
          overflowX: 'hidden',
          padding: '16px'
        }}
      >
        <div>
          {Array.from({ length: pdfDoc?.numPages || 0 }, (_, index) => {
            const pageNumber = index + 1;
            const pageContainer = pageElements.get(pageNumber);
            
            return (
              <div key={pageNumber} className="flex flex-col items-center mb-4">
                {pageContainer ? (
                  <div ref={(el) => {
                    if (el && pageContainer) {
                      // Clear content if it doesn't contain the current pageContainer
                      if (!el.contains(pageContainer)) {
                        el.replaceChildren(pageContainer);
                      }
                    }
                  }} />
                ) : (
                  <div className="flex items-center justify-center h-32 w-full bg-gray-100 rounded">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}