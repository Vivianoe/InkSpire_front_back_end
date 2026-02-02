'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from '@/app/courses/[courseId]/sessions/create/page.module.css';
import { supabase } from '@/lib/supabase/client';
import { useInstructorId } from '@/hooks/useInstructorId';

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

type SessionUpdateResponse = {
  success: boolean;
  assignments?: PerusallAssignment[];
  assignment_id?: string | null;
  assignment_name?: string | null;
  readings?: AssignmentReadingStatus[] | null;
  message?: string | null;
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
const ACTIVE_PROFILE_STORAGE_PREFIX = 'inkspire:activeProfileId:';

export default function SessionCreationPage() {
  const pathParams = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const courseId = pathParams.courseId as string;
  const profileId = searchParams.get('profileId') as string | undefined;
  const [resolvedProfileId, setResolvedProfileId] = useState<string | undefined>(profileId);
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
  const initialLoadKeyRef = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingExistingSession, setIsLoadingExistingSession] = useState(false);
  const [originalDraft, setOriginalDraft] = useState<any>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);

  const {
    instructorId: resolvedInstructorId,
    loading: loadingInstructorId,
    error: instructorIdError,
  } = useInstructorId();

  useEffect(() => {
    if (instructorIdError) {
      setError(instructorIdError);
    }
  }, [instructorIdError]);

  useEffect(() => {
    if (!courseId) return;
    const storageKey = `${ACTIVE_PROFILE_STORAGE_PREFIX}${courseId}`;
    if (profileId) {
      setResolvedProfileId(profileId);
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(storageKey, profileId);
        }
      } catch {
        // ignore storage errors
      }
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        const cachedProfileId = window.sessionStorage.getItem(storageKey) || undefined;
        if (cachedProfileId) {
          setResolvedProfileId(cachedProfileId);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [courseId, profileId]);

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
      setSelectedPerusallAssignmentId(sessionData.perusall_assignment_id || null);

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
    if (!courseId || !resolvedInstructorId) {
      return;
    }
    const instructorId = resolvedInstructorId;
    const loadKey = `${courseId}|${resolvedInstructorId}|${urlSessionId || ''}`;
    if (initialLoadKeyRef.current === loadKey) {
      return;
    }
    initialLoadKeyRef.current = loadKey;

    const loadData = async () => {
      try {
        // Load readings
        const readingsQuery = new URLSearchParams({
          course_id: courseId,
          instructor_id: instructorId,
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

    loadData();
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
      JSON.stringify([...selectedReadingIds].sort()) !==
        JSON.stringify([...(originalDraft.selectedReadingIds || [])].sort())
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

        // If PDFs were removed (soft-delete) or uploads are missing, ensure previously-selected
        // local reading ids are automatically deselected.
        const selectableLocalIds = new Set(
          data.readings
            .filter((r: any) => Boolean(r?.is_uploaded && r?.local_reading_id))
            .map((r: any) => String(r.local_reading_id))
        );
        setSelectedReadingIds((prev) => prev.filter((id) => selectableLocalIds.has(id)));
      } else {
        setAssignmentReadings([]);
        setSelectedReadingIds([]);
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

  useEffect(() => {
    if (selectedPerusallAssignmentId) {
      fetchAssignmentReadings(selectedPerusallAssignmentId);
    }
  }, [selectedPerusallAssignmentId, fetchAssignmentReadings]);

  const handleSessionUpdate = async () => {
    try {
      setLoadingPerusallAssignments(true);
      setLoadingAssignmentReadings(Boolean(selectedPerusallAssignmentId));
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/courses/${courseId}/perusall/session-update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assignment_id: selectedPerusallAssignmentId || undefined,
        }),
      });
      const data: SessionUpdateResponse = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !data?.success) {
        throw new Error((data as any)?.detail || data?.message || 'Failed to refresh session selection data.');
      }

      const assignmentsRaw = Array.isArray(data?.assignments) ? data.assignments : [];
      const normalizedAssignments = assignmentsRaw
        .map((a: any) => ({
          ...a,
          id: a?.id ?? a?._id,
        }))
        .filter((a: any) => typeof a?.id === 'string' && a.id.length > 0);
      setPerusallAssignments(normalizedAssignments);

      if (selectedPerusallAssignmentId) {
        if (data.assignment_id && Array.isArray(data.readings)) {
          setAssignmentReadings(data.readings);
          setSelectedAssignmentName(data.assignment_name || '');
        } else {
          setAssignmentReadings([]);
          setSelectedAssignmentName('');
        }
      }
      if (data.message) {
        setSuccess(data.message);
      }
    } catch (err) {
      console.error('Session update failed:', err);
      setError(err instanceof Error ? err.message : 'Session update failed.');
    } finally {
      setLoadingPerusallAssignments(false);
      setLoadingAssignmentReadings(false);
    }
  };

  const handleSelectAssignment = (assignmentId: string) => {
    setSelectedPerusallAssignmentId(assignmentId);
    setSelectedReadingIds([]);

    const matchingSessions = sessions.filter(s => s.perusall_assignment_id === assignmentId);
    if (matchingSessions.length > 0) {
      const latestSession = [...matchingSessions].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })[0];

      setSelectedSessionId(latestSession.id);
      setMode('edit');

      const params = new URLSearchParams();
      params.set('sessionId', latestSession.id);
      params.set('courseId', courseId);
      router.push(`/courses/${courseId}/sessions/create?${params.toString()}`);
      return;
    }

    handleCreateNew(assignmentId);
  };

  const orderedSelectedReadingIds = useMemo(() => {
    if (!selectedPerusallAssignmentId || assignmentReadings.length === 0) {
      return selectedReadingIds;
    }
    const positionMap = new Map<string, number>();
    assignmentReadings.forEach((reading, idx) => {
      const localId = String(reading.local_reading_id || '');
      if (localId) positionMap.set(localId, idx);
    });
    return [...selectedReadingIds].sort((a, b) => {
      const pa = positionMap.get(String(a));
      const pb = positionMap.get(String(b));
      if (pa === undefined && pb === undefined) return 0;
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      return pa - pb;
    });
  }, [selectedReadingIds, selectedPerusallAssignmentId, assignmentReadings]);

  useEffect(() => {
    // Keep selected IDs aligned with Perusall reading order for session/scaffold navigation.
    if (orderedSelectedReadingIds.length !== selectedReadingIds.length) return;
    const changed = orderedSelectedReadingIds.some((id, idx) => id !== selectedReadingIds[idx]);
    if (changed) {
      setSelectedReadingIds(orderedSelectedReadingIds);
    }
  }, [orderedSelectedReadingIds, selectedReadingIds]);

  /* functions for previous non-perusall integration session creation 
  const handleCreateSession = async () => {
    if (!resolvedInstructorId) {
      setError('Unable to identify instructor. Please sign in again.');
      return;
    }
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
      const firstReadingStartPage = selectedPerusallAssignmentId
        ? assignmentReadings.find((ar) => String(ar.local_reading_id || '') === String(firstReadingId))?.start_page
        : undefined;
      const scaffoldNavParams = new URLSearchParams();
      scaffoldNavParams.set('navigation', 'true');
      if (firstReadingStartPage && Number(firstReadingStartPage) > 0) {
        scaffoldNavParams.set('page', String(firstReadingStartPage));
      }
      
      // Store reading navigation data in sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadingNavigation',
          JSON.stringify({
            sessionId,
            readingIds: selectedReadingIds,
            currentIndex: 0,
            courseId: courseId,
            profileId: resolvedProfileId,
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
          router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?${scaffoldNavParams.toString()}`);
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
      router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?${scaffoldNavParams.toString()}`);
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
    if (resolvedProfileId) params.set('profileId', resolvedProfileId);
    
    // Use RESTful URL structure
    router.push(`/courses/${courseId}/sessions/create?${params.toString()}`);
  };
  */

  const handleStartWorkingOnReadings = async () => {
    if (!resolvedInstructorId) {
      setError('Unable to identify instructor. Please sign in again.');
      return;
    }
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
          reading_ids: orderedSelectedReadingIds,
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
          reading_ids: orderedSelectedReadingIds,
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
      const firstReadingId = orderedSelectedReadingIds[0];
      const firstReadingStartPage = selectedPerusallAssignmentId
        ? assignmentReadings.find((ar) => String(ar.local_reading_id || '') === String(firstReadingId))?.start_page
        : undefined;
      const scaffoldNavParams = new URLSearchParams();
      scaffoldNavParams.set('navigation', 'true');
      if (firstReadingStartPage && Number(firstReadingStartPage) > 0) {
        scaffoldNavParams.set('page', String(firstReadingStartPage));
      }
      
      // Store reading navigation data in sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadingNavigation',
          JSON.stringify({
            sessionId,
            readingIds: orderedSelectedReadingIds,
            currentIndex: 0,
            courseId: courseId,
            profileId: resolvedProfileId || '',
            instructorId: resolvedInstructorId,
          })
        );
      }

      setError(null);
      setSuccess('Session saved. Redirecting...');

      // Navigate to scaffolds page (user can generate scaffolds there)
      router.push(
        `/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?${scaffoldNavParams.toString()}`
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
    if (!resolvedInstructorId) {
      setError('Unable to identify instructor. Please sign in again.');
      return;
    }
    setUploadingReading(perusallDocumentId);
    setError(null);
    try {
      const MAX_PDF_UPLOAD_BYTES = 100 * 1024 * 1024;
      if (file.size > MAX_PDF_UPLOAD_BYTES) {
        throw new Error(
          `PDF is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max allowed is ${(MAX_PDF_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.`
        );
      }

      // Use document name from assignment readings if available
      const assignmentReading = assignmentReadings.find(ar => ar.perusall_document_id === perusallDocumentId);
      const readingName = assignmentReading?.perusall_document_name || file.name.replace(/\.pdf$/i, '');

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
          title: readingName,
          file_path: filePath,
          perusall_reading_id: perusallDocumentId,
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
      
      // If upload successful and we have assignment context, create Perusall mapping
      if (selectedPerusallAssignmentId && data?.reading?.id) {
        const createdReading = data.reading;
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

  if (loadingInstructorId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading user context...</div>
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
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.backIconButton}
              onClick={() => {
                if (resolvedProfileId) {
                  router.push(`/courses/${courseId}/readings?profileId=${resolvedProfileId}`);
                } else {
                  router.push(`/courses/${courseId}/readings`);
                }
              }}
              aria-label="Back to readings"
              title="Back to readings"
              disabled={creating}
            >
              ←
            </button>
            <div>
              <h1 className={styles.title}>Session Setup</h1>
              <p className={styles.subtitle}>
                Create a new session or continue working on an existing session.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            {/*
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Creating...' : `Save Session (${selectedReadingIds.length} selected)`}
            </button>
            <button
              onClick={handleStartWorkingOnReadings}
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
          backgroundColor: '#E8F5E9',
          color: '#4CAF50',
          padding: '1rem', 
          borderRadius: '0.5rem', 
          borderLeft: '4px solid #66BB6A',
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
            <button
              type="button"
              className={`${uiStyles.btn} ${uiStyles.btnNeutral} ${styles.compactActionButton}`}
              onClick={handleSessionUpdate}
              disabled={loadingPerusallAssignments || loadingAssignmentReadings}
            >
              Session Update
            </button>
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
                      <div style={{ flex: 1 }}>
                        <p className={styles.readingName}>{assignment.name}</p>
                        <p className={styles.readingSecondaryDetail} style={{ color: '#1976D2', fontSize: '12px' }}>
                          {existingSession ? 'Session exists' : 'Ready for session'}
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
                        className={`${uiStyles.btn} ${styles.compactActionButton} ${
                          existingSession ? uiStyles.btnPrimary : styles.neutralActionButton
                        }`}
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
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set('courseId', courseId);
                    setMode('select');
                    setSelectedSessionId('');
                    router.push(`/courses/${courseId}/sessions/create?${params.toString()}`);
                  }}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  disabled={creating}
                >
                  ← Back to Session Selection
                </button>
                {urlSessionId && isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#FFF8E1',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#F57C00'
                  }}>
                    ⚠️ You have unsaved changes
                  </div>
                )}
                {urlSessionId && currentVersion && !isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#E3F2FD',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#1976D2'
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

        <section className={styles.selectionSection}>
          <div className={styles.selectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Select Readings</h2>
              <p className={styles.sectionHelper}>
                Choose which readings to work on.
                {selectedPerusallAssignmentId && (
                  <> Only readings from the selected assignment are shown (and only uploaded ones can be selected).</>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className={styles.selectionCount}>
                {selectedReadingIds.length} of {
                  selectedPerusallAssignmentId
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
                onClick={handleStartWorkingOnReadings}
                className={`${uiStyles.btn} ${uiStyles.btnStartSession}`}
                disabled={
                  creating || 
                  !selectedReadingIds.length
                }
                style={{ whiteSpace: 'nowrap' }}
                title={
                  undefined
                }
              >
                {creating ? 'Starting...' : 'Start to work on readings'}
              </button>
            </div>
          </div>

          <div className={styles.readingList}>
            {selectedPerusallAssignmentId ? (
              loadingAssignmentReadings && assignmentReadings.length === 0 ? (
                <div className={styles.emptyState}>Loading assignment readings…</div>
              ) : assignmentReadings.length === 0 ? (
                <div className={styles.emptyState}>
                  No readings found for this assignment.
                </div>
              ) : (
                <>
                  {loadingAssignmentReadings ? (
                    <div className={styles.selectionCount} style={{ marginBottom: '0.5rem' }}>
                      Refreshing readings...
                    </div>
                  ) : null}
                  {assignmentReadings.map((ar) => {
                    const localId = ar.local_reading_id || '';
                    const canSelect = Boolean(ar.is_uploaded && localId);
                    const isSelected = canSelect && selectedReadingIds.includes(localId);

                    return (
                      <div
                        key={ar.perusall_document_id}
                        className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
                      >
                        <div className={styles.readingMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        {ar.is_uploaded ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 42 54" fill="none">
                            <path d="M1 49V5C1 2.79086 2.79087 1 5 1H27.9276C29.0042 1 30.0354 1.43398 30.7879 2.20384L39.8603 11.4844C40.5909 12.2318 41 13.2355 41 14.2806V49C41 51.2091 39.2091 53 37 53H5C2.79086 53 1 51.2091 1 49Z" fill="#E5F3E6" stroke="#5EB161" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M30 2V10C30 11.1046 30.8954 12 32 12H40" stroke="#5EB161" strokeWidth="2" strokeLinecap="round"/>
                            <path opacity="0.4" d="M12 27C12 23.2288 12 21.3432 13.1716 20.1716C14.3431 19 16.2288 19 20 19H22C25.7712 19 27.6569 19 28.8284 20.1716C30 21.3432 30 23.2288 30 27V31C30 34.7712 30 36.6569 28.8284 37.8284C27.6569 39 25.7712 39 22 39H20C16.2288 39 14.3431 39 13.1716 37.8284C12 36.6569 12 34.7712 12 31V27Z" fill="#5EB161"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M16.25 29C16.25 28.5858 16.5858 28.25 17 28.25H25C25.4142 28.25 25.75 28.5858 25.75 29C25.75 29.4142 25.4142 29.75 25 29.75H17C16.5858 29.75 16.25 29.4142 16.25 29Z" fill="#5EB161"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M16.25 25C16.25 24.5858 16.5858 24.25 17 24.25H25C25.4142 24.25 25.75 24.5858 25.75 25C25.75 25.4142 25.4142 25.75 25 25.75H17C16.5858 25.75 16.25 25.4142 16.25 25Z" fill="#5EB161"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M16.25 33C16.25 32.5858 16.5858 32.25 17 32.25H22C22.4142 32.25 22.75 32.5858 22.75 33C22.75 33.4142 22.4142 33.75 22 33.75H17C16.5858 33.75 16.25 33.75 16.25 33Z" fill="#5EB161"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 42 54" fill="none">
                            <path d="M1 49V5C1 2.79086 2.79087 1 5 1H27.9276C29.0042 1 30.0354 1.43398 30.7879 2.20384L39.8603 11.4844C40.5909 12.2318 41 13.2355 41 14.2806V49C41 51.2091 39.2091 53 37 53H5C2.79086 53 1 51.2091 1 49Z" fill="#FDF2DD" stroke="#F38623" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M30 2V10C30 11.1046 30.8954 12 32 12H40" stroke="#F38623" strokeWidth="2" strokeLinecap="round"/>
                            <path opacity="0.5" d="M32.1689 32.3494V31.241C32.1689 28.1059 32.1687 26.5388 31.1947 25.5648C30.2207 24.5908 28.6531 24.5908 25.518 24.5908H16.6504C13.5153 24.5908 11.9477 24.5908 10.9737 25.5648C10 26.5385 10 28.105 10 31.2386V31.241V32.3494C10 35.4846 10 37.0521 10.974 38.0261C11.9479 39.0001 13.5155 39.0001 16.6507 39.0001H25.5182C28.6533 39.0001 30.2209 39.0001 31.1949 38.0261C32.1689 37.0521 32.1689 35.4846 32.1689 32.3494Z" fill="#F38623"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M21.0844 32.0724C21.5435 32.0724 21.9157 31.7002 21.9157 31.2411V19.0786L23.7786 21.2519C24.0773 21.6005 24.6022 21.6409 24.9508 21.3421C25.2994 21.0433 25.3397 20.5185 25.041 20.1699L21.7157 16.2903C21.5577 16.106 21.3271 16 21.0844 16C20.8418 16 20.6112 16.106 20.4533 16.2903L17.1279 20.1699C16.8291 20.5185 16.8695 21.0433 17.2181 21.3421C17.5667 21.6409 18.0915 21.6005 18.3903 21.2519L20.2531 19.0786V31.2411C20.2531 31.7002 20.6253 32.0724 21.0844 32.0724Z" fill="#F38623"/>
                          </svg>
                        )}
                        <div style={{ flex: 1 }}>
                            <p className={styles.readingName}>
                              {ar.perusall_document_name || `Document ${ar.perusall_document_id}`}
                            </p>
                          <p className={styles.readingSecondaryDetail} style={{ color: ar.is_uploaded ? '#4CAF50' : '#F57C00', fontSize: '12px' }}>
                            {ar.is_uploaded ? 'Uploaded' : 'PDF upload required'}
                          </p>
                        </div>
                          </div>
                        </div>
                        <div className={styles.readingActions}>
                          {!ar.is_uploaded && (
                            <label
                          className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.compactActionButton}`}
                              style={{
                                cursor: uploadingReading === ar.perusall_document_id ? 'not-allowed' : 'pointer',
                                opacity: uploadingReading === ar.perusall_document_id ? 0.6 : 1,
                              }}
                              title="Upload a PDF to enable selection"
                            >
                              {uploadingReading === ar.perusall_document_id ? 'Uploading…' : 'Upload PDF'}
                              <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => handleReadingFileSelect(ar.perusall_document_id, e)}
                                disabled={creating || uploadingReading === ar.perusall_document_id}
                                style={{ display: 'none' }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (!canSelect) return;
                              handleReadingSelect(localId, !isSelected);
                            }}
                        className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.compactActionButton}`}
                            disabled={creating || !canSelect}
                            title={!ar.is_uploaded ? 'Upload PDF before selecting' : !localId ? 'Missing local reading mapping' : undefined}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )
            ) : readings.length === 0 ? (
              <div className={styles.emptyState}>
                No readings available. Please upload readings first.
              </div>
            ) : (
              displayReadings.map(reading => {
                    const isSelected = selectedReadingIds.includes(reading.id);
                    return (
                      <div
                        key={reading.id}
                        className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
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
                            <p className={styles.readingName}>{reading.title}</p>
                          <p className={styles.readingSecondaryDetail} style={{ color: '#4CAF50', fontSize: '12px' }}>
                            {reading.hasChunks ? 'Processed' : 'Uploaded'}
                          </p>
                        </div>
                          </div>
                        </div>
                        <div className={styles.readingActions}>
                          <button
                            type="button"
                            onClick={() => handleReadingSelect(reading.id, !isSelected)}
                        className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.compactActionButton}`}
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
