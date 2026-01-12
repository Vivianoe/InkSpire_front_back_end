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
      await fetchReadings();
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
          <div>
            <h1 className={styles.title}>Reading Uploads</h1>
            <p className={styles.subtitle}>
              Upload and process readings for this course.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                // Navigate back to course or profile
                if (profileId) {
                  router.push(`/courses/${courseId}/class-profiles/${profileId}/view`);
                } else {
                  router.push(`/courses/${courseId}`);
                }
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={uploading}
            >
              ← Back
            </button>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
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
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  color: '#92400e'
                }}>
                  <strong>⚠️ Missing Uploads:</strong> {perusallReadings.filter(r => !r.is_uploaded).length} reading(s) from Perusall do not have uploaded PDFs. Please upload PDFs for all readings before proceeding.
                </div>
              )}

              <div className={styles.uploadList}>
                {perusallReadings.map((perusallReading) => (
                  <div
                    key={perusallReading.perusall_reading_id}
                    className={styles.readingCard}
                    style={{
                      borderLeft: perusallReading.is_uploaded ? '4px solid #10b981' : '4px solid #ef4444',
                    }}
                  >
                    <div className={styles.readingMeta}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <p className={styles.readingName}>{perusallReading.perusall_reading_name}</p>
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: perusallReading.is_uploaded ? '#10b981' : '#ef4444',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            {perusallReading.is_uploaded ? '✓ Uploaded' : '✗ Missing'}
                          </span>
                        </div>
                        {perusallReading.is_uploaded && perusallReading.local_reading_title && (
                          <p className={styles.readingSecondaryDetail} style={{ color: '#10b981', fontSize: '12px' }}>
                            Local reading: {perusallReading.local_reading_title}
                          </p>
                        )}
                        {!perusallReading.is_uploaded && (
                          <p className={styles.readingSecondaryDetail} style={{ color: '#ef4444', fontSize: '12px' }}>
                            PDF upload required
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={styles.readingActions}>
                      {perusallReading.is_uploaded ? (
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
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPerusallReading(perusallReading.perusall_reading_id);
                            inputRef.current?.click();
                          }}
                          className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                          disabled={uploading || selectedPerusallReading !== null}
                        >
                          Upload PDF
                        </button>
                      )}
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
