'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react';

// Dynamic import PDF.js to avoid server-side rendering issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rangyLib: any = null;

/**
 * Loads PDF.js library from global window object (injected via CDN in layout.tsx)
 * Returns the pdfjsLib instance for PDF rendering operations
 */
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

/**
 * Dynamically loads Rangy library and class applier module for text selection and highlighting
 * Returns the initialized Rangy instance for creating text ranges and applying CSS classes
 */
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
  file?: File | null;
  url?: string | null;  // PDF URL from Supabase Storage
  onTextExtracted?: (text: string) => void;
  // External search input: a sentence or multiple phrases to highlight across the rendered PDF
  searchQueries?: string | string[];
  // Scaffolds array with annotation_id and fragment mapping
  scaffolds?: Array<{
    id: string;  // annotation_id
    fragment: string;
    history?: Array<{
      ts: number;
      action: string;
      new_text?: string;
    }>;
  }>;
  // Request scroll to the first highlight matching this fragment (case-insensitive substring)
  scrollToFragment?: string;
  // Scaffold index for direct matching (0-based, Card 1 -> index 0)
  scaffoldIndex?: number;
  // Session ID for mapping fragments to annotation_version_id
  sessionId?: string | null;
}

export default function PdfPreview({ file, url, searchQueries, scaffolds, scrollToFragment, scaffoldIndex, sessionId }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Debug logging
  useEffect(() => {
    console.log('[PdfPreview] Props received:', {
      hasUrl: !!url,
      url: url,
      hasFile: !!file,
      fileName: file?.name,
    });
  }, [file, url]);
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
  
  // Fragment to annotation_id mapping
  const fragmentToAnnotationIdRef = useRef<Map<string, string>>(new Map());
  
  // Build fragment -> annotation_id mapping from scaffolds
  useEffect(() => {
    if (scaffolds && Array.isArray(scaffolds)) {
      const mapping = new Map<string, string>();
      scaffolds.forEach((scaffold) => {
        if (scaffold.id && scaffold.fragment) {
          // Normalize fragment for matching (lowercase, trim)
          const normalizedFragment = scaffold.fragment.toLowerCase().trim();
          mapping.set(normalizedFragment, scaffold.id);
          // Also store original fragment as key for exact match
          mapping.set(scaffold.fragment, scaffold.id);
        }
      });
      fragmentToAnnotationIdRef.current = mapping;
      console.log('[PdfPreview] Built fragment -> annotation_id mapping:', Array.from(mapping.entries()).slice(0, 3));
    }
  }, [scaffolds]);

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
    if (!file && !url) {
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

        let pdf;
        if (url) {
          // Load PDF from URL
          console.log('[PdfPreview] Loading PDF from URL:', url);
          try {
            // Add CORS and other options for loading from external URL
            pdf = await pdfjs.getDocument({ 
              url,
              httpHeaders: {},
              withCredentials: false,
              // Disable worker for URL loading if needed
            }).promise;
            console.log('[PdfPreview] PDF document loaded from URL successfully');
          } catch (urlError: any) {
            console.error('[PdfPreview] Error loading PDF from URL:', urlError);
            console.error('[PdfPreview] URL was:', url);
            throw urlError;
          }
        } else if (file) {
          // Load PDF from File object
          console.log('[PdfPreview] Loading PDF from File:', file.name);
          const arrayBuffer = await file.arrayBuffer();
          pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          console.log('[PdfPreview] PDF document loaded from File successfully');
        } else {
          console.warn('[PdfPreview] No file or URL provided');
          return;
        }
        
        if (!cancelled) {
          console.log('[PdfPreview] PDF loaded successfully:', pdf);
          console.log('[PdfPreview] PDF pages:', pdf.numPages);
          setPdfDoc(pdf);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error('[PdfPreview] PDF loading error:', err);
        console.error('[PdfPreview] Error details:', {
          message: err?.message,
          name: err?.name,
          stack: err?.stack,
          url: url,
          hasFile: !!file,
        });
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
  }, [file, url]);

  /**
   * Calculates the optimal scale factor for PDF pages based on container width
   * Ensures pages fit within the viewport while maintaining readability
   * @param baseWidth - The base width of the PDF page at scale 1
   * @returns Scale factor between minScale (1) and maxScale (1.5)
   */
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

    /**
     * Renders a single PDF page with three layers: Canvas (image), Text Layer (selectable text), and Overlay (highlights)
     * Creates the page container, renders PDF content, extracts text, and sets up layers for interaction
     * @param pageNumber - 1-based page number to render
     * @param force - If true, re-render even if page already exists
     */
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

    /**
     * Renders all pages of the PDF document sequentially
     * Also initializes Rangy class appliers for text highlighting after all pages are rendered
     */
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

    /**
     * Updates the viewport version to trigger re-rendering of all pages when window is resized
     * This ensures PDF pages scale correctly to fit the new container size
     */
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

  /**
   * Extracts all text nodes from a DOM element using TreeWalker
   * Used to build a searchable text index for highlighting
   * @param root - The root element to traverse
   * @returns Array of text nodes found in the element tree
   */
  function getTextNodesIn(root: Element) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes: Node[] = [];
    let n: Node | null; while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  /**
   * Builds a character index mapping from text nodes to their positions in the concatenated text
   * Creates a map that allows converting character positions back to DOM nodes and offsets
   * @param nodes - Array of text nodes to index
   * @returns Object with concatenated text string and mapping array for position lookups
   */
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

  /**
   * Converts character index positions to a DOM Range object
   * Uses the index map to locate the corresponding text nodes and create a selection range
   * @param idxStart - Starting character index in the concatenated text
   * @param idxEnd - Ending character index in the concatenated text
   * @param map - Index mapping array from buildIndex()
   * @returns DOM Range object or null if positions are invalid
   */
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

  /**
   * Escapes special regex characters in a string to make it safe for use in RegExp
   * @param s - String to escape
   * @returns Escaped string safe for regex pattern matching
   */
  function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * Generates a flexible regex pattern from a query string to handle PDF text quirks
   * Handles missing spaces, hyphens, merged words (e.g., "A version" -> "aversion"), and citations
   * @param q - Query string to convert to regex pattern
   * @returns Regex pattern string that can match text with spacing variations
   */
  function patternFromQueryLiteralFlexible(q: string) {
    const rawParts = q.trim().split(/\s+/).filter(Boolean);
    if (!rawParts.length) return '';

    const HYPHENS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212';
    const HYPHEN_CLASS = `[${HYPHENS}]`;
    // GAP now allows: nothing (words directly connected), spaces, or hyphens
    // This handles PDF text layers where words may be concatenated without spaces
    const GAP = `(?:|[\\s\\u00A0]*|\\s*${HYPHEN_CLASS}\\s*)`;

    const SUP_DIGITS = '0-9\\u2070\\u00B2\\u00B3\\u2074-\\u2079';
    const DIGIT_CLASS = `[${SUP_DIGITS}]+`;
    const LBRACK = `[\\[\\uFF3B\\u301A]`;
    const RBRACK = `[\\]\\uFF3D\\u301B]`;
    const CITATION_PATTERN = `${LBRACK}\\s*${DIGIT_CLASS}(?:\\s*,\\s*${DIGIT_CLASS})*\\s*${RBRACK}`;

    // Handle single-letter words that might be merged with next word in PDF
    // e.g., "A version" might appear as "aversion" in PDF text
    const parts: string[] = [];
    for (let i = 0; i < rawParts.length; i++) {
      const tok = rawParts[i];
      if (/^\[\s*\d+(?:\s*,\s*\d+)*\s*\]$/.test(tok)) {
        parts.push(CITATION_PATTERN);
      } else if (tok.length === 1 && /^[a-zA-Z]$/.test(tok) && i < rawParts.length - 1) {
        // Single letter word: allow it to be merged with next word or have space
        // e.g., "A version" -> match "A version", "aversion", "Aversion"
        const nextTok = rawParts[i + 1];
        const escapedLetter = escapeRegExp(tok);
        const escapedNext = escapeRegExp(nextTok);
        // Create pattern that matches:
        // 1. "A version" (with space) - (?:A[\s\u00A0]+)version
        // 2. "aversion" (merged, lowercase) - aversion
        // 3. "Aversion" (merged, uppercase) - Aversion
        // Use case-insensitive matching, so pattern: (?:[Aa](?:[\s\u00A0]+|))?version
        const letterLower = tok.toLowerCase();
        const letterUpper = tok.toUpperCase();
        // Match: [Aa]version OR (?:[Aa][\s\u00A0]+)version
        parts.push(`(?:[${letterLower}${letterUpper}]${escapedNext}|(?:[${letterLower}${letterUpper}]${GAP})${escapedNext})`);
        i++; // Skip next token since we've already included it
      } else {
        parts.push(escapeRegExp(tok));
      }
    }

    return parts.join(GAP);
  }

  /**
   * Clears all highlights from overlay layers and resets the highlight records array
   * Removes all visual highlights and coordinate records
   */
  function clearHighlights() {
    overlayLayers.forEach(layer => { while (layer.firstChild) layer.removeChild(layer.firstChild); });
    highlightRecordsRef.current = [];
  }

  /**
   * Converts a DOM Range to normalized page coordinates
   * X coordinates are in [0, 1] range (relative to page width)
   * Y coordinates are encoded as pageNum + fraction [0, 0.999] (e.g., page 2, 50% down = 2.5)
   * @param rng - DOM Range object representing the text selection
   * @param pageEl - The page container element for coordinate calculations
   * @param pageNum - 1-based page number
   * @returns Object with normalized position coordinates (positionStartX, positionStartY, positionEndX, positionEndY)
   */
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

  /**
   * Draws a highlight rectangle on a specific page using normalized coordinates
   * Creates a div element in the overlay layer positioned at the specified coordinates
   * @param pageNum - 1-based page number
   * @param startX - Normalized X start position [0, 1]
   * @param startY - Encoded Y start position (pageNum + fraction)
   * @param endX - Normalized X end position [0, 1]
   * @param endY - Encoded Y end position (pageNum + fraction)
   * @returns The created highlight div element or undefined if page not found
   */
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

  /**
   * Renders highlight rectangles from backend coordinate records
   * Draws highlights in the overlay layer based on saved coordinate data
   * @param records - Array of highlight coordinate records from backend
   * @param clearOverlayOnly - If true, only clear overlay without clearing highlightRecordsRef
   */
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

  /**
   * Removes the 'highlighted' class and visual indicators from all currently active highlights
   * Used to clear the active state before highlighting a new element
   */
  function clearAllHighlights() {
    const allHighlighted = document.querySelectorAll('.pdf-hit.highlighted, mark.pdf-highlight.highlighted, mark.pdf-highlight-alt.highlighted');
    allHighlighted.forEach((el) => {
      el.classList.remove('highlighted');
      (el as HTMLElement).style.removeProperty('box-shadow');
      (el as HTMLElement).style.removeProperty('z-index');
    });
    activeHighlightRef.current = null;
  }

  /**
   * Applies visual highlighting to a single element (adds box-shadow and highlighted class)
   * Used to indicate the currently active/selected highlight when scrolling to a fragment
   * @param element - The DOM element to highlight (mark or .pdf-hit)
   */
  function highlightSentence(element: HTMLElement) {
    console.log('[Highlight] Highlighting element:', element, 'tagName:', element.tagName, 'className:', element.className);
    element.classList.add('highlighted');
    element.style.setProperty('box-shadow', '0 0 0 3px rgba(246, 162, 5, 0.89)', 'important');
    element.style.setProperty('z-index', '25', 'important');
  }

  /**
   * Scrolls the PDF container to the position of a matching highlight fragment
   * Uses two strategies: direct index matching (most accurate) or text similarity matching (fallback)
   * After scrolling, finds and activates the matching highlight element with visual feedback
   * @param fragment - Text fragment to scroll to (from scaffold)
   * @param scaffoldIdx - Optional 0-based scaffold index for direct matching
   */
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

  /**
   * Searches for and highlights text in a text layer using flexible regex pattern matching
   * Applies CSS classes to matched text and records coordinates for backend storage
   * Falls back to keyword-based matching if full pattern matching fails
   * @param layer - The text layer element to search in
   * @param query - Search query string (fragment from scaffold)
   * @param applier - Rangy class applier for applying highlight CSS classes
   * @param debug - If true, logs detailed debugging information
   * @returns Number of matches found and highlighted
   */
  function highlightInLayer(layer: Element, query: string, applier: any, debug: boolean = false, annotationId?: string) {
    const nodes = getTextNodesIn(layer);
    if (!nodes.length) {
      if (debug) console.log('[PdfPreview] No text nodes in layer');
      return 0;
    }
    const { text, map } = buildIndex(nodes);

    if (debug) {
      console.log('[PdfPreview] Layer text length:', text.length);
      console.log('[PdfPreview] Layer text sample:', text.substring(0, 400));
    }

    const flags = 'gius';
    const pattern = patternFromQueryLiteralFlexible(query);
    if (!pattern) {
      console.warn('[PdfPreview] No pattern generated for query:', query.substring(0, 80));
      return 0;
    }

    if (debug) {
      console.log('[PdfPreview] Query:', query.substring(0, 100));
      console.log('[PdfPreview] Pattern:', pattern);
    }

    let re: RegExp;
    try { 
      re = new RegExp(pattern, flags);
    } catch (e) {
      console.warn('[PdfPreview] Failed to create regex for pattern:', pattern, 'error:', e);
      return 0;
    }
    
    // Test if pattern matches
    if (debug) {
      const testMatch = re.test(text);
      console.log('[PdfPreview] Pattern test match:', testMatch);
      // Reset regex after test
      re.lastIndex = 0;
      
      // Also test a simpler pattern: just the key words
      const keyWords = query.split(/\s+/).filter(w => w.length > 1 && !/^[aA]$/.test(w));
      if (keyWords.length > 0) {
        const simplePattern = keyWords.slice(0, 3).map(w => escapeRegExp(w.toLowerCase())).join('.*?');
        const simpleRe = new RegExp(simplePattern, 'gi');
        const simpleMatch = simpleRe.test(text);
        console.log('[PdfPreview] Simple key words test (first 3 words):', simpleMatch, 'words:', keyWords.slice(0, 3));
        console.log('[PdfPreview] Looking for in text:', text.toLowerCase().includes(keyWords[0].toLowerCase()) ? 'FOUND' : 'NOT FOUND', keyWords[0]);
      }
    }

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
          ...(annotationId ? { annotation_id: annotationId } : {}),
        });
      }

      try { rng.detach?.(); } catch {}
      count++;
      if (m[0].length === 0) re.lastIndex++;
    }
    
    // Fallback: If no matches found, try keyword-based matching
    // This handles cases where PDF text has words concatenated
    if (count === 0) {
      const keyWords = query.split(/\s+/)
        .filter(w => w.length > 1)
        .map(w => w.replace(/[^\w]/g, '').toLowerCase())
        .filter(w => w.length > 2); // Only words longer than 2 chars
      
      if (keyWords.length >= 2) {
        // Try to find a sequence of keywords (allowing any characters between them)
        // This matches cases like "aversion" (a+version) or "Afterreading" (After+reading)
        const keyPattern = keyWords.slice(0, Math.min(5, keyWords.length))
          .map(w => escapeRegExp(w))
          .join('.*?');
        const keyRe = new RegExp(keyPattern, 'gi');
        keyRe.lastIndex = 0;
        
        while ((m = keyRe.exec(text)) !== null) {
          const start = m.index;
          const end = start + m[0].length;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rng: any = indexToDomRange(start, end, map);
          if (!rng) { if (m[0].length === 0) keyRe.lastIndex++; continue; }

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
              ...(annotationId ? { annotation_id: annotationId } : {}),
            });
          }

          try { rng.detach?.(); } catch {}
          count++;
          if (m[0].length === 0) keyRe.lastIndex++;
        }
        
        if (count > 0 && debug) {
          console.log('[PdfPreview] Fallback keyword matching found', count, 'match(es)');
        }
      }
    }
    
    return count;
  }

  // When all pages are rendered, fetch queries, highlight, and report coords
  useEffect(() => {
    if (!pdfDoc) return;
    const allRendered = renderedPages.size === pdfDoc.numPages && pdfDoc.numPages > 0;
    if (!allRendered) return;

    (async () => {
      // Strategy A: Use fragments from props (scaffolds) → search locally → highlight → report coords
      try {
        if (!appliersRef.current.A || !appliersRef.current.B) {
          const r = await loadRangy();
          if (r) {
            appliersRef.current.A = r.createClassApplier('pdf-highlight', { elementTagName: 'mark' });
            appliersRef.current.B = r.createClassApplier('pdf-highlight-alt', { elementTagName: 'mark' });
          }
        }

        // Priority 1: Use searchQueries from props (fragments from scaffolds)
        let list: string[] = [];
        if (searchQueries) {
          if (typeof searchQueries === 'string') {
            list = [searchQueries];
            console.log('[PdfPreview] Search queries (string):', list);
          } else if (Array.isArray(searchQueries)) {
            list = searchQueries.filter(q => q && typeof q === 'string' && q.trim());
            console.log('[PdfPreview] Search queries (array):', list.length, 'fragments');
            console.log('[PdfPreview] Fragment samples (first 3):', list.slice(0, 3).map(f => f.substring(0, 100)));
          }
        }

        // Fallback: If no searchQueries provided, try fetching from API； needs to be changed to fetch from backend
        if (list.length === 0) {
          try {
            console.log('[PdfPreview] Fetching queries from API');
            const qRes = await fetch('/api/queries');
            if (qRes.ok) {
              const { queries } = await qRes.json();
              list = Array.isArray(queries) ? queries : [];
            }
          } catch (e) {
            console.warn('[PdfPreview] Failed to fetch queries from API:', e);
          }
        }

        if (list.length === 0) {
          clearHighlights();
          return;
        }

        clearHighlights();
        const layers = Array.from(containerRef.current!.querySelectorAll('.textLayer')) as Element[];
        console.log('[PdfPreview] Found', layers.length, 'text layers');
        if (layers.length > 0) {
          const firstLayerText = layers[0].textContent || '';
          console.log('[PdfPreview] First layer text sample (first 200 chars):', firstLayerText.substring(0, 200));
        }
        
        let total = 0;
        list.forEach((q, i) => {
          console.log(`[PdfPreview] Processing fragment ${i + 1}/${list.length}:`, q.substring(0, 100));
          
          // Find annotation_id for this fragment
          let annotationId: string | undefined;
          const normalizedQuery = q.toLowerCase().trim();
          annotationId = fragmentToAnnotationIdRef.current.get(normalizedQuery) || 
                         fragmentToAnnotationIdRef.current.get(q) || 
                         undefined;
          if (annotationId) {
            console.log(`[PdfPreview] Found annotation_id for fragment ${i + 1}:`, annotationId);
          } else {
            console.warn(`[PdfPreview] No annotation_id found for fragment ${i + 1}:`, q.substring(0, 50));
          }
          
          let fragmentTotal = 0;
          layers.forEach((layer, layerIdx) => {
            const applier = (i % 2 === 0) ? appliersRef.current.A : appliersRef.current.B;
            if (applier && q && q.trim()) {
              const matches = highlightInLayer(layer, q, applier, i === 0 && layerIdx === 0, annotationId);
              if (matches > 0) {
                console.log(`[PdfPreview] Found ${matches} match(es) for fragment ${i + 1} in layer ${layerIdx + 1}`);
              }
              fragmentTotal += matches;
            }
          });
          console.log(`[PdfPreview] Fragment ${i + 1} total matches: ${fragmentTotal}`);
          total += fragmentTotal;
        });

        const report = highlightRecordsRef.current || [];
        if (report.length) {
          try {
            // Format: backend expects { coords: [...] }
            // Add session_id and annotation_id to each coord item
            // Backend can use annotation_id to find current_version_id if annotation_version_id is not provided
            const coordsWithMetadata = report.map(coord => ({
              ...coord,
              session_id: sessionId || undefined,
              // annotation_id is already included in coord if found during highlighting
              // Backend will use annotation_id to find current_version_id if annotation_version_id is not provided
            }));
            const formattedReport = { coords: coordsWithMetadata };
            const response = await fetch('/api/highlight-report', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(formattedReport) 
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.warn('[PdfPreview] Failed to save highlight coords:', response.status, errorData);
            } else {
              console.log('[PdfPreview] Successfully saved', report.length, 'highlight coord(s)');
            }
          } catch (e) {
            console.warn('[PdfPreview] Error sending highlight report:', e);
          }
          // Strategy A uses textLayer mark elements, not overlay
        }
        console.log(`Local search highlighted ${total} match(es) across ${layers.length} page(s) using ${list.length} fragment(s) from scaffolds.`);
      } catch (e) {
        console.error('[PdfPreview] Error in highlight strategy A:', e);
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
  }, [pdfDoc, renderedPages, searchQueries, scaffolds]);

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

  // Debug: Log pageElements state
  // IMPORTANT: This hook must be before any early returns to maintain hooks order
  useEffect(() => {
    console.log('[PdfPreview] pageElements state:', {
      size: pageElements.size,
      pages: Array.from(pageElements.keys()),
      renderedPagesSize: renderedPages.size,
      renderedPages: Array.from(renderedPages),
      pdfDocPages: pdfDoc?.numPages,
    });
  }, [pageElements, renderedPages, pdfDoc]);

  if (!file && !url) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-500">Please upload a PDF file or provide a PDF URL to preview content</p>
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
                      // Clear and append the page container
                      if (el.children.length === 0 || !el.contains(pageContainer)) {
                        el.innerHTML = '';
                        el.appendChild(pageContainer);
                        console.log(`[PdfPreview] Attached page ${pageNumber} to DOM`);
                      }
                    }
                  }} />
                ) : (
                  <div className="flex items-center justify-center h-32 w-full bg-gray-100 rounded">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-gray-600 text-sm mt-2">Loading page {pageNumber}...</p>
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