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
  readingId?: string | null;  // Reading ID for fallback when URL fails and for RESTful API calls
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
  // Course ID for RESTful API calls
  courseId?: string | null;
}

export default function PdfPreview({ file, url, searchQueries, scaffolds, scrollToFragment, scaffoldIndex, sessionId, courseId, readingId }: PdfPreviewProps) {
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
    // If no file and no url, but readingId is provided, use readingId to fetch PDF
    if (!file && !url && !readingId) {
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
        // If no url but readingId is provided, fetch from API directly
        if (!url && readingId) {
          console.log('[PdfPreview] No URL provided, fetching PDF from API using readingId:', readingId);
          try {
            const response = await fetch(`/api/readings/${readingId}/content`);
            if (!response.ok) {
              throw new Error(`Failed to fetch reading content: ${response.status}`);
            }
            const data = await response.json();
            if (data?.content_base64) {
              // Convert base64 to File object
              const base64 = data.content_base64 as string;
              const byteCharacters = atob(base64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i += 1) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const mimeType = data?.mime_type || 'application/pdf';
              const fileName = `reading_${readingId}.pdf`;
              const blob = new Blob([byteArray], { type: mimeType });
              const fallbackFile = new File([blob], fileName, { type: mimeType });
              
              // Load PDF from File object
              const arrayBuffer = await fallbackFile.arrayBuffer();
              pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
              console.log('[PdfPreview] PDF document loaded from API successfully');
            } else {
              throw new Error('No content_base64 in API response');
            }
          } catch (apiError: any) {
            console.error('[PdfPreview] Error fetching PDF from API:', apiError);
            setError(apiError?.message || 'Failed to load PDF');
            setLoading(false);
            return;
          }
        } else if (url) {
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
            
            // Fallback: if URL fails and readingId is provided, fetch from API
            if (readingId) {
              console.log('[PdfPreview] Attempting fallback: fetching PDF from API using readingId:', readingId);
              try {
                const response = await fetch(`/api/readings/${readingId}/content`);
                if (!response.ok) {
                  throw new Error(`Failed to fetch reading content: ${response.status}`);
                }
                const data = await response.json();
                if (data?.content_base64) {
                  // Convert base64 to File object
                  const base64 = data.content_base64 as string;
                  const byteCharacters = atob(base64);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i += 1) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  const mimeType = data?.mime_type || 'application/pdf';
                  const fileName = `reading_${readingId}.pdf`;
                  const blob = new Blob([byteArray], { type: mimeType });
                  const fallbackFile = new File([blob], fileName, { type: mimeType });
                  
                  // Load PDF from File object
                  const arrayBuffer = await fallbackFile.arrayBuffer();
                  pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                  console.log('[PdfPreview] PDF document loaded from API fallback successfully');
                } else {
                  throw new Error('No content_base64 in API response');
                }
              } catch (fallbackError: any) {
                console.error('[PdfPreview] Fallback also failed:', fallbackError);
                throw urlError; // Throw original error
              }
            } else {
            throw urlError;
            }
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
  }, [file, url, readingId]);

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
    const totalLen = map?.length ? (map[map.length - 1]?.end ?? 0) : 0;

    function locateStart(idx: number) {
      // Start positions should be half-open: [start, end)
      for (const e of map) {
        if (idx >= e.start && idx < e.end) {
          const offset = idx - e.start;
          const nodeLength = e.node.textContent?.length || e.node.nodeValue?.length || 0;
          const safeOffset = Math.min(Math.max(offset, 0), nodeLength);
          return { node: e.node, offset: safeOffset };
        }
      }
      // Special-case: allow start at very end of text => last node end
      if (idx === totalLen && map?.length) {
        const last = map[map.length - 1];
        const nodeLength = last.node.textContent?.length || last.node.nodeValue?.length || 0;
        return { node: last.node, offset: nodeLength };
      }
      return null;
    }

    function locateEnd(idx: number) {
      // End positions are allowed to be exactly node end.
      for (const e of map) { 
        if (idx >= e.start && idx <= e.end) { 
          const offset = idx - e.start;
          const nodeLength = e.node.textContent?.length || e.node.nodeValue?.length || 0;
          const safeOffset = Math.min(Math.max(offset, 0), nodeLength);
          return { node: e.node, offset: safeOffset }; 
        }
      }
      // Special-case: allow end at very end of text => last node end
      if (idx === totalLen && map?.length) {
        const last = map[map.length - 1];
        const nodeLength = last.node.textContent?.length || last.node.nodeValue?.length || 0;
        return { node: last.node, offset: nodeLength };
      }
      return null;
    }

    const a = locateStart(idxStart);
    const b = locateEnd(idxEnd);
    if (!a || !b) return null;
    
    // Additional safety check: ensure offsets are within node lengths
    const aNodeLength = a.node.textContent?.length || a.node.nodeValue?.length || 0;
    const bNodeLength = b.node.textContent?.length || b.node.nodeValue?.length || 0;
    
    if (a.offset > aNodeLength || b.offset > bNodeLength) {
      console.warn('[PdfPreview] Offset exceeds node length:', {
        aOffset: a.offset,
        aNodeLength,
        bOffset: b.offset,
        bNodeLength,
        idxStart,
        idxEnd
      });
      // Clamp offsets to valid range
      a.offset = Math.min(a.offset, aNodeLength);
      b.offset = Math.min(b.offset, bNodeLength);
    }
    
    const r = rangyLib ? rangyLib.createRange() : document.createRange();
    try {
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    } catch (error) {
      console.error('[PdfPreview] Error creating range:', error, {
        aNode: a.node,
        aOffset: a.offset,
        aNodeLength,
        bNode: b.node,
        bOffset: b.offset,
        bNodeLength,
        idxStart,
        idxEnd
      });
      return null;
    }
    return r;
  }

  /**
   * Escapes special regex characters in a string to make it safe for use in RegExp
   * @param s - String to escape
   * @returns Escaped string safe for regex pattern matching
   */
  function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * Normalizes PDF text for robust matching:
   * - lowercases
   * - collapses whitespace
   * - removes/normalizes many punctuation characters (including parentheses)
   * - joins hyphenated line breaks (e.g., "inter-\nactive" -> "interactive")
   * - removes zero-width chars
   */
  function normalizeForMatch(s: string): string {
    if (!s) return '';
    const ligMap: Record<string, string> = {
      '\uFB00': 'ff',
      '\uFB01': 'fi',
      '\uFB02': 'fl',
      '\uFB03': 'ffi',
      '\uFB04': 'ffl',
      '\uFB05': 'ft',
      '\uFB06': 'st',
    };
    const greekMap: Record<string, string> = {
      'α': 'alpha',
      'β': 'beta',
      'γ': 'gamma',
      'δ': 'delta',
      'ε': 'epsilon',
      'θ': 'theta',
      'λ': 'lambda',
      'μ': 'mu',
      'π': 'pi',
      'ρ': 'rho',
      'ϱ': 'rho',
      'σ': 'sigma',
      'τ': 'tau',
      'ω': 'omega',
      'Δ': 'delta',
      'Λ': 'lambda',
      'Π': 'pi',
      'Ρ': 'rho',
      'Σ': 'sigma',
      'Ω': 'omega',
    };
    return s
      // fold accents/diacritics (e.g., naïve -> naive)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // normalize common ligatures (PDF text often uses these)
      .replace(/[\uFB00-\uFB06]/g, (m) => ligMap[m] ?? m)
      // normalize some Greek letters to ASCII words (helps with formulas)
      .replace(/[αβγδεθλμπρϱστωΔΛΠΡΣΩ]/g, (m) => (greekMap[m] ?? m).toLowerCase())
      // normalize subscripts/superscripts commonly used in formulas (e.g. σₑ, r³)
      .replace(/[\u2080-\u2089]/g, (m) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(m)))
      .replace(/[ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]/g, (m) => ({
        'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
        'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x',
      } as Record<string, string>)[m] ?? m)
      // normalize whitespace including NBSP
      .replace(/[\s\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g, ' ')
      // join hyphenated line breaks: "foo- bar" -> "foobar"
      .replace(/([a-z0-9])\s*[-\u2010\u2011\u2012\u2013\u2014\u2212]\s*([a-z0-9])/g, '$1$2')
      // remove zero-width chars
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // normalize quotes/dashes
      .replace(/[“”«»„]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(/[–—]/g, '-')
      // remove most punctuation (keep basic math operators so "x+y" still roughly searchable)
      .replace(/[()\[\]{}<>《》【】（）]/g, ' ')
      .replace(/[.,;:!?]/g, ' ')
      // math/operator symbols are highly inconsistent in PDF text extraction; treat them as separators
      .replace(/[+\-*/=^<>]/g, ' ')
      // keep digits/letters; turn others into spaces
      .replace(/[^a-z0-9\s]/g, ' ')
      // collapse spaces again
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Builds a normalized string PLUS a mapping from normalized indices -> original indices.
   * This enables robust substring search on normalized text while still creating DOM ranges on original text.
   */
  function buildNormalizedIndexWithMap(original: string) {
    const normChars: string[] = [];
    const map: number[] = []; // normIdx -> origIdx

    const pushNorm = (ch: string, origIdx: number) => {
      normChars.push(ch);
      map.push(origIdx);
    };

    const pushSpace = (origIdx: number) => {
      if (normChars.length && normChars[normChars.length - 1] !== ' ') {
        pushNorm(' ', origIdx);
      }
    };

    const ligMap: Record<string, string> = {
      '\uFB00': 'ff',
      '\uFB01': 'fi',
      '\uFB02': 'fl',
      '\uFB03': 'ffi',
      '\uFB04': 'ffl',
      '\uFB05': 'ft',
      '\uFB06': 'st',
    };
    const greekMap: Record<string, string> = {
      'α': 'alpha',
      'β': 'beta',
      'γ': 'gamma',
      'δ': 'delta',
      'ε': 'epsilon',
      'θ': 'theta',
      'λ': 'lambda',
      'μ': 'mu',
      'π': 'pi',
      'ρ': 'rho',
      'ϱ': 'rho',
      'σ': 'sigma',
      'τ': 'tau',
      'ω': 'omega',
      'Δ': 'delta',
      'Λ': 'lambda',
      'Π': 'pi',
      'Ρ': 'rho',
      'Σ': 'sigma',
      'Ω': 'omega',
    };

    const subDigitMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    };
    const subLetterMap: Record<string, string> = {
      'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
      'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x',
    };

    let i = 0;
    while (i < original.length) {
      const ch = original[i];

      // Zero-width / soft hyphen
      if (/^[\u00AD\u200B-\u200D\uFEFF]$/.test(ch)) {
        i += 1;
        continue;
      }

      // Ligatures (fi/fl/etc)
      if (/^[\uFB00-\uFB06]$/.test(ch)) {
        const rep = ligMap[ch] ?? '';
        for (const outCh of rep) pushNorm(outCh, i);
        i += 1;
        continue;
      }

      // Fold accents/diacritics to ASCII when possible (e.g., naïve -> naive)
      // Keep mapping stable by mapping all produced chars back to the same original index.
      try {
        const folded = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        if (folded && folded !== ch) {
          for (const outCh of folded) {
            if (/[A-Za-z0-9]/.test(outCh)) pushNorm(outCh.toLowerCase(), i);
            else if (/[\s\u00A0]/.test(outCh)) pushSpace(i);
          }
          i += 1;
          continue;
        }
      } catch {
        // ignore normalization errors; fall through
      }

      // Greek letters (keep as ASCII words so we can match formulas)
      if (/[αβγδεθλμπρϱστωΔΛΠΡΣΩ]/.test(ch)) {
        const rep = (greekMap[ch] ?? '').toLowerCase();
        for (const outCh of rep) pushNorm(outCh, i);
        i += 1;
        continue;
      }

      // Subscript digits/letters (e.g., σₑ)
      if (subDigitMap[ch]) {
        pushNorm(subDigitMap[ch], i);
        i += 1;
        continue;
      }
      if (subLetterMap[ch]) {
        pushNorm(subLetterMap[ch], i);
        i += 1;
        continue;
      }

      // Hyphenated line breaks: letter/digit + hyphen + whitespace + letter/digit => join (skip hyphen+spaces)
      const nextSlice = original.slice(i);
      const hyphenMatch = nextSlice.match(/^([A-Za-z0-9])\s*[-\u2010\u2011\u2012\u2013\u2014\u2212]\s*([A-Za-z0-9])/);
      if (hyphenMatch) {
        // emit first char and second char as consecutive (map them to their respective orig indices)
        const firstOrigIdx = i;
        const secondOrigIdx = i + (hyphenMatch[0].lastIndexOf(hyphenMatch[2]));
        pushNorm(hyphenMatch[1].toLowerCase(), firstOrigIdx);
        pushNorm(hyphenMatch[2].toLowerCase(), secondOrigIdx);
        i = secondOrigIdx + 1;
        continue;
      }

      // Whitespace (collapse to single space)
      if (/[\s\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Parentheses/brackets -> space
      if (/[()\[\]{}<>《》【】（）]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Common punctuation -> space
      if (/[.,;:!?]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Quotes/dashes normalization
      if (/[“”«»„]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }
      if (/[‘’‚]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }
      if (/[–—]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Alnum
      if (/[A-Za-z0-9]/.test(ch)) {
        pushNorm(ch.toLowerCase(), i);
        i += 1;
        continue;
      }
      // Operators are highly inconsistent in PDF text extraction; treat as separators
      if (/[+\-*/=^<>]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Superscript digits: ⁰¹²³⁴⁵⁶⁷⁸⁹ and ² ³
      if (/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/.test(ch)) {
        const superscriptMap: Record<string, string> = {
          '\u2070': '0',
          '\u00B9': '1',
          '\u00B2': '2',
          '\u00B3': '3',
          '\u2074': '4',
          '\u2075': '5',
          '\u2076': '6',
          '\u2077': '7',
          '\u2078': '8',
          '\u2079': '9',
        };
        pushNorm((superscriptMap[ch] ?? ' ').toLowerCase(), i);
        i += 1;
        continue;
      }

      // Common math operators/symbols
      if (/[×∙·∗]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }
      if (/[÷]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }
      if (/[≤]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }
      if (/[≥]/.test(ch)) {
        pushSpace(i);
        i += 1;
        continue;
      }

      // Other symbols -> space
      pushSpace(i);
      i += 1;
    }

    // Collapse spaces and trim while keeping a 1:1 mapping (crucial for accurate DOM range creation).
    const outChars: string[] = [];
    const outMap: number[] = [];
    for (let k = 0; k < normChars.length; k += 1) {
      const ch = normChars[k];
      const origIdx = map[k] ?? 0;
      if (ch === ' ') {
        // collapse multiple spaces and avoid leading spaces
        if (outChars.length === 0) continue;
        if (outChars[outChars.length - 1] === ' ') continue;
        outChars.push(' ');
        outMap.push(origIdx);
      } else {
        outChars.push(ch);
        outMap.push(origIdx);
      }
    }
    // trim trailing space
    if (outChars.length && outChars[outChars.length - 1] === ' ') {
      outChars.pop();
      outMap.pop();
    }

    return { normalized: outChars.join(''), normToOrig: outMap };
  }

  function mapNormRangeToOrig(normStart: number, normEnd: number, normToOrig: number[], fallbackTextLength: number) {
    const s = (normStart >= 0 && normStart < normToOrig.length) ? normToOrig[normStart] : -1;
    const e = (normEnd - 1 >= 0 && normEnd - 1 < normToOrig.length) ? normToOrig[normEnd - 1] : -1;
    if (s === -1 || e === -1) return null;
    // end is inclusive in mapping; convert to exclusive index
    return { start: s, end: Math.min(e + 1, fallbackTextLength) };
  }

  function buildCompactNormalizedIndexWithMap(original: string) {
    const { normalized, normToOrig } = buildNormalizedIndexWithMap(original);
    const compactChars: string[] = [];
    const compactMap: number[] = [];
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      if (ch === ' ') continue;
      compactChars.push(ch);
      compactMap.push(normToOrig[i] ?? 0);
    }
    return { normalized: compactChars.join(''), normToOrig: compactMap };
  }

  function buildAlnumIndexWithMap(original: string) {
    const { normalized, normToOrig } = buildNormalizedIndexWithMap(original);
    const alnumChars: string[] = [];
    const alnumMap: number[] = [];
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      if (!/[a-z0-9]/.test(ch)) continue;
      alnumChars.push(ch);
      alnumMap.push(normToOrig[i] ?? 0);
    }
    return { normalized: alnumChars.join(''), normToOrig: alnumMap };
  }

  function findBestNormSpan(haystack: string, query: string) {
    if (!haystack || !query) return null;

    const fullIdx = haystack.indexOf(query);
    if (fullIdx !== -1) return { start: fullIdx, end: fullIdx + query.length, method: 'full' as const };

    const words = query.split(' ').filter(Boolean);
    if (words.length < 3) {
      // No-spaces query (e.g., alnum compact). Try anchors by fixed-length chunks.
      if (query.length < 20) return null;
      const k = Math.min(25, Math.max(10, Math.floor(query.length / 3)));
      const startCand = query.slice(0, k);
      const endCand = query.slice(-k);
      const sIdx = haystack.indexOf(startCand);
      if (sIdx === -1) return null;
      const eIdx = haystack.indexOf(endCand, sIdx + startCand.length);
      if (eIdx === -1) return null;
      const spanEnd = eIdx + endCand.length;
      if (spanEnd <= sIdx) return null;
      return { start: sIdx, end: spanEnd, method: 'anchors' as const };
    }

    const startNs = [40, 30, 20, 15, 12, 10, 8, 6, 5, 3].filter(n => n <= words.length);
    const endNs = [40, 30, 20, 15, 12, 10, 8, 6, 5, 3].filter(n => n <= words.length);
    const startCands = startNs.map(n => words.slice(0, n).join(' '));
    const endCands = endNs.map(n => words.slice(words.length - n).join(' '));

    let best: { start: number; end: number; method: 'anchors' } | null = null;
    for (const sCand of startCands) {
      const sIdx = haystack.indexOf(sCand);
      if (sIdx === -1) continue;
      const searchFrom = sIdx + Math.max(1, sCand.length);

      for (const eCand of endCands) {
        const eIdx = haystack.indexOf(eCand, searchFrom);
        if (eIdx === -1) continue;
        const spanEnd = eIdx + eCand.length;
        if (spanEnd <= sIdx) continue;
        // Avoid pathological spans (e.g., common tokens matching far away)
        if (spanEnd - sIdx > 20000) continue;

        // Choose the tightest span to avoid accidentally highlighting too much.
        if (!best || (spanEnd - sIdx) < (best.end - best.start)) {
          best = { start: sIdx, end: spanEnd, method: 'anchors' };
        }
      }
    }

    return best;
  }

  function splitEllipsisSegments(raw: string): string[] {
    return (raw || '')
      .split(/\.{3,}|…/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  
  function makeAnchorCandidates(segment: string, side: 'prefix' | 'suffix'): string[] {
    const norm = normalizeForMatch(segment);
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      const v = (s || '').trim();
      if (!v) return;
      if (v.length < 12) return; // too ambiguous
      if (seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };
    
    // Prefer word-based anchors
    const words = norm.split(' ').filter(Boolean);
    const maxWords = Math.min(words.length, 24);
    const ns = [maxWords, 20, 16, 12, 10, 8, 6, 5].filter((n) => n >= 5 && n <= maxWords);
    for (const n of ns) {
      const cand = side === 'prefix' ? words.slice(0, n).join(' ') : words.slice(words.length - n).join(' ');
      push(cand);
    }
    
    // Fallback: character-based anchors (useful when PDF merges tokens oddly)
    const lens = [140, 120, 100, 80, 60, 45, 30];
    for (const L of lens) {
      if (norm.length < L) continue;
      const cand = side === 'prefix' ? norm.slice(0, L) : norm.slice(-L);
      push(cand);
    }
    return out;
  }

  /**
   * For "ellipsis" fragments (containing .../…), highlight the entire span between the prefix and suffix.
   * This is used when scaffolds compress a longer excerpt with an ellipsis, but we still want to
   * visually cover the omitted middle section in the PDF (often across a page boundary).
   */
  function highlightEllipsisSpanAcrossLayers(
    layers: Element[],
    fullFragment: string,
    applier: any,
    annotationId?: string,
    debug?: boolean
  ): number {
    const segs = splitEllipsisSegments(fullFragment);
    if (segs.length < 2) return 0;
    const prefix = segs[0];
    const suffix = segs[segs.length - 1];
    if (!prefix || !suffix) return 0;

    const prefixCands = makeAnchorCandidates(prefix, 'prefix');
    const suffixCands = makeAnchorCandidates(suffix, 'suffix');
    if (!prefixCands.length || !suffixCands.length) return 0;
    
    const prefixCompactCands = makeAnchorCandidates(prefix, 'prefix')
      .map((s) => s.replace(/\s+/g, ''))
      .filter(Boolean);
    const suffixCompactCands = makeAnchorCandidates(suffix, 'suffix')
      .map((s) => s.replace(/\s+/g, ''))
      .filter(Boolean);

    const applyRangeInLayer = (
      layer: Element,
      pageNum: number,
      start: number,
      end: number,
      text: string,
      map: any[]
    ) => {
      if (end <= start) return 0;
      
      // Very large ranges can be brittle; apply in chunks to improve stability.
      const CHUNK = 3500;
      const OVERLAP = 30;
      let applied = 0;
      for (let s = start; s < end; s += (CHUNK - OVERLAP)) {
        const e = Math.min(end, s + CHUNK);
        const rng: any = indexToDomRange(s, e, map);
        if (!rng) continue;
        try {
          if (!applier) continue;
          applier.applyToRange(rng);
        } catch {
          continue;
        }
        const pageEl = layer.closest('.page') as HTMLElement | null;
        if (pageEl) {
          const coords = coordsPageEncodedY(rng, pageEl, pageNum);
          highlightRecordsRef.current.push({
            rangeType: 'text',
            rangePage: pageNum,
            rangeStart: s,
            rangeEnd: e,
            fragment: text.substring(s, e),
            queryFragment: fullFragment,
            ...coords,
            ...(annotationId ? { annotation_id: annotationId } : {}),
          });
        }
        try { rng.detach?.(); } catch {}
        applied += 1;
      }
      return applied;
    };

    // Find a good (prefix, suffix) pair such that suffix occurs AFTER prefix.
    // We choose the closest suffix after a candidate prefix, preferring minimal page distance.
    let bestPair:
      | { pLayer: number; pStart: number; pNormStart: number; sLayer: number; sEnd: number; sNormEnd: number }
      | null = null;
    const layerCache: Array<{
      layer: Element;
      pageNum: number;
      text: string;
      map: any[];
      norm: string;
      normToOrig: number[];
      compact: string;
      compactToOrig: number[];
    } | null> = new Array(layers.length).fill(null);

    const getLayerData = (idx: number) => {
      const existing = layerCache[idx];
      if (existing) return existing;
      const layer = layers[idx];
      const nodes = getTextNodesIn(layer);
      const { text, map } = buildIndex(nodes);
      const pageEl = layer.closest('.page') as HTMLElement | null;
      const pageNum = pageEl ? parseInt(pageEl.dataset.page || '1', 10) : (idx + 1);
      const { normalized: norm, normToOrig } = buildNormalizedIndexWithMap(text);
      const compactIndex = buildCompactNormalizedIndexWithMap(text);
      const data = {
        layer,
        pageNum,
        text,
        map,
        norm,
        normToOrig,
        compact: compactIndex.normalized,
        compactToOrig: compactIndex.normToOrig,
      };
      layerCache[idx] = data;
      return data;
    };

    // Ellipsis fragments often span a page boundary, but sometimes can spill a few pages.
    // Keep a moderate lookahead to avoid matching a suffix much later in the document.
    const MAX_LOOKAHEAD_PAGES = 10;
    
    const findCandSpan = (hay: string, cand: string) => {
      if (!hay || !cand) return null;
      const idx = hay.indexOf(cand);
      if (idx !== -1) return { start: idx, end: idx + cand.length, method: 'full' as const };
      return findBestNormSpan(hay, cand);
    };
    
    const findAnyPrefix = (d: NonNullable<typeof layerCache[number]>) => {
      // Try norm candidates first
      for (const pCand of prefixCands) {
        const pSpan = findCandSpan(d.norm, pCand);
        if (!pSpan) continue;
        const pOrig = mapNormRangeToOrig(pSpan.start, pSpan.end, d.normToOrig, d.text.length);
        if (!pOrig) continue;
        return { origStart: pOrig.start, normStart: pSpan.start };
      }
      // Fallback: compact (space-free) candidates
      for (const pCand of prefixCompactCands) {
        if (!pCand) continue;
        const pSpan = findCandSpan(d.compact, pCand);
        if (!pSpan) continue;
        const pOrig = mapNormRangeToOrig(pSpan.start, pSpan.end, d.compactToOrig, d.text.length);
        if (!pOrig) continue;
        return { origStart: pOrig.start, normStart: pSpan.start };
      }
      return null;
    };
    
    const findAnySuffix = (d: NonNullable<typeof layerCache[number]>) => {
      for (const sCand of suffixCands) {
        const sSpan = findCandSpan(d.norm, sCand);
        if (!sSpan) continue;
        const sOrig = mapNormRangeToOrig(sSpan.start, sSpan.end, d.normToOrig, d.text.length);
        if (!sOrig) continue;
        return { origEnd: sOrig.end, normEnd: sSpan.end };
      }
      for (const sCand of suffixCompactCands) {
        if (!sCand) continue;
        const sSpan = findCandSpan(d.compact, sCand);
        if (!sSpan) continue;
        const sOrig = mapNormRangeToOrig(sSpan.start, sSpan.end, d.compactToOrig, d.text.length);
        if (!sOrig) continue;
        return { origEnd: sOrig.end, normEnd: sSpan.end };
      }
      return null;
    };

    for (let pi = 0; pi < layers.length; pi += 1) {
      const pd = getLayerData(pi);
      const pFound = findAnyPrefix(pd);
      if (!pFound) continue;
      const pStart = pFound.origStart;
      const pNormStart = pFound.normStart;

        // Search suffix after this prefix, in this page and a few pages ahead.
        for (let si = pi; si < Math.min(layers.length, pi + MAX_LOOKAHEAD_PAGES + 1); si += 1) {
          const sd = getLayerData(si);
          const sFound = findAnySuffix(sd);
          if (!sFound) continue;
          const sEnd = sFound.origEnd;
          const sNormEnd = sFound.normEnd;

            // Enforce ordering: suffix must end after prefix start.
            if (si === pi && sNormEnd <= pNormStart + 5) {
              // Suffix hit is before prefix (or too close); keep searching.
              continue;
            }

            const score =
              (si - pi) * 1_000_000 + (si === pi ? (sNormEnd - pNormStart) : 0);
            const bestScore =
              bestPair
                ? (bestPair.sLayer - bestPair.pLayer) * 1_000_000 +
                  (bestPair.sLayer === bestPair.pLayer ? (bestPair.sNormEnd - bestPair.pNormStart) : 0)
                : Number.POSITIVE_INFINITY;
            if (score < bestScore) {
              bestPair = { pLayer: pi, pStart, pNormStart, sLayer: si, sEnd, sNormEnd };
            }
          if (bestPair && bestPair.pLayer === pi && bestPair.sLayer === si) break;
        }
      // If we found a pair on an earlier page, that's likely the right span; stop early.
      if (bestPair && bestPair.pLayer === pi) break;
    }

    // If we couldn't find a pair using per-page search, fall back to a global doc search
    // (concatenate page texts and search across boundaries). This handles cases where
    // prefix/suffix anchors themselves are split across a page boundary.
    if (!bestPair) {
      const pageDatas = layers.map((_, idx) => getLayerData(idx));
      const pageStarts: number[] = [];
      const texts: string[] = [];
      let globalAcc = '';
      for (let i = 0; i < pageDatas.length; i += 1) {
        pageStarts.push(globalAcc.length);
        const t = pageDatas[i].text || '';
        texts.push(t);
        globalAcc += t;
        // Separator between pages (not mapped to any page). Keep short to avoid huge shifts.
        globalAcc += '\n';
      }

      const globalNormIndex = buildNormalizedIndexWithMap(globalAcc);
      const globalCompactIndex = buildCompactNormalizedIndexWithMap(globalAcc);

      const findFirst = (hay: string, candList: string[]) => {
        for (const c of candList) {
          if (!c) continue;
          const idx = hay.indexOf(c);
          if (idx !== -1) return { idx, len: c.length };
        }
        return null;
      };

      // Find a prefix occurrence (try norm then compact)
      const pHitNorm = findFirst(globalNormIndex.normalized, prefixCands);
      const pHitCompact = !pHitNorm ? findFirst(globalCompactIndex.normalized, prefixCompactCands) : null;
      const pHit = pHitNorm
        ? { normStart: pHitNorm.idx, normEnd: pHitNorm.idx + pHitNorm.len, map: globalNormIndex.normToOrig }
        : pHitCompact
          ? { normStart: pHitCompact.idx, normEnd: pHitCompact.idx + pHitCompact.len, map: globalCompactIndex.normToOrig }
          : null;

      if (!pHit) {
        if (debug) {
          console.warn('[PdfPreview][EllipsisSpan] No (prefix,suffix) pair found', {
            prefixSample: prefixCands.slice(0, 3),
            suffixSample: suffixCands.slice(0, 3),
            prefixCompactSample: prefixCompactCands.slice(0, 3),
            suffixCompactSample: suffixCompactCands.slice(0, 3),
            layers: layers.length,
          });
        }
        return 0;
      }

      const pOrig = mapNormRangeToOrig(pHit.normStart, pHit.normEnd, pHit.map, globalAcc.length);
      if (!pOrig) return 0;

      // Find a suffix occurrence AFTER prefix (try norm then compact)
      const searchFromNorm = pHitNorm ? (pHitNorm.idx + pHitNorm.len) : 0;
      const searchFromCompact = pHitCompact ? (pHitCompact.idx + pHitCompact.len) : 0;

      const findSuffixAfter = (hay: string, candList: string[], from: number) => {
        for (const c of candList) {
          if (!c) continue;
          const idx = hay.indexOf(c, from);
          if (idx !== -1) return { idx, len: c.length };
        }
        return null;
      };

      const sHitNorm = pHitNorm ? findSuffixAfter(globalNormIndex.normalized, suffixCands, searchFromNorm) : null;
      const sHitCompact = !sHitNorm ? findSuffixAfter(globalCompactIndex.normalized, suffixCompactCands, searchFromCompact) : null;
      const sHit = sHitNorm
        ? { normStart: sHitNorm.idx, normEnd: sHitNorm.idx + sHitNorm.len, map: globalNormIndex.normToOrig }
        : sHitCompact
          ? { normStart: sHitCompact.idx, normEnd: sHitCompact.idx + sHitCompact.len, map: globalCompactIndex.normToOrig }
          : null;

      if (!sHit) {
        if (debug) {
          console.warn('[PdfPreview][EllipsisSpan] No (prefix,suffix) pair found (prefix hit, suffix missing)', {
            prefixSample: prefixCands.slice(0, 2),
            suffixSample: suffixCands.slice(0, 2),
            layers: layers.length,
          });
        }
        return 0;
      }

      const sOrig = mapNormRangeToOrig(sHit.normStart, sHit.normEnd, sHit.map, globalAcc.length);
      if (!sOrig) return 0;

      const globalStart = pOrig.start;
      const globalEnd = sOrig.end;
      if (globalEnd <= globalStart) return 0;

      // Apply across pages based on global offsets
      let applied = 0;
      for (let i = 0; i < pageDatas.length; i += 1) {
        const pageStart = pageStarts[i];
        const pageText = texts[i];
        const pageEnd = pageStart + (pageText?.length || 0);
        const overlapStart = Math.max(globalStart, pageStart);
        const overlapEnd = Math.min(globalEnd, pageEnd);
        if (overlapEnd <= overlapStart) continue;

        const localStart = overlapStart - pageStart;
        const localEnd = overlapEnd - pageStart;
        const d = pageDatas[i];
        applied += applyRangeInLayer(d.layer, d.pageNum, localStart, localEnd, d.text, d.map);
      }

      if (debug) {
        console.log('[PdfPreview][EllipsisSpan] Global fallback span:', {
          globalStart,
          globalEnd,
          applied,
        });
      }

      return applied;
    }
    if (debug) {
      console.log('[PdfPreview][EllipsisSpan] Selected pair:', {
        pLayer: bestPair.pLayer + 1,
        pStart: bestPair.pStart,
        sLayer: bestPair.sLayer + 1,
        sEnd: bestPair.sEnd,
        layers: layers.length,
      });
    }

    // Step 3: highlight the span between prefix and suffix across pages
    let applied = 0;
    if (bestPair.pLayer === bestPair.sLayer) {
      const d = getLayerData(bestPair.pLayer);
      applied += applyRangeInLayer(d.layer, d.pageNum, bestPair.pStart, bestPair.sEnd, d.text, d.map);
      if (debug) console.log('[PdfPreview][EllipsisSpan] Applied chunks:', applied);
      return applied;
    }

    // Start page: from prefix to end-of-page
    {
      const d = getLayerData(bestPair.pLayer);
      applied += applyRangeInLayer(d.layer, d.pageNum, bestPair.pStart, d.text.length, d.text, d.map);
    }
    // Middle pages: highlight whole page text (covers omitted ellipsis region)
    for (let i = bestPair.pLayer + 1; i < bestPair.sLayer; i += 1) {
      const d = getLayerData(i);
      applied += applyRangeInLayer(d.layer, d.pageNum, 0, d.text.length, d.text, d.map);
    }
    // End page: from start-of-page to suffix end
    {
      const d = getLayerData(bestPair.sLayer);
      applied += applyRangeInLayer(d.layer, d.pageNum, 0, bestPair.sEnd, d.text, d.map);
    }
    if (debug) console.log('[PdfPreview][EllipsisSpan] Applied chunks:', applied);

    return applied;
  }

  /**
   * Calculates text similarity between two strings using normalized comparison
   * Returns a value between 0 (completely different) and 1 (identical)
   * @param str1 - First string to compare
   * @param str2 - Second string to compare
   * @returns Similarity score between 0 and 1
   */
  function calculateTextSimilarity(str1: string, str2: string): number {
    // Normalize strings: lowercase, remove extra whitespace, remove punctuation
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[^\w\s]/g, '');
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;
    
    // Calculate character-level similarity (Jaccard-like)
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;
    
    // Check if shorter is contained in longer (substring match)
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }
    
    // Calculate word-level similarity
    const words1 = norm1.split(/\s+/).filter(w => w.length > 0);
    const words2 = norm2.split(/\s+/).filter(w => w.length > 0);
    
    if (words1.length === 0 || words2.length === 0) return 0.0;
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    const wordSimilarity = intersection.size / union.size;
    
    // Combine character and word similarity
    const charSimilarity = 1 - (longer.length - shorter.length) / Math.max(longer.length, 1);
    
    return (wordSimilarity * 0.7 + charSimilarity * 0.3);
  }

  /**
   * Generates a flexible regex pattern from a query string to handle PDF text quirks
   * Handles missing spaces, hyphens, merged words (e.g., "A version" -> "aversion"), and citations
   * Improved to be more precise while still handling PDF text variations
   * @param q - Query string to convert to regex pattern
   * @returns Regex pattern string that can match text with spacing variations
   */
  function patternFromQueryLiteralFlexible(q: string) {
    const rawParts = q.trim().split(/\s+/).filter(Boolean);
    if (!rawParts.length) return '';

    const HYPHENS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212';
    const HYPHEN_CLASS = `[${HYPHENS}]`;
    // Allow light punctuation between tokens (e.g., parentheses, commas) and varying spaces/hyphens
    const PUNCT = `[\\(\\)\\[\\]\\{\\}\\<\\>\\,\\.\\;\\:\\!\\?\"'\\uFF08\\uFF09\\u3010\\u3011\\uFF3B\\uFF3D]*`;
    const GAP = `(?:${PUNCT}\\s+|\\s*${HYPHEN_CLASS}\\s*|${PUNCT}[\\s\\u00A0]{0,3}${PUNCT})`;

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
        const escapedNext = escapeRegExp(nextTok);
        const letterLower = tok.toLowerCase();
        const letterUpper = tok.toUpperCase();
        // More restrictive: prefer space, but allow merge
        // Match: (?:[Aa]\s+)?version OR [Aa]version (case-insensitive)
        parts.push(`(?:[${letterLower}${letterUpper}]\\s+)?${escapedNext}`);
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
    
    // Strategy 1: Use annotation_id if available (most accurate)
    // Find the annotation_id from fragmentToAnnotationIdRef using the fragment from searchQueries
    let targetAnnotationId: string | undefined;
    if (typeof scaffoldIdx === 'number' && scaffoldIdx >= 0 && searchQueries) {
      const queries = Array.isArray(searchQueries) ? searchQueries : [searchQueries];
      if (scaffoldIdx < queries.length) {
        const targetQuery = queries[scaffoldIdx];
        if (targetQuery && typeof targetQuery === 'string') {
          const normalizedQuery = targetQuery.toLowerCase().trim();
          targetAnnotationId = fragmentToAnnotationIdRef.current.get(normalizedQuery) || 
                               fragmentToAnnotationIdRef.current.get(targetQuery) || 
                               undefined;
          if (targetAnnotationId) {
            console.log('[PdfPreview] Looking for annotation_id:', targetAnnotationId, 'for scaffold index:', scaffoldIdx);
          }
        }
      }
    }
    
    // Also try using the fragment parameter directly
    if (!targetAnnotationId && fragment) {
      const normalizedFragment = fragment.toLowerCase().trim();
      targetAnnotationId = fragmentToAnnotationIdRef.current.get(normalizedFragment) || 
                           fragmentToAnnotationIdRef.current.get(fragment) || 
                           undefined;
    }
    
    if (targetAnnotationId) {
      rec = list.find((r: any) => r.annotation_id === targetAnnotationId);
      if (rec) {
        console.log('[PdfPreview] ✅ Found highlight by annotation_id:', targetAnnotationId, 'scaffoldIdx:', scaffoldIdx);
      } else {
        console.warn('[PdfPreview] ⚠️ annotation_id found but no matching highlight record:', targetAnnotationId);
        console.log('[PdfPreview] Available annotation_ids in records:', list.map((r: any) => r.annotation_id).filter(Boolean));
      }
    }
    
    // Strategy 2: Direct index matching using searchQueries order (fallback)
    // scaffoldIdx corresponds to the index in searchQueries array
    if (!rec && typeof scaffoldIdx === 'number' && scaffoldIdx >= 0 && searchQueries) {
      const queries = Array.isArray(searchQueries) ? searchQueries : [searchQueries];
      
      console.log('[PdfPreview] Strategy 2: Using scaffold index', scaffoldIdx, 'out of', queries.length, 'queries');
      console.log('[PdfPreview] Target query:', queries[scaffoldIdx]?.substring(0, 100));
      console.log('[PdfPreview] Available queryFragments in records:', list.map((r: any) => r.queryFragment?.substring(0, 50)).filter(Boolean));
      
      if (scaffoldIdx < queries.length) {
        const targetQuery = queries[scaffoldIdx];
        if (targetQuery && typeof targetQuery === 'string') {
          // Find the first highlight record that matches this query
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
          const targetNormalized = norm(targetQuery);
          
          // Try exact match first
          rec = list.find((r: any) => {
            if (!r.queryFragment) return false;
            return norm(r.queryFragment) === targetNormalized;
          });
          
          // If not found, try partial match (first 50 chars)
          if (!rec) {
            const targetFirst50 = targetNormalized.substring(0, 50);
            rec = list.find((r: any) => {
              if (!r.queryFragment) return false;
              const fragNormalized = norm(r.queryFragment);
              return fragNormalized.substring(0, 50) === targetFirst50;
            });
          }
          
          if (rec) {
            console.log('[PdfPreview] ✅ Found highlight by scaffold index:', scaffoldIdx, 'query:', targetQuery.substring(0, 50));
          } else {
            console.warn('[PdfPreview] ⚠️ No highlight found for scaffold index:', scaffoldIdx, 'query:', targetQuery.substring(0, 50));
          }
        }
      }
    }
    
    // Strategy 3: Text matching (last resort)
    if (!rec && fragment) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const target = norm(fragment);
      const targetFirst50 = target.substring(0, 50);
      
      // Find the best match by comparing first 50 chars
      let bestMatch: any = null;
      let bestScore = 0;
      
      for (const r of list) {
        if (!r.queryFragment) continue;
        const pdfFrag = norm(r.queryFragment);
        const pdfFirst50 = pdfFrag.substring(0, 50);
        
        // Calculate similarity score
        let score = 0;
        if (pdfFirst50 === targetFirst50) {
          score = 100; // Exact match
        } else if (pdfFirst50.includes(targetFirst50) || targetFirst50.includes(pdfFirst50)) {
          score = 80; // Contains match
        } else {
          // Calculate character overlap
          const overlap = pdfFirst50.split('').filter((c, i) => targetFirst50[i] === c).length;
          score = (overlap / Math.max(pdfFirst50.length, targetFirst50.length)) * 50;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = r;
        }
      }
      
      if (bestMatch && bestScore >= 50) {
        rec = bestMatch;
        console.log('[PdfPreview] Found highlight by text matching, score:', bestScore.toFixed(1));
      }
    }
    
    if (!rec) {
      return;
    }
    
    const pageEl = pageElements.get(rec.rangePage);
    if (!pageEl) {
      return;
    }
    
    // Scroll to center highlight in viewport
    if (!containerRef.current) {
      console.warn('[PdfPreview] Container ref is not available, cannot scroll to highlight');
      return;
    }
    
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
  function highlightInLayer(layer: Element, query: string, applier: any, debug: boolean = false, annotationId?: string, originalQueryFragment?: string) {
    const nodes = getTextNodesIn(layer);
    if (!nodes.length) {
      if (debug) console.log('[PdfPreview] No text nodes in layer');
      return 0;
    }
    const { text, map } = buildIndex(nodes);

    // Get page element and page number early
    const pageEl = layer.closest('.page') as HTMLElement | null;
    const pageNum = pageEl ? parseInt(pageEl.dataset.page || '1', 10) : 1;

    // Match mode:
    // - Simple match (default): robust normalization + index mapping (best for ligatures, hyphenation, formulas)
    // - Complex match (opt-out): regex-based fallback (can be brittle)
    const useSimpleMatch = (() => {
      if (typeof window === 'undefined') return false;
      try {
        const win = (window as any).USE_SIMPLE_MATCH;
        if (win === false) return false;
        const ls = localStorage.getItem('USE_SIMPLE_MATCH');
        if (ls === 'false') return false;
        // Default ON unless explicitly disabled
        return true;
      } catch {
        return true;
      }
    })();
    
    // SIMPLE MATCH MODE: Use basic text search
    if (useSimpleMatch) {
    if (debug) {
        console.log('[PdfPreview] Simple match mode - searching for:', query.substring(0, 100));
        console.log('[PdfPreview] Text length:', text.length);
        console.log('[PdfPreview] Text sample (first 300 chars):', text.substring(0, 300));
      }
      const queryFragmentForRecord = originalQueryFragment || query;
      const queryNorm = normalizeForMatch(query);
      const { normalized: textNorm, normToOrig } = buildNormalizedIndexWithMap(text);

      const span = findBestNormSpan(textNorm, queryNorm);

      // Compact mode: remove spaces (and any remaining non-alnum) to handle "radiusr", "are2", "MrI", etc.
      const queryCompact = queryNorm.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
      const compactIndex = (!span && queryCompact.length >= 8) ? buildCompactNormalizedIndexWithMap(text) : null;
      const spanCompact = (!span && compactIndex) ? findBestNormSpan(compactIndex.normalized, queryCompact) : null;

      const applyOrigRange = (start: number, end: number) => {
        const rng: any = indexToDomRange(start, end, map);
        if (!rng) return 0;
        try {
          if (!applier) {
            console.error('[PdfPreview] ❌ Applier is null or undefined!');
            return 0;
          }
          applier.applyToRange(rng);
        } catch (e) {
          console.error('[PdfPreview] ❌ Error applying highlight:', e);
          return 0;
        }
        if (pageEl) {
          const coords = coordsPageEncodedY(rng, pageEl, pageNum);
          highlightRecordsRef.current.push({
            rangeType: 'text',
            rangePage: pageNum,
            rangeStart: start,
            rangeEnd: end,
            fragment: text.substring(start, end),
            queryFragment: queryFragmentForRecord,
            ...coords,
            ...(annotationId ? { annotation_id: annotationId } : {}),
          });
        }
        try { rng.detach?.(); } catch {}
        return 1;
      };

      const selected = span
        ? { normStart: span.start, normEnd: span.end, normToOrig: normToOrig, mode: 'norm' as const }
        : (spanCompact && compactIndex)
          ? { normStart: spanCompact.start, normEnd: spanCompact.end, normToOrig: compactIndex.normToOrig, mode: 'compact' as const }
          : null;

      if (debug) {
        console.log('[PdfPreview] Simple match selected span:', {
          mode: selected?.mode,
          span: span ? { ...span, qLen: queryNorm.length } : null,
          spanCompact: spanCompact ? { ...spanCompact, qLen: queryCompact.length } : null,
        });
      }

      if (selected) {
        const origRange = mapNormRangeToOrig(selected.normStart, selected.normEnd, selected.normToOrig, text.length);
        if (!origRange) return 0;
        return applyOrigRange(origRange.start, origRange.end);
      } else {
        // Ellipsis/non-contiguous fragment support:
        // If query contains "..." or "…" (common when scaffolds compress long spans),
        // match/highlight each segment independently so we cover both pages/ends.
        const rawSegments = (query || '').split(/\.{3,}|…/g).map(s => s.trim()).filter(Boolean);
        if (rawSegments.length >= 2) {
          let segMatches = 0;
          const compactAll = buildCompactNormalizedIndexWithMap(text);
          const maxSegs = 4;
          for (const seg of rawSegments.slice(0, maxSegs)) {
            const segNorm = normalizeForMatch(seg);
            if (segNorm.length < 20) continue;
            const segSpan = findBestNormSpan(textNorm, segNorm);
            if (segSpan) {
              const segOrig = mapNormRangeToOrig(segSpan.start, segSpan.end, normToOrig, text.length);
              if (segOrig) segMatches += applyOrigRange(segOrig.start, segOrig.end);
              continue;
            }
            const segCompact = segNorm.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            if (segCompact.length >= 8) {
              const segSpanC = findBestNormSpan(compactAll.normalized, segCompact);
              if (segSpanC) {
                const segOrig = mapNormRangeToOrig(segSpanC.start, segSpanC.end, compactAll.normToOrig, text.length);
                if (segOrig) segMatches += applyOrigRange(segOrig.start, segOrig.end);
                continue;
              }
            }
          }
          if (segMatches > 0) return segMatches;
        }
        if (debug) {
          console.warn('[PdfPreview] No match found for query:', query.substring(0, 100));
          console.warn('[PdfPreview] Text sample:', text.substring(0, 200));
        }
      }
      return 0; // No match found with simple search
    }

    // COMPLEX MATCH MODE: Use regex (may freeze, but more accurate)
    if (debug) {
      console.log('[PdfPreview] Layer text length:', text.length);
      console.log('[PdfPreview] Query:', query.substring(0, 100));
    }

    // Strategy 1: Try exact match first (fast and precise)
    const exactPattern = escapeRegExp(query.trim());
    const exactRe = new RegExp(exactPattern, 'gi');
    let exactMatch: RegExpExecArray | null = exactRe.exec(text);
    
    if (exactMatch) {
      // Found exact match - use it
      const start = exactMatch.index;
      const end = start + exactMatch[0].length;
      const rng: any = indexToDomRange(start, end, map);

      if (rng) {
      try { applier.applyToRange(rng); } catch {}

      if (pageEl) {
        const coords = coordsPageEncodedY(rng, pageEl, pageNum);
          const matchedFragment = exactMatch[0];
          if (debug) {
            console.log('[PdfPreview] Exact match found:', {
              queryFragment: (originalQueryFragment || query).substring(0, 100),
              matchedFragment: matchedFragment.substring(0, 100),
              similarity: 1.0,
              annotationId: annotationId || 'none'
            });
          }
        highlightRecordsRef.current.push({
          rangeType: 'text',
          rangePage: pageNum,
          rangeStart: start,
          rangeEnd: end,
            fragment: matchedFragment,
            queryFragment: originalQueryFragment || query,
          ...coords,
          ...(annotationId ? { annotation_id: annotationId } : {}),
        });
      }
      try { rng.detach?.(); } catch {}
        return 1; // Return immediately after exact match
      }
    }
    
    // Strategy 2: Try simple keyword search (fallback, no complex regex)
      const keyWords = query.split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 5); // Only use first 5 words
      
      if (keyWords.length >= 2) {
      const keyPattern = keyWords.map(w => escapeRegExp(w)).join('.*?');
        const keyRe = new RegExp(keyPattern, 'gi');
        keyRe.lastIndex = 0;
        
      let keyMatch: RegExpExecArray | null;
      let matchCount = 0;
      const MAX_KEYWORD_MATCHES = 3; // Limit matches
      
      while ((keyMatch = keyRe.exec(text)) !== null && matchCount < MAX_KEYWORD_MATCHES) {
        matchCount++;
        const start = keyMatch.index;
        const end = start + keyMatch[0].length;
          const rng: any = indexToDomRange(start, end, map);
        if (rng) {
          try { applier.applyToRange(rng); } catch {}
          if (pageEl) {
            const coords = coordsPageEncodedY(rng, pageEl, pageNum);
            highlightRecordsRef.current.push({
              rangeType: 'text',
              rangePage: pageNum,
              rangeStart: start,
              rangeEnd: end,
              fragment: keyMatch[0],
              queryFragment: originalQueryFragment || query,
              ...coords,
              ...(annotationId ? { annotation_id: annotationId } : {}),
            });
          }
          try { rng.detach?.(); } catch {}
          return 1; // Return first match found
        }
        if (keyMatch[0].length === 0) {
          keyRe.lastIndex++;
          if (keyRe.lastIndex >= text.length) break;
        }
      }
    }
    
    return 0; // No match found
  }

  /**
   * Attempts to highlight a fragment that is split across page boundaries.
   * Strategy: highlight a prefix on page i and a suffix on page i+1.
   * Best-effort: only returns success if both sides are found.
   */
  function highlightAcrossTwoLayers(layers: Element[], fullFragment: string, idx: number, annotationId?: string) {
    if (idx < 0 || idx >= layers.length - 1) return 0;
    if (!fullFragment || !fullFragment.trim()) return 0;

    const layerA = layers[idx];
    const layerB = layers[idx + 1];
    const nodesA = getTextNodesIn(layerA);
    const nodesB = getTextNodesIn(layerB);
    if (!nodesA.length || !nodesB.length) return 0;

    const { text: textA } = buildIndex(nodesA);
    const { text: textB } = buildIndex(nodesB);
    const boundary = textA.length;

    // Build a combined searchable text (best effort). We keep it contiguous to allow matches spanning boundary.
    const combinedNodes = [...nodesA, ...nodesB];
    const { text: combinedText } = buildIndex(combinedNodes);
    const { normalized: combinedNorm, normToOrig } = buildNormalizedIndexWithMap(combinedText);
    const qNorm = normalizeForMatch(fullFragment);

    let span = findBestNormSpan(combinedNorm, qNorm);
    let selectedMap = normToOrig;
    if (!span) {
      const qCompact = qNorm.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
      if (qCompact.length >= 8) {
        const compact = buildCompactNormalizedIndexWithMap(combinedText);
        const spanC = findBestNormSpan(compact.normalized, qCompact);
        if (spanC) {
          span = { start: spanC.start, end: spanC.end, method: spanC.method };
          selectedMap = compact.normToOrig;
        }
      }
    }
    if (!span) return 0;

    const origSpan = mapNormRangeToOrig(span.start, span.end, selectedMap, combinedText.length);
    if (!origSpan) return 0;

    const origStart = origSpan.start;
    const origEnd = origSpan.end;

    // If match doesn't actually cross boundary, let normal per-layer logic handle it.
    if (origEnd <= boundary) return 0;
    if (origStart >= boundary) return 0;

    const partA = combinedText.slice(origStart, boundary).trim();
    const partB = combinedText.slice(boundary, origEnd).trim();
    if (!partA || !partB) return 0;

    const applierA = appliersRef.current.A || appliersRef.current.B;
    const applierB = appliersRef.current.B || appliersRef.current.A;
    if (!applierA || !applierB) return 0;

    const m1 = highlightInLayer(layerA, partA, applierA, false, annotationId, fullFragment);
    const m2 = highlightInLayer(layerB, partB, applierB, false, annotationId, fullFragment);
    return (m1 > 0 && m2 > 0) ? (m1 + m2) : 0;
  }

  // Track if coords have been reported to avoid duplicate uploads
  const coordsReportedRef = useRef<boolean>(false);
  const lastSearchQueriesRef = useRef<string>('');
  // Track code version for development hot reload - forces re-highlight when code changes
  const codeVersionRef = useRef<number>(0);
  
  // In development, increment version on hot reload to force re-highlight
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      codeVersionRef.current += 1;
      console.log('[PdfPreview] Code version updated (hot reload detected):', codeVersionRef.current);
    }
  }, []); // Empty deps - only runs on mount/hot reload

  // When all pages are rendered, fetch queries, highlight, and report coords
  useEffect(() => {
    if (!pdfDoc) return;
    const allRendered = renderedPages.size === pdfDoc.numPages && pdfDoc.numPages > 0;
    if (!allRendered) return;

    // Create a stable key from searchQueries to detect actual changes
    const searchQueriesKey = Array.isArray(searchQueries) 
      ? searchQueries.join('|') 
      : (searchQueries || '');
    
    // In development, always re-highlight if code version changed (hot reload)
    const codeVersionChanged = process.env.NODE_ENV === 'development' && 
                                codeVersionRef.current > (lastSearchQueriesRef.current ? 1 : 0);
    
    // Only run if searchQueries actually changed (not just scaffolds status)
    // OR if code version changed in development (hot reload)
    if (searchQueriesKey === lastSearchQueriesRef.current && coordsReportedRef.current && !codeVersionChanged) {
      console.log('[PdfPreview] Skipping duplicate highlight/search - searchQueries unchanged and coords already reported');
      return;
    }
    
    if (codeVersionChanged) {
      console.log('[PdfPreview] Code changed (hot reload) - forcing re-highlight');
      coordsReportedRef.current = false; // Reset to allow re-highlight
    }

    // Reset coords reported flag if searchQueries changed
    if (searchQueriesKey !== lastSearchQueriesRef.current) {
      coordsReportedRef.current = false;
      lastSearchQueriesRef.current = searchQueriesKey;
      console.log('[PdfPreview] SearchQueries changed, will highlight and report coords');
    }

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

        // Fallback: If no searchQueries provided, try fetching from API using sessionId and readingId
        if (list.length === 0 && sessionId && readingId) {
          try {
            console.log('[PdfPreview] Fetching queries from API (fallback)', { sessionId, readingId });
            const params = new URLSearchParams();
            if (sessionId) params.set('sessionId', sessionId);
            if (readingId) params.set('readingId', readingId);
            const qRes = await fetch(`/api/queries?${params.toString()}`);
            if (qRes.ok) {
              const { queries } = await qRes.json();
              list = Array.isArray(queries) ? queries : [];
              console.log('[PdfPreview] Fetched', list.length, 'queries from API');
            } else if (qRes.status === 404) {
              // Endpoint doesn't exist, which is fine - just skip this fallback
              console.log('[PdfPreview] /api/queries endpoint not found, skipping fallback');
            }
          } catch (e) {
            // Silently ignore errors - this is just a fallback
            console.log('[PdfPreview] Could not fetch queries from API:', e);
          }
        }

        if (list.length === 0) {
          clearHighlights();
          return;
        }

        // Check if containerRef is available before accessing it
        if (!containerRef.current) {
          console.warn('[PdfPreview] Container ref is not available, skipping highlight processing');
          return;
        }

        clearHighlights();
        const layers = Array.from(containerRef.current.querySelectorAll('.textLayer')) as Element[];
        console.log('[PdfPreview] Found', layers.length, 'text layers');
        if (layers.length > 0) {
          const firstLayerText = layers[0].textContent || '';
          console.log('[PdfPreview] First layer text sample (first 200 chars):', firstLayerText.substring(0, 200));
        }
        
        // Process fragments asynchronously to prevent UI blocking
        let total = 0;
        let processedCount = 0;
        
        const processFragment = async (q: string, i: number) => {
          return new Promise<void>((resolve) => {
            // Use setTimeout to yield to UI thread
            setTimeout(async () => {
              try {
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
                let foundInLayer = false;
                const isEllipsisQuery = /\.{3,}|…/.test(q);
            const applier = (i % 2 === 0) ? appliersRef.current.A : appliersRef.current.B;

                  if (!applier) {
            console.warn(`[PdfPreview] Applier not available for fragment ${i + 1}`);
          } else if (q && q.trim()) {
            // Scan ALL pages, but yield between batches to avoid blocking.
            const BATCH_SIZE = 10;
            for (let start = 0; start < layers.length; start += BATCH_SIZE) {
              const end = Math.min(start + BATCH_SIZE, layers.length);
              for (let layerIdx = start; layerIdx < end; layerIdx += 1) {
                const layer = layers[layerIdx];
                    const isDebug = (i === 0 && layerIdx === 0) || (q.length > 200 && layerIdx === 0);
                const matches = highlightInLayer(layer, q, applier, isDebug, annotationId, q);
                    if (matches > 0) {
                      console.log(`[PdfPreview] ✅ Found ${matches} match(es) for fragment ${i + 1} in layer ${layerIdx + 1}`);
              fragmentTotal += matches;
                      foundInLayer = true;
                      // For ellipsis/non-contiguous fragments, keep scanning later pages to highlight the suffix too.
                      if (!isEllipsisQuery) break;
                }

                // For ellipsis fragments, additionally try to fill the "..." gap by highlighting
                // the full span between prefix and suffix across pages.
                if (isEllipsisQuery && layerIdx === 0) {
                  // Debug for the "Toulmin ... conceptual ecology" fragment regardless of its index.
                  const isEllipsisDebug =
                    i === 1 ||
                    /toulmin/i.test(q) ||
                    /conceptual ecology/i.test(q);
                  const spanMatches = highlightEllipsisSpanAcrossLayers(layers, q, applier, annotationId, isEllipsisDebug);
                  if (spanMatches > 0) {
                    fragmentTotal += spanMatches;
                    foundInLayer = true;
                    console.log(`[PdfPreview] ✅ Ellipsis span highlight for fragment ${i + 1}: +${spanMatches} match(es)`);
                    // Keep scanning to allow other fragments, but no need to keep searching for this one.
                    break;
                  }
                }

                // Try cross-page match opportunistically for long fragments (likely to cross boundary)
                if (!foundInLayer && q.length > 120 && layerIdx < layers.length - 1) {
                  const splitMatches = highlightAcrossTwoLayers(layers, q, layerIdx, annotationId);
                  if (splitMatches > 0) {
                    fragmentTotal += splitMatches;
                    foundInLayer = true;
                    console.log(`[PdfPreview] ✅ Cross-page split match for fragment ${i + 1} across layers ${layerIdx + 1} & ${layerIdx + 2}`);
                    break;
                  }
                }
              }
              if (foundInLayer && !isEllipsisQuery) break;
              // yield to UI thread between batches
              await new Promise<void>((r) => setTimeout(r, 0));
                  }
                }
                
                if (fragmentTotal === 0) {
                  console.warn(`[PdfPreview] ⚠️ Fragment ${i + 1} not found in any layer:`, q.substring(0, 100));
                  console.warn(`[PdfPreview] Fragment text:`, q);
                  // Log first 500 chars of first 10 layers for debugging
                  layers.slice(0, Math.min(10, layers.length)).forEach((layer, idx) => {
                    const layerText = layer.textContent || '';
                    const firstWords = q.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
                    const foundInLayer2 = layerText.toLowerCase().replace(/\s+/g, ' ').includes(firstWords);
                    console.warn(`[PdfPreview] Layer ${idx + 1}:`, {
                      textLength: layerText.length,
                      textSample: layerText.substring(0, 500),
                      firstWordsMatch: foundInLayer2,
                      firstWords: firstWords
                    });
                  });
                }
          console.log(`[PdfPreview] Fragment ${i + 1} total matches: ${fragmentTotal}`);
          total += fragmentTotal;
                processedCount++;
                resolve();
              } catch (error) {
                console.error(`[PdfPreview] Error processing fragment ${i + 1}:`, error);
                processedCount++;
                resolve(); // Continue even if one fragment fails
              }
            }, i * 10); // Stagger processing to prevent blocking
          });
        };
        
        // Process all fragments asynchronously
        const processAllFragments = async () => {
          const promises = list.map((q, i) => processFragment(q, i));
          await Promise.all(promises);
          console.log(`[PdfPreview] Completed processing ${processedCount}/${list.length} fragments, total matches: ${total}`);
        };
        
        processAllFragments().then(() => {
          // Wait a bit more for all highlights to be applied, then report coords
          setTimeout(async () => {
        const report = highlightRecordsRef.current || [];
        if (report.length && !coordsReportedRef.current) {
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
            
            // Build RESTful URL with course_id, session_id, and reading_id from props
            if (!courseId || !readingId || !sessionId) {
              console.warn('[PdfPreview] courseId, sessionId, or readingId missing, cannot save highlight coords');
            } else {
              const highlightUrl = `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/highlight-report`;
              try {
                const response = await fetch(highlightUrl, { 
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json' }, 
                  body: JSON.stringify(formattedReport) 
                });
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}));
                  console.warn('[PdfPreview] Failed to save highlight coords:', response.status, errorData);
                } else {
                  console.log('[PdfPreview] Successfully saved', report.length, 'highlight coord(s)');
                  coordsReportedRef.current = true; // Mark as reported to avoid duplicate uploads
                }
              } catch (e) {
                console.warn('[PdfPreview] Error sending highlight report:', e);
              }
            }
          } catch (e) {
            console.warn('[PdfPreview] Error sending highlight report:', e);
          }
          // Strategy A uses textLayer mark elements, not overlay
        } else if (coordsReportedRef.current) {
          console.log('[PdfPreview] Skipping coords upload - already reported');
        }
        console.log(`Local search highlighted ${total} match(es) across ${layers.length} page(s) using ${list.length} fragment(s) from scaffolds.`);
          }, 500); // Wait 500ms after all fragments processed
        }).catch(error => {
          console.error('[PdfPreview] Error in async fragment processing:', error);
        });
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
  }, [pdfDoc, renderedPages, searchQueries]); // Removed 'scaffolds' from dependencies to avoid re-triggering on status changes

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