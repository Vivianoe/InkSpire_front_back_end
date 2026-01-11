'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from '@/app/courses/[courseId]/sessions/create/page.module.css';
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
  readingChunks?: any[];
  hasChunks?: boolean;
};

type SessionListItem = {
  id: string;
  title?: string;
  weekNumber: number;
  status: string;
  createdAt?: string;
  readingIds?: string[];
  currentVersionId?: string;
  perusall_assignment_id?: string;
};

type PerusallAssignment = {
  id: string;
  name: string;
  documentIds?: string[];
  parts?: Array<{ documentId: string; startPage?: number; endPage?: number }>;
  documents?: Array<{ _id?: string; id?: string }>;
};

type AssignmentReadingStatus = {
  perusall_document_id: string;
  perusall_document_name?: string;
  is_uploaded: boolean;
  local_reading_id?: string | null;
  local_reading_title?: string | null;
  start_page?: number | null;
  end_page?: number | null;
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

export default function SessionCreationPage() {
  const pathParams = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const courseId = pathParams.courseId as string;
  const profileId = searchParams.get('profileId') as string | undefined;
  const urlSessionId = searchParams.get('sessionId') as string | undefined;
  
  const [mode, setMode] = useState<'create' | 'edit' | 'select'>('select');
  const [weekNumber, setWeekNumber] = useState(1);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentGoal, setAssignmentGoal] = useState('');
  const [selectedReadingIds, setSelectedReadingIds] = useState<string[]>([]);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [perusallAssignments, setPerusallAssignments] = useState<PerusallAssignment[]>([]);
  const [loadingPerusallAssignments, setLoadingPerusallAssignments] = useState(false);
  const [assignmentReadings, setAssignmentReadings] = useState<AssignmentReadingStatus[]>([]);
  const [loadingAssignmentReadings, setLoadingAssignmentReadings] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedPerusallAssignmentId, setSelectedPerusallAssignmentId] = useState<string | null>(null);
  const [selectedAssignmentName, setSelectedAssignmentName] = useState<string>('');
  const [uploadingReading, setUploadingReading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const readingUploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingExistingSession, setIsLoadingExistingSession] = useState(false);
  const [originalDraft, setOriginalDraft] = useState<any>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);

  const resolvedInstructorId = searchParams?.get('instructorId') || MOCK_INSTRUCTOR_ID;

  // Load existing session from URL session_id
  const loadExistingSession = useCallback(async (sessionId: string) => {
    setIsLoadingExistingSession(true);
    setError(null);
    try {
      // Get session details
      const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) {
        throw new Error(sessionData?.detail || sessionData?.message || 'Failed to load session.');
      }

      // Load session identity data
      setSessionTitle(sessionData.title || '');
      setWeekNumber(sessionData.week_number || 1);
      setSelectedSessionId(sessionId);

      // Get current version data
      let currentVersionData = sessionData.current_version;
      if (!currentVersionData && sessionData.current_version_id) {
        const versionResponse = await fetch(`/api/sessions/${sessionId}/versions/current`);
        const versionData = await versionResponse.json().catch(() => ({}));
        if (versionResponse.ok) {
          currentVersionData = versionData;
        }
      }

      // Load version data into form
      if (currentVersionData) {
        setSessionDescription(currentVersionData.session_info_json?.description || '');
        setAssignmentDescription(currentVersionData.assignment_info_json?.description || '');
        setAssignmentGoal(currentVersionData.assignment_goals_json?.goal || '');
        setSelectedReadingIds(currentVersionData.reading_ids || []);
        setCurrentVersion(currentVersionData.version_number || 1);
      } else {
        // Fallback to reading_ids from session if no version
        setSelectedReadingIds(sessionData.reading_ids || []);
        setCurrentVersion(1);
      }

      // Store original draft state for dirty check
      setOriginalDraft({
        sessionTitle: sessionData.title || '',
        weekNumber: sessionData.week_number || 1,
        sessionDescription: currentVersionData?.session_info_json?.description || '',
        assignmentDescription: currentVersionData?.assignment_info_json?.description || '',
        assignmentGoal: currentVersionData?.assignment_goals_json?.goal || '',
        selectedReadingIds: currentVersionData?.reading_ids || sessionData.reading_ids || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load existing session.');
    } finally {
      setIsLoadingExistingSession(false);
    }
  }, []);

  // Fetch Perusall assignments
  const fetchPerusallAssignments = useCallback(async () => {
    setLoadingPerusallAssignments(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/courses/${courseId}/perusall/assignments`, {
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.message || 'Failed to load Perusall assignments.';
        if (response.status === 400 && typeof detail === 'string' && detail.includes('Perusall course ID')) {
          setPerusallAssignments([]);
          console.log('Perusall not configured for this course:', detail);
          return;
        }
        throw new Error(detail);
      }

      const assignmentsRaw = Array.isArray(data?.assignments) ? data.assignments : [];
      const normalizedAssignments = assignmentsRaw
        .map((a: any) => ({
          ...a,
          id: a?.id ?? a?._id,
        }))
        .filter((a: any) => typeof a?.id === 'string' && a.id.length > 0);
      setPerusallAssignments(normalizedAssignments);
    } catch (err) {
      console.error('Perusall assignments fetch error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load Perusall assignments.');
      }
    } finally {
      setLoadingPerusallAssignments(false);
    }
  }, [courseId]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load readings
        const readingsQuery = new URLSearchParams({
          course_id: courseId,
          instructor_id: resolvedInstructorId,
        });
        const readingsResponse = await fetch(`/api/readings?${readingsQuery.toString()}`);
        const readingsData = await readingsResponse.json().catch(() => ({}));
        if (readingsResponse.ok && Array.isArray(readingsData?.readings)) {
          setReadings(readingsData.readings.map((item: any) => ({
            id: item.id,
            title: item.title ?? 'Untitled reading',
            instructorId: item.instructor_id,
            courseId: item.course_id,
            filePath: item.file_path,
            sourceType: item.source_type,
            createdAt: item.created_at,
            readingChunks: item.reading_chunks,
            hasChunks: Array.isArray(item.reading_chunks) && item.reading_chunks.length > 0,
            sizeLabel: item.size_label,
            usageCount: typeof item.usage_count === 'number' ? item.usage_count : 0,
            lastUsedAt: item.last_used_at,
            mimeType: item.mime_type,
          })));
        }

        // Load sessions
        const sessionsResponse = await fetch(`/api/courses/${courseId}/sessions`);
        const sessionsData = await sessionsResponse.json().catch(() => ({}));
        if (sessionsResponse.ok && Array.isArray(sessionsData?.sessions)) {
          setSessions(sessionsData.sessions.map((item: any) => ({
            id: item.id,
            title: item.title,
            weekNumber: item.week_number,
            status: item.status,
            createdAt: item.created_at,
            readingIds: item.reading_ids || [],
            currentVersionId: item.current_version_id,
            perusall_assignment_id: item.perusall_assignment_id,
          })));
        }

        // Load Perusall assignments if not loading existing session
        if (!urlSessionId) {
          fetchPerusallAssignments();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data.');
      }
    };

    if (courseId) {
      loadData();
    }
  }, [courseId, resolvedInstructorId, urlSessionId, fetchPerusallAssignments]);

  // Load existing session if sessionId is in URL
  useEffect(() => {
    if (urlSessionId) {
      setMode('edit');
      loadExistingSession(urlSessionId);
    }
  }, [urlSessionId, loadExistingSession]);

  // Check if draft is dirty (has changes)
  const isDraftDirty = useMemo(() => {
    if (!originalDraft) return false;
    return (
      sessionTitle !== originalDraft.sessionTitle ||
      weekNumber !== originalDraft.weekNumber ||
      sessionDescription !== originalDraft.sessionDescription ||
      assignmentDescription !== originalDraft.assignmentDescription ||
      assignmentGoal !== originalDraft.assignmentGoal ||
      JSON.stringify(selectedReadingIds.sort()) !== JSON.stringify(originalDraft.selectedReadingIds.sort())
    );
  }, [originalDraft, sessionTitle, weekNumber, sessionDescription, assignmentDescription, assignmentGoal, selectedReadingIds]);

  const handleCreateNew = (perusallAssignmentId?: string) => {
    setSelectedSessionId('');
    setSelectedPerusallAssignmentId(perusallAssignmentId || null);
    setSessionTitle('');
    setWeekNumber(1);
    setSessionDescription('');
    setAssignmentDescription('');
    setAssignmentGoal('');
    setSelectedReadingIds([]);
    setOriginalDraft(null);
    setCurrentVersion(1);
    setMode('create');
  };

  const fetchAssignmentReadings = useCallback(async (assignmentId: string) => {
    setLoadingAssignmentReadings(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/courses/${courseId}/perusall/assignments/${assignmentId}/readings`, {
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to load assignment readings.');
      }

      if (data?.success && Array.isArray(data?.readings)) {
        setAssignmentReadings(data.readings);
        setSelectedAssignmentName(data.assignment_name || '');
      } else {
        setAssignmentReadings([]);
      }
    } catch (err) {
      console.error('Assignment readings fetch error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load assignment readings.');
      }
    } finally {
      setLoadingAssignmentReadings(false);
    }
  }, [courseId]);

  const handleSelectAssignment = async (assignmentId: string) => {
    if (!assignmentId || assignmentId === 'undefined') {
      setError('Invalid assignment id. Please refresh the page and try again.');
      return;
    }
    setSelectedPerusallAssignmentId(assignmentId);
    
    // Fetch assignment readings status
    await fetchAssignmentReadings(assignmentId);
    
    // Check if a session already exists for this assignment
    const existingSession = sessions.find(s => s.perusall_assignment_id === assignmentId);
    if (existingSession) {
      // Open existing session directly in the unified edit UI
      setSelectedSessionId(existingSession.id);
      setMode('edit');
      loadExistingSession(existingSession.id);
    } else {
      // Create new session for this assignment
      handleCreateNew(assignmentId);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let sessionId: string;

      // If continuing existing session, check if dirty and create new version if needed
      if (urlSessionId || selectedSessionId) {
        sessionId = urlSessionId || selectedSessionId;
        
        if (isDraftDirty) {
          // Create new version with updated data
          const payload = {
            session_info_json: {
              description: sessionDescription || undefined,
            },
            assignment_info_json: {
              description: assignmentDescription || undefined,
            },
            assignment_goals_json: {
              goal: assignmentGoal || undefined,
            },
            reading_ids: selectedReadingIds,
          };

          const response = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.detail || data?.message || 'Failed to create new version.');
          }

          setError(null);
          setSuccess('Session created successfully! Click "Start scaffolds generation" to proceed.');
        } else {
          // No changes, just confirm session is ready
          setError(null);
          setSuccess('Session ready. Click "Start scaffolds generation" to proceed.');
        }
      } else {
        // Create new session with perusall_assignment_id
        const payload = {
          week_number: weekNumber,
          title: sessionTitle || undefined,
          reading_ids: selectedReadingIds,
          session_description: sessionDescription || undefined,
          assignment_description: assignmentDescription || undefined,
          assignment_goal: assignmentGoal || undefined,
          perusall_assignment_id: selectedPerusallAssignmentId || undefined,
        };

        const response = await fetch(`/api/courses/${courseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        sessionId = data.session_id;
      }

      // Navigate to first reading's scaffold page with full reading list for navigation
      const firstReadingId = selectedReadingIds[0];
      
      // Store reading navigation data in sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadingNavigation',
          JSON.stringify({
            sessionId,
            readingIds: selectedReadingIds,
            currentIndex: 0,
            courseId: courseId,
            profileId,
            instructorId: resolvedInstructorId,
          })
        );
      }
      
      // Check if scaffolds already exist for this session and reading
      const existingScaffoldsResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds`);
      
      if (existingScaffoldsResponse.ok) {
        const existingScaffolds = await existingScaffoldsResponse.json();
        if (existingScaffolds.scaffolds && existingScaffolds.scaffolds.length > 0) {
          // Scaffolds already exist, navigate to display them with navigation context
          router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
          return;
        }
      }
      
      // No existing scaffolds, generate new ones
      const payload = {
        instructor_id: resolvedInstructorId,
      };
      
      const generateResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json().catch(() => ({}));
        throw new Error(errorData?.detail || errorData?.message || 'Failed to generate scaffolds.');
      }
      
      // Navigate to scaffold display page with navigation context
      router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scaffolds. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleContinueWithSession = async () => {
    if (!selectedSessionId) {
      setError('Please select a session.');
      return;
    }
    // Navigate to same page with session_id in URL to load and edit
    const params = new URLSearchParams();
    params.set('sessionId', selectedSessionId);
    if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
    if (profileId) params.set('profileId', profileId);
    
    // Use RESTful URL structure
    router.push(`/courses/${courseId}/sessions/create?${params.toString()}`);
  };

  const handleStartScaffoldsGeneration = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let sessionId: string;

      const ensureSessionVersionIsCurrent = async (existingSessionId: string) => {
        if (!isDraftDirty) {
          return;
        }

        const payload = {
          session_info_json: {
            description: sessionDescription || undefined,
          },
          assignment_info_json: {
            description: assignmentDescription || undefined,
          },
          assignment_goals_json: {
            goal: assignmentGoal || undefined,
          },
          reading_ids: selectedReadingIds,
        };

        const response = await fetch(`/api/courses/${courseId}/sessions/${existingSessionId}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create new version.');
        }
      };

      // If continuing existing session, check if we need to create new version
      if (urlSessionId || selectedSessionId) {
        sessionId = urlSessionId || selectedSessionId!;
        await ensureSessionVersionIsCurrent(sessionId);
      } else {
        // Create new session with perusall_assignment_id
        const payload = {
          week_number: weekNumber,
          title: sessionTitle || undefined,
          reading_ids: selectedReadingIds,
          session_description: sessionDescription || undefined,
          assignment_description: assignmentDescription || undefined,
          assignment_goal: assignmentGoal || undefined,
          perusall_assignment_id: selectedPerusallAssignmentId || undefined,
        };

        const response = await fetch(`/api/courses/${courseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        sessionId = data.session_id;

        // Keep UI semantics consistent: newly created session is now an existing session we can edit
        setSelectedSessionId(sessionId);
        setMode('edit');
      }

      // Navigate to first reading's scaffold page with full reading list for navigation
      const firstReadingId = selectedReadingIds[0];
      
      // Store reading navigation data in sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadingNavigation',
          JSON.stringify({
            sessionId,
            readingIds: selectedReadingIds,
            currentIndex: 0,
            courseId: courseId,
            profileId: profileId || '',
            instructorId: resolvedInstructorId,
          })
        );
      }

      setError(null);
      setSuccess('Session saved. Redirecting...');

      // Navigate to scaffolds page (user can generate scaffolds there)
      router.push(
        `/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start working on readings. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleReadingSelect = (readingId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedReadingIds(prev => [...prev, readingId]);
    } else {
      setSelectedReadingIds(prev => prev.filter(id => id !== readingId));
    }
  };

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

  const handleUploadReadingForAssignment = async (perusallDocumentId: string, file: File) => {
    setUploadingReading(perusallDocumentId);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      // Use document name from assignment readings if available
      const assignmentReading = assignmentReadings.find(ar => ar.perusall_document_id === perusallDocumentId);
      const readingName = assignmentReading?.perusall_document_name || file.name.replace(/\.pdf$/i, '');
      
      const payload = {
        instructor_id: resolvedInstructorId,
        readings: [{
          title: readingName,
          perusall_reading_id: perusallDocumentId,
          source_type: 'uploaded' as const,
          content_base64: base64,
          original_filename: file.name,
        }],
      };

      const response = await fetch(`/api/courses/${courseId}/readings/batch-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to upload reading.');
      }
      
      // If upload successful and we have assignment context, create Perusall mapping
      if (selectedPerusallAssignmentId && data.readings && data.readings.length > 0) {
        const createdReading = data.readings[0];
        try {
          // Get course to find perusall_course_id
          const courseResponse = await fetch(`/api/courses/${courseId}`);
          const courseData = await courseResponse.json().catch(() => ({}));
          
          if (courseResponse.ok && courseData.perusall_course_id) {
            // Create Perusall mapping
            const mappingPayload = {
              course_id: courseId,
              reading_id: createdReading.id,
              perusall_course_id: courseData.perusall_course_id,
              perusall_assignment_id: selectedPerusallAssignmentId,
              perusall_document_id: perusallDocumentId,
            };
            
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            
            await fetch(`/api/courses/${courseId}/readings/${createdReading.id}/perusall/mapping`, {
              method: 'POST',
              headers,
              body: JSON.stringify(mappingPayload),
            });
          }
        } catch (mappingError) {
          console.error('Failed to create Perusall mapping:', mappingError);
          // Don't fail the upload if mapping creation fails
        }
      }
      
      // Refresh assignment readings status
      if (selectedPerusallAssignmentId) {
        await fetchAssignmentReadings(selectedPerusallAssignmentId);
      }
      
      // Refresh readings list
      const readingsQuery = new URLSearchParams({
        course_id: courseId,
        instructor_id: resolvedInstructorId,
      });
      const readingsResponse = await fetch(`/api/readings?${readingsQuery.toString()}`);
      const readingsData = await readingsResponse.json().catch(() => ({}));
      if (readingsResponse.ok && Array.isArray(readingsData?.readings)) {
        setReadings(readingsData.readings.map((item: any) => ({
          id: item.id,
          title: item.title ?? 'Untitled reading',
          instructorId: item.instructor_id,
          courseId: item.course_id,
          filePath: item.file_path,
          sourceType: item.source_type,
          createdAt: item.created_at,
          readingChunks: item.reading_chunks,
          hasChunks: Array.isArray(item.reading_chunks) && item.reading_chunks.length > 0,
          sizeLabel: item.size_label,
          usageCount: typeof item.usage_count === 'number' ? item.usage_count : 0,
          lastUsedAt: item.last_used_at,
          mimeType: item.mime_type,
        })));
      }
      
      setSuccess('Reading uploaded successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload reading.');
    } finally {
      setUploadingReading(null);
    }
  };

  const handleReadingFileSelect = async (perusallDocumentId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    
    await handleUploadReadingForAssignment(perusallDocumentId, file);
    event.target.value = '';
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

  const displaySessions = useMemo(
    () =>
      sessions.map(session => ({
        ...session,
        displayDate: session.createdAt
          ? new Date(session.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : undefined,
        readingCount: session.readingIds?.length || 0,
      })),
    [sessions]
  );

  if (isLoadingExistingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading session...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
      
          <div>
            <h1 className={styles.title}>Session Setup</h1>
            <p className={styles.subtitle}>
              Create a new session or continue working on an existing session.
            </p>
          </div>
    
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                if (profileId) {
                  router.push(`/courses/${courseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                } else {
                  router.push(`/courses/${courseId}/readings`);
                }
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating}
            >
              ← Back to Readings
            </button>
            {/*
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Creating...' : `Save Session (${selectedReadingIds.length} selected)`}
            </button>
            <button
              onClick={handleStartScaffoldsGeneration}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Starting...' : `Start scaffolds generation`}
            </button>*/}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        {success && <div style={{ 
          backgroundColor: '#d1fae5', 
          color: '#065f46', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1.5rem' 
        }}>{success}</div>}

        {isLoadingExistingSession && (
          <div className={styles.emptyState}>Loading existing session...</div>
        )}

        {!isLoadingExistingSession && mode === 'select' ? (
        <section className={styles.selectionSection}>
          <div className={styles.selectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Select Perusall Assignment</h2>
              <p className={styles.sectionHelper}>
                Choose a Perusall assignment to create or open a session.
              </p>
            </div>
          </div>

          <div className={styles.readingList}>
            {loadingPerusallAssignments ? (
              <div className={styles.emptyState}>Loading Perusall assignments…</div>
            ) : perusallAssignments.length === 0 ? (
              <div className={styles.emptyState}>
                No Perusall assignments found. Please configure Perusall integration for this course.
              </div>
            ) : (
              perusallAssignments.map(assignment => {
                const existingSession = sessions.find(s => s.perusall_assignment_id === assignment.id);
                const isSelected = selectedPerusallAssignmentId === assignment.id;
                return (
                  <div
                    key={assignment.id}
                    className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
                    onClick={() => handleSelectAssignment(assignment.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.readingMeta}>
                      <div>
                        <p className={styles.readingName}>
                          {assignment.name}
                          {existingSession && (
                            <span style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}>
                              ✓ Session Exists
                            </span>
                          )}
                        </p>
                        <p className={styles.readingDetails}>
                          {assignment.documents?.length || 0} document{assignment.documents?.length !== 1 ? 's' : ''}
                          {existingSession && (
                            <> · {existingSession.readingIds?.length || 0} reading{(existingSession.readingIds?.length || 0) !== 1 ? 's' : ''}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className={styles.readingActions}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAssignment(assignment.id);
                        }}
                        className={`${styles.selectionButton} ${styles.selectionButtonActive}`}
                      >
                        {existingSession ? 'Open Session' : 'Create Session'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
        ) : null}

        {!isLoadingExistingSession && (mode === 'create' || mode === 'edit') && (
          <>
            {sessions.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => setMode('select')}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  disabled={creating}
                >
                  ← Back to Session Selection
                </button>
                {urlSessionId && isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#fef3c7', 
                    border: '1px solid #fbbf24',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#92400e'
                  }}>
                    ⚠️ You have unsaved changes
                  </div>
                )}
                {urlSessionId && currentVersion && !isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#d1fae5', 
                    border: '1px solid #10b981',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#065f46'
                  }}>
                    ✓ Using version {currentVersion}
                  </div>
                )}
              </div>
            )}

        <section className={styles.sessionInfoSection}>
          <div className={styles.sessionInfoCard}>
            <h2 className={styles.sectionTitle}>Session Information</h2>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="sessionTitle" className={styles.label}>
                  Session Title
                </label>
                <input
                  id="sessionTitle"
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Week 1 Reading Session"
                  disabled={creating}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="weekNumber" className={styles.label}>
                  Week Number
                </label>
                <input
                  id="weekNumber"
                  type="number"
                  min="1"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                  className={styles.input}
                  disabled={creating}
                />
              </div>
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="sessionDescription" className={styles.label}>
                Session Description (Optional)
              </label>
              <textarea
                id="sessionDescription"
                value={sessionDescription}
                onChange={(e) => setSessionDescription(e.target.value)}
                className={styles.input}
                placeholder="Enter session description..."
                rows={3}
                disabled={creating}
              />
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="assignmentDescription" className={styles.label}>
                Assignment Description (Optional)
              </label>
              <textarea
                id="assignmentDescription"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.target.value)}
                className={styles.input}
                placeholder="Enter assignment description..."
                rows={3}
                disabled={creating}
              />
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="assignmentGoal" className={styles.label}>
                Assignment Goal (Optional)
              </label>
              <textarea
                id="assignmentGoal"
                value={assignmentGoal}
                onChange={(e) => setAssignmentGoal(e.target.value)}
                className={styles.input}
                placeholder="Enter assignment goal..."
                rows={3}
                disabled={creating}
              />
            </div>
          </div>
        </section>

        {/* Show assignment readings status if assignment is selected */}
        {selectedPerusallAssignmentId && assignmentReadings.length > 0 && (
          <section className={styles.selectionSection} style={{ marginBottom: '2rem' }}>
            <div className={styles.selectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Assignment Readings: {selectedAssignmentName}</h2>
                <p className={styles.sectionHelper}>
                  Readings from the selected Perusall assignment. Please ensure all readings have uploaded PDFs.
                </p>
              </div>
            </div>

            {loadingAssignmentReadings ? (
              <div className={styles.emptyState}>Loading assignment readings…</div>
            ) : (
              <>
                {assignmentReadings.some(r => !r.is_uploaded) && (
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fbbf24',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    color: '#92400e'
                  }}>
                    <strong>⚠️ Missing Uploads:</strong> {assignmentReadings.filter(r => !r.is_uploaded).length} reading(s) do not have uploaded PDFs. Please upload PDFs for all readings before proceeding.
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => {
                          if (profileId) {
                            router.push(`/courses/${courseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                          } else {
                            router.push(`/courses/${courseId}/readings`);
                          }
                        }}
                        className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                        style={{ marginRight: '8px' }}
                      >
                        Go to Reading Uploads
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.readingList}>
                  {assignmentReadings.map((reading) => (
                    <div
                      key={reading.perusall_document_id}
                      className={styles.readingCard}
                      style={{
                        borderLeft: reading.is_uploaded ? '4px solid #10b981' : '4px solid #ef4444',
                      }}
                    >
                      <div className={styles.readingMeta}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <p className={styles.readingName}>
                              {reading.perusall_document_name || `Document ${reading.perusall_document_id}`}
                            </p>
                            <span style={{
                              padding: '2px 8px',
                              backgroundColor: reading.is_uploaded ? '#10b981' : '#ef4444',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}>
                              {reading.is_uploaded ? '✓ Uploaded' : '✗ Missing'}
                            </span>
                            {reading.start_page && reading.end_page && (
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: '#e5e7eb',
                                color: '#374151',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '500'
                              }}>
                                Pages {reading.start_page}-{reading.end_page}
                              </span>
                            )}
                          </div>
                          {reading.is_uploaded && reading.local_reading_title && (
                            <p className={styles.readingSecondaryDetail} style={{ color: '#10b981', fontSize: '12px' }}>
                              Local reading: {reading.local_reading_title}
                            </p>
                          )}
                          {!reading.is_uploaded && (
                            <p className={styles.readingSecondaryDetail} style={{ color: '#ef4444', fontSize: '12px' }}>
                              PDF upload required
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={styles.readingActions}>
                        {!reading.is_uploaded && (
                          <>
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              ref={(el) => {
                                readingUploadRefs.current[reading.perusall_document_id] = el;
                              }}
                              onChange={(e) => handleReadingFileSelect(reading.perusall_document_id, e)}
                              style={{ display: 'none' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (profileId) {
                                  router.push(`/courses/${courseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                                } else {
                                  router.push(`/courses/${courseId}/readings`);
                                }
                              }}
                              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                              style={{ fontSize: '12px', padding: '6px 12px', marginRight: '8px' }}
                            >
                              Go to Uploads
                            </button>
                            <button
                              type="button"
                              onClick={() => readingUploadRefs.current[reading.perusall_document_id]?.click()}
                              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                              style={{ fontSize: '12px', padding: '6px 12px' }}
                              disabled={uploadingReading === reading.perusall_document_id}
                            >
                              {uploadingReading === reading.perusall_document_id ? 'Uploading...' : 'Upload PDF'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <section className={styles.selectionSection}>
          <div className={styles.selectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Select Readings</h2>
              <p className={styles.sectionHelper}>
                Choose which readings to include in this session for scaffold generation.
                {selectedPerusallAssignmentId && assignmentReadings.length > 0 && (
                  <> Only readings from the assignment that have uploaded PDFs are available.</>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className={styles.selectionCount}>
                {selectedReadingIds.length} of {
                  selectedPerusallAssignmentId && assignmentReadings.length > 0
                    ? assignmentReadings.filter(r => r.is_uploaded).length
                    : readings.length
                } selected
              </div>
              {/*
              <button
                onClick={handleCreateSession}
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                disabled={creating || !selectedReadingIds.length}
                style={{ whiteSpace: 'nowrap' }}
              >
                {creating ? 'Creating...' : 'Save Session'}
              </button>
              */}
              <button
                onClick={handleStartScaffoldsGeneration}
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                disabled={
                  creating || 
                  !selectedReadingIds.length ||
                  (selectedPerusallAssignmentId ? assignmentReadings.some(r => !r.is_uploaded) : false)
                }
                style={{ whiteSpace: 'nowrap' }}
                title={
                  selectedPerusallAssignmentId && assignmentReadings.some(r => !r.is_uploaded)
                    ? 'Please upload PDFs for all assignment readings before proceeding'
                    : undefined
                }
              >
                {creating ? 'Starting...' : 'Start to work on readings'}
              </button>
            </div>
          </div>

          <div className={styles.readingList}>
            {readings.length === 0 ? (
              <div className={styles.emptyState}>
                No readings available. Please upload readings first.
              </div>
            ) : (
              displayReadings
                .filter(reading => {
                  // If assignment is selected, only show readings that are in the assignment and uploaded
                  if (selectedPerusallAssignmentId && assignmentReadings.length > 0) {
                    const assignmentReading = assignmentReadings.find(
                      ar => ar.local_reading_id === reading.id
                    );
                    return assignmentReading?.is_uploaded === true;
                  }
                  return true;
                })
                .map(reading => {
                  const isSelected = selectedReadingIds.includes(reading.id);
                  const assignmentReading = selectedPerusallAssignmentId && assignmentReadings.length > 0
                    ? assignmentReadings.find(ar => ar.local_reading_id === reading.id)
                    : null;
                  
                  return (
                    <div
                      key={reading.id}
                      className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
                    >
                      <div className={styles.readingMeta}>
                        <div>
                          <p className={styles.readingName}>{reading.title}</p>
                          <p className={styles.readingDetails}>
                            {(reading.displaySize || reading.sourceType || 'PDF').trim()}{' '}
                            {reading.displayDate ? `· ${reading.displayDate}` : ''}
                            {assignmentReading?.start_page && assignmentReading?.end_page && (
                              <> · Pages {assignmentReading.start_page}-{assignmentReading.end_page}</>
                            )}
                            {reading.hasChunks && (
                              <span style={{ 
                                marginLeft: '8px', 
                                padding: '2px 6px', 
                                backgroundColor: '#10b981', 
                                color: 'white', 
                                borderRadius: '4px', 
                                fontSize: '11px',
                                fontWeight: '500'
                              }}>
                                Processed
                              </span>
                            )}
                          </p>
                          {reading.filePath && (
                            <p className={styles.readingSecondaryDetail}>{reading.filePath}</p>
                          )}
                          {reading.hasChunks && reading.readingChunks && (
                            <p className={styles.readingSecondaryDetail} style={{ color: '#10b981', fontSize: '12px' }}>
                              {reading.readingChunks.length} chunks available
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={styles.readingActions}>
                        <button
                          type="button"
                          onClick={() => handleReadingSelect(reading.id, !isSelected)}
                          className={`${styles.selectionButton} ${
                            isSelected ? styles.selectionButtonActive : ''
                          }`}
                          disabled={creating}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}
