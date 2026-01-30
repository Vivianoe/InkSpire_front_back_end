'use client';

import { useState, useMemo, ChangeEvent, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from '@/app/courses/[courseId]/readings/page.module.css';
import { supabase } from '@/lib/supabase/client';

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';

type ReadingListItem = {
  id: string;
  title: string;
  instructorId?: string;
  courseId?: string;
  filePath?: string;
  sourceType?: string;
  createdAt?: string;
  sizeLabel?: string;
  usageCount?: number;
  lastUsedAt?: string;
  mimeType?: string;
  readingChunks?: any[]; // PDF chunks if available
  hasChunks?: boolean; // Whether chunks have been processed
};

type PerusallReadingStatus = {
  perusall_reading_id: string;
  perusall_reading_name: string;
  is_uploaded: boolean;
  local_reading_id?: string | null;
  local_reading_title?: string | null;
};

type PersistedReadingSelection = {
  id: string;
  title: string;
  name: string;
  filePath?: string;
  sourceType?: string;
  instructorId?: string;
  courseId?: string;
  sizeLabel?: string;
  mimeType?: string;
  order: number;
};

const SELECTED_READING_STORAGE_KEY = 'inkspire:selectedReadings';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size)) return '0 KB';
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
};

export default function ReadingUploadPage() {
  // Path parameters (from route: /courses/[courseId]/readings)
  const pathParams = useParams();
  const router = useRouter();
  // Query parameters (from URL: ?instructorId=yyy&profileId=zzz)
  const searchParams = useSearchParams();
  const courseId = pathParams.courseId as string;
  const profileId = searchParams.get('profileId') as string | undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [perusallReadings, setPerusallReadings] = useState<PerusallReadingStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingPerusall, setLoadingPerusall] = useState(false);
  const [selectedPerusallReading, setSelectedPerusallReading] = useState<string | null>(null);

  const MAX_PDF_UPLOAD_BYTES = 15 * 1024 * 1024;

  // Get instructor_id from query params, ensure it's never null or undefined
  const instructorIdFromParams = searchParams?.get('instructorId');
  const resolvedInstructorId = (instructorIdFromParams && instructorIdFromParams !== 'null' && instructorIdFromParams !== 'undefined') 
    ? instructorIdFromParams 
    : MOCK_INSTRUCTOR_ID;

  const uploadNewReadings = async (files: FileList, perusallReadingId: string | null = null) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    
    // If uploading for a specific Perusall reading, only allow one file
    if (perusallReadingId && fileArray.length > 1) {
      setError('Please upload only one PDF file for each Perusall reading.');
      return;
    }

    const tooLarge = fileArray.find((f) => f.size > MAX_PDF_UPLOAD_BYTES);
    if (tooLarge) {
      setError(
        `PDF is too large (${(tooLarge.size / (1024 * 1024)).toFixed(1)} MB). Max allowed is ${(MAX_PDF_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.`
      );
      return;
    }
    
    setUploading(true);
    setError(null);
    try {
      await Promise.all(
        fileArray.map(async (file) => {
          // Use Perusall reading name if available, otherwise use filename
          const perusallReading = perusallReadingId
            ? perusallReadings.find(r => r.perusall_reading_id === perusallReadingId)
            : null;
          const title = perusallReading
            ? perusallReading.perusall_reading_name
            : file.name.replace(/\.pdf$/i, '');

          const signedUrlResp = await fetch(`/api/courses/${courseId}/readings/signed-upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, content_type: 'application/pdf' }),
          });

          const signedUrlData = await signedUrlResp.json().catch(() => null);
          if (!signedUrlResp.ok) {
            const fallbackText = signedUrlData ? '' : await signedUrlResp.text().catch(() => '');
            throw new Error(
              (signedUrlData as any)?.detail ||
                (signedUrlData as any)?.message ||
                (fallbackText || 'Failed to create signed upload URL.')
            );
          }

          const filePath = (signedUrlData as any)?.file_path as string | undefined;
          const signedUrl = (signedUrlData as any)?.signed_url as string | undefined;
          const token = (signedUrlData as any)?.token as string | undefined;

          if (!filePath || !signedUrl || !token) {
            throw new Error('Signed upload URL response missing file_path/signed_url/token.');
          }

          // Upload to signed URL (Supabase expects token header)
          const uploadResp = await fetch(signedUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/pdf',
              'x-upsert': 'true',
              'Authorization': `Bearer ${token}`,
            },
            body: file,
          });

          if (!uploadResp.ok) {
            const t = await uploadResp.text().catch(() => '');
            throw new Error(t || `Failed to upload PDF to signed URL (HTTP ${uploadResp.status}).`);
          }

          const response = await fetch(`/api/courses/${courseId}/readings/from-storage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instructor_id: resolvedInstructorId,
              title,
              file_path: filePath,
              perusall_reading_id: perusallReadingId,
              source_type: 'uploaded',
            }),
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            const fallbackText = data ? '' : await response.text().catch(() => '');
            throw new Error(
              (data as any)?.detail ||
                (data as any)?.message ||
                (fallbackText || 'Failed to save reading from storage.')
            );
          }
        })
      );
      
      // Refresh both readings and Perusall library
      await Promise.all([fetchReadings(), fetchPerusallLibrary()]);
      setSelectedPerusallReading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload readings.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      setSelectedPerusallReading(null);
      return;
    }
    await uploadNewReadings(files, selectedPerusallReading);
    event.target.value = '';
  };

  const handleRemoveReading = async (id: string) => {
    setUploading(true);
    setError(null);
    try {
      // Use RESTful URL structure: /api/courses/{course_id}/readings/{reading_id}
      const response = await fetch(`/api/courses/${courseId}/readings/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to remove reading.');
      }

      // Keep any persisted reading selection in sync
      try {
        if (typeof window !== 'undefined') {
          const raw = window.sessionStorage.getItem(SELECTED_READING_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              window.sessionStorage.setItem(
                SELECTED_READING_STORAGE_KEY,
                JSON.stringify(parsed.filter((r: any) => String(r?.id) !== String(id)))
              );
            }
          }
        }
      } catch {
        // ignore storage errors
      }

      // Refresh both readings and Perusall library (so deleted reading shows as missing)
      await Promise.all([fetchReadings(), fetchPerusallLibrary()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove reading.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateSession = () => {
    // Navigate to session creation page
    if (profileId) {
      router.push(`/courses/${courseId}/sessions/create?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
    } else {
      // If no profileId, go to a generic session creation or course management
      router.push(`/courses/${courseId}/class-profiles`);
    }
  };

  const handleUploadClick = () => {
    if (!inputRef.current) return;
    console.log('[ReadingUploadPage] Upload click -> opening file picker');

    // If user cancels the file picker, onChange may not fire.
    // Use window focus to detect returning to the page and reset selection.
    const handleWindowFocus = () => {
      window.removeEventListener('focus', handleWindowFocus);
      const files = inputRef.current?.files;
      if (!files || files.length === 0) {
        setSelectedPerusallReading(null);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    };
    window.addEventListener('focus', handleWindowFocus);

    inputRef.current.click();
  };

  const displayReadings = useMemo(
    () =>
      readings.map(reading => ({
        ...reading,
        displaySize: reading.sizeLabel,
        displayDate: reading.createdAt
          ? new Date(reading.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : undefined,
        usageCount: reading.usageCount ?? 0,
        lastUsedLabel: reading.lastUsedAt
          ? new Date(reading.lastUsedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : null,
      })),
    [readings]
  );

  const fetchReadings = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        course_id: courseId,
        instructor_id: resolvedInstructorId,
      });
      const response = await fetch(`/api/readings?${query.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to load readings.');
      }
      const remoteReadings = Array.isArray(data?.readings)
        ? data.readings.map((item: any) => ({
            id: item.id,
            title: item.title ?? 'Untitled reading',
            instructorId: item.instructor_id,
            courseId: item.course_id,
            filePath: item.file_path,
            sourceType: item.source_type,
            createdAt: item.created_at,
            readingChunks: item.reading_chunks,
            hasChunks: Array.isArray(item.reading_chunks) && item.reading_chunks.length > 0,
            // Legacy fields (may not be in response)
            sizeLabel: item.size_label,
            usageCount: typeof item.usage_count === 'number' ? item.usage_count : 0,
            lastUsedAt: item.last_used_at,
            mimeType: item.mime_type,
          }))
        : [];
      remoteReadings.sort((a: ReadingListItem, b: ReadingListItem) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
      setReadings(remoteReadings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load readings.');
    } finally {
      setLoadingList(false);
    }
  }, [courseId, resolvedInstructorId]);

  const fetchPerusallLibrary = useCallback(async () => {
    setLoadingPerusall(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/courses/${courseId}/perusall/library`, {
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // If Perusall is not configured, show a helpful message but don't block
        const detail = data?.detail || data?.message || 'Failed to load Perusall library.';

        if (response.status === 400 && typeof detail === 'string' && detail.includes('Perusall course ID')) {
          // Course doesn't have Perusall integration set up
          setPerusallReadings([]);
          console.log('Perusall not configured for this course:', detail);
          return;
        }

        if (response.status === 403 && !session?.access_token) {
          // FastAPI HTTPBearer returns 403 when Authorization header is missing
          setPerusallReadings([]);
          console.log('Not authenticated when fetching Perusall library');
          return;
        }

        throw new Error(detail);
      }

      const readings = Array.isArray(data?.readings) ? data.readings : [];
      setPerusallReadings(readings);
    } catch (err) {
      console.error('Perusall library fetch error:', err);
      // Don't block page load if Perusall fails
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load Perusall library.');
      }
    } finally {
      setLoadingPerusall(false);
    }
  }, [courseId]);

  useEffect(() => {
    // Always fetch Perusall library on page entry
    fetchPerusallLibrary();
    fetchReadings();
  }, [fetchPerusallLibrary, fetchReadings]);


  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.backIconButton}
              onClick={() => {
                if (profileId) {
                  router.push(`/courses/${courseId}/class-profiles/${profileId}/view`);
                } else {
                  router.push(`/courses/${courseId}`);
                }
              }}
              aria-label="Back"
              title="Back"
              disabled={uploading}
            >
              ←
            </button>
            <div>
              <h1 className={styles.title}>Reading Uploads</h1>
              <p className={styles.subtitle}>
                Upload and process readings for this course.
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnStartSession}`}
              disabled={
                uploading || 
                readings.length === 0
                
              }
              title={
                perusallReadings.length > 0 && perusallReadings.some(r => !r.is_uploaded)
                  ? 'Please upload PDFs for all Perusall readings before creating a session'
                  : undefined
              }
            >
              Session Setup →
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorMessage}>{error}</div>}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <section className={styles.uploadSection}>
          <div className={styles.uploadHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Perusall Course Library</h2>
              <p className={styles.sectionHelper}>
                Readings from Perusall course library. Upload PDFs for each reading to enable scaffold generation.
              </p>
            </div>
          </div>

          {loadingPerusall ? (
            <div className={styles.emptyState}>Loading Perusall library…</div>
          ) : perusallReadings.length === 0 ? (
            <div className={styles.emptyState}>
              {error ? (
                <div>
                  <p>{error}</p>
                  <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                    Please configure Perusall integration or ensure the course has a Perusall course ID.
                  </p>
                </div>
              ) : (
                'No readings found in Perusall course library.'
              )}
            </div>
          ) : (
            <>
              {/* Check for missing uploads */}
              {perusallReadings.filter(r => !r.is_uploaded).length > 0 && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#FFF8E1',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  color: '#F57C00',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 23 23" fill="none">
                    <path fillRule="evenodd" clipRule="evenodd" d="M11.0844 16.0724C11.5435 16.0724 11.9157 15.7002 11.9157 15.2411V3.07864L13.7786 5.25191C14.0773 5.60052 14.6022 5.64088 14.9508 5.34208C15.2994 5.04329 15.3397 4.51846 15.0409 4.16987L11.7156 0.290313C11.5577 0.106045 11.3271 0 11.0844 0C10.8418 0 10.6111 0.106045 10.4533 0.290313L7.12789 4.16987C6.82909 4.51846 6.86946 5.04329 7.21806 5.34208C7.56666 5.64088 8.09148 5.60052 8.39028 5.25191L10.2531 3.07864V15.2411C10.2531 15.7002 10.6253 16.0724 11.0844 16.0724Z" fill="#F38623"/>
                    <path d="M15.5182 8.59033C14.7399 8.59033 14.3507 8.59033 14.0711 8.77712C13.9501 8.858 13.8461 8.96194 13.7653 9.08299C13.5784 9.36255 13.5784 9.75176 13.5784 10.5301V15.241C13.5784 16.6184 12.4619 17.735 11.0844 17.735C9.70709 17.735 8.59049 16.6184 8.59049 15.241V10.5301C8.59049 9.75176 8.59049 9.36252 8.40366 9.08292C8.3228 8.96192 8.21891 8.85802 8.0979 8.77716C7.81831 8.59033 7.42909 8.59033 6.65067 8.59033C3.51551 8.59033 1.94794 8.59033 0.973968 9.5643C0 10.5383 0 12.1057 0 15.2408V16.3492C0 19.4843 0 21.0519 0.973968 22.0259C1.94794 22.9999 3.51551 22.9999 6.65067 22.9999H15.5182C18.6533 22.9999 20.2209 22.9999 21.1949 22.0259C22.1689 21.0519 22.1689 19.4843 22.1689 16.3492V15.2408C22.1689 12.1057 22.1689 10.5383 21.1949 9.5643C20.2209 8.59033 18.6533 8.59033 15.5182 8.59033Z" fill="#F38623"/>
                  </svg>
                  <strong>Missing Uploads:</strong> {perusallReadings.filter(r => !r.is_uploaded).length} reading(s) from Perusall do not have uploaded PDFs. Please upload PDFs for all readings before proceeding.
                </div>
              )}

              <div className={styles.uploadList}>
                {perusallReadings.filter(r => r.is_uploaded).length > 0 && (
                  <h3 className={styles.listSectionTitle}>Uploaded</h3>
                )}
                {perusallReadings.filter(r => r.is_uploaded).map((perusallReading) => (
                  <div
                    key={perusallReading.perusall_reading_id}
                    className={styles.readingCard}
                  >
                    <div className={styles.readingMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 42 54" fill="none">
                          <path d="M1 49V5C1 2.79086 2.79087 1 5 1H27.9276C29.0042 1 30.0354 1.43398 30.7879 2.20384L39.8603 11.4844C40.5909 12.2318 41 13.2355 41 14.2806V49C41 51.2091 39.2091 53 37 53H5C2.79086 53 1 51.2091 1 49Z" fill="#E5F3E6" stroke="#5EB161" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M30 2V10C30 11.1046 30.8954 12 32 12H40" stroke="#5EB161" strokeWidth="2" strokeLinecap="round"/>
                          <path opacity="0.4" d="M12 27C12 23.2288 12 21.3432 13.1716 20.1716C14.3431 19 16.2288 19 20 19H22C25.7712 19 27.6569 19 28.8284 20.1716C30 21.3432 30 23.2288 30 27V31C30 34.7712 30 36.6569 28.8284 37.8284C27.6569 39 25.7712 39 22 39H20C16.2288 39 14.3431 39 13.1716 37.8284C12 36.6569 12 34.7712 12 31V27Z" fill="#5EB161"/>
                          <path fillRule="evenodd" clipRule="evenodd" d="M16.25 29C16.25 28.5858 16.5858 28.25 17 28.25H25C25.4142 28.25 25.75 28.5858 25.75 29C25.75 29.4142 25.4142 29.75 25 29.75H17C16.5858 29.75 16.25 29.4142 16.25 29Z" fill="#5EB161"/>
                          <path fillRule="evenodd" clipRule="evenodd" d="M16.25 25C16.25 24.5858 16.5858 24.25 17 24.25H25C25.4142 24.25 25.75 24.5858 25.75 25C25.75 25.4142 25.4142 25.75 25 25.75H17C16.5858 25.75 16.25 25.4142 16.25 25Z" fill="#5EB161"/>
                          <path fillRule="evenodd" clipRule="evenodd" d="M16.25 33C16.25 32.5858 16.5858 32.25 17 32.25H22C22.4142 32.25 22.75 32.5858 22.75 33C22.75 33.4142 22.4142 33.75 22 33.75H17C16.5858 33.75 16.25 33.75 16.25 33Z" fill="#5EB161"/>
                        </svg>
                        <div style={{ flex: 1 }}>
                          <p className={styles.readingName}>{perusallReading.perusall_reading_name}</p>
                          <p className={styles.readingSecondaryDetail} style={{ color: '#4CAF50', fontSize: '12px' }}>
                            Uploaded
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className={styles.readingActions}>
                      <button
                        type="button"
                        onClick={() => {
                          if (perusallReading.local_reading_id) {
                            handleRemoveReading(perusallReading.local_reading_id);
                          }
                        }}
                        className={styles.removeButton}
                        disabled={uploading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {perusallReadings.filter(r => !r.is_uploaded).length > 0 && (
                  <h3 className={styles.listSectionTitle}>Pending uploads</h3>
                )}
                {perusallReadings.filter(r => !r.is_uploaded).map((perusallReading) => (
                  <div
                    key={perusallReading.perusall_reading_id}
                    className={styles.readingCard}
                  >
                    <div className={styles.readingMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 42 54" fill="none">
                        <path d="M1 49V5C1 2.79086 2.79087 1 5 1H27.9276C29.0042 1 30.0354 1.43398 30.7879 2.20384L39.8603 11.4844C40.5909 12.2318 41 13.2355 41 14.2806V49C41 51.2091 39.2091 53 37 53H5C2.79086 53 1 51.2091 1 49Z" fill="#FDF2DD" stroke="#F38623" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M30 2V10C30 11.1046 30.8954 12 32 12H40" stroke="#F38623" strokeWidth="2" strokeLinecap="round"/>
                        <path opacity="0.5" d="M32.1689 32.3494V31.241C32.1689 28.1059 32.1687 26.5388 31.1947 25.5648C30.2207 24.5908 28.6531 24.5908 25.518 24.5908H16.6504C13.5153 24.5908 11.9477 24.5908 10.9737 25.5648C10 26.5385 10 28.105 10 31.2386V31.241V32.3494C10 35.4846 10 37.0521 10.974 38.0261C11.9479 39.0001 13.5155 39.0001 16.6507 39.0001H25.5182C28.6533 39.0001 30.2209 39.0001 31.1949 38.0261C32.1689 37.0521 32.1689 35.4846 32.1689 32.3494Z" fill="#F38623"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M21.0844 32.0724C21.5435 32.0724 21.9157 31.7002 21.9157 31.2411V19.0786L23.7786 21.2519C24.0773 21.6005 24.6022 21.6409 24.9508 21.3421C25.2994 21.0433 25.3397 20.5185 25.041 20.1699L21.7157 16.2903C21.5577 16.106 21.3271 16 21.0844 16C20.8418 16 20.6112 16.106 20.4533 16.2903L17.1279 20.1699C16.8291 20.5185 16.8695 21.0433 17.2181 21.3421C17.5667 21.6409 18.0915 21.6005 18.3903 21.2519L20.2531 19.0786V31.2411C20.2531 31.7002 20.6253 32.0724 21.0844 32.0724Z" fill="#F38623"/>
                      </svg>
                        <div style={{ flex: 1 }}>
                          <p className={styles.readingName}>{perusallReading.perusall_reading_name}</p>
                          <p className={styles.readingSecondaryDetail} style={{ color: '#F57C00', fontSize: '12px' }}>
                            PDF upload required
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className={styles.readingActions}>
                        <button
                        type="button"
                        onClick={() => {
                          setSelectedPerusallReading(perusallReading.perusall_reading_id);
                          inputRef.current?.click();
                        }}
                          className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.compactActionButton}`}
                        disabled={uploading || selectedPerusallReading !== null}
                      >
                        Upload PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
