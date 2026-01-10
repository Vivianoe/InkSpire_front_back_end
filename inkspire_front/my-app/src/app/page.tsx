'use client';

import Navigation from "@/components/layout/Navigation";
import styles from "./page.module.css";
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ModalFlow, useAuth } from '@/contexts/AuthContext';
import { CourseCard } from '@/components/course/CourseCard';
import { supabase } from '@/lib/supabase/client';

interface CourseSummary {
  id: string;
  title: string;
  perusallCourseId?: string | null;
  description?: string | null;
  classProfileId?: string | null;
  lastUpdated?: string | null;
}

interface ApiCourse {
  id: string;
  title: string;
  perusall_course_id?: string | null;
  description?: string | null;
  class_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export default function DashboardPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentModalFlow, coursesRefreshTrigger } = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [instructorId, setInstructorId] = useState<string | null>(null);

  const getUserFirstName = () => {
    if (!user) return 'Instructor'

    // Try to get full name from metadata
    const fullName = user.user_metadata?.display_name ||
                     user.user_metadata?.full_name ||
                     user.user_metadata?.name

    if (fullName) {
      // Extract first name (first word)
      return fullName.split(' ')[0]
    }

    // Fallback to email username
    if (user.email) {
      return user.email.split('@')[0]
    }

    return 'Instructor'
  };

  // Test backend connection and load courses when the component mounts
  useEffect(() => {
    testBackendConnection();

    if (user && currentModalFlow === ModalFlow.None) {
      // User is signed in and no modals are showing - load their courses
      loadCourses();
    } else if (!user) {
      // User signed out - clear all course-related state
      setCourses([]);
      setInstructorId(null);
      setError(null);
      setLoading(false);
    }
  }, [pathname, user, currentModalFlow, coursesRefreshTrigger]); // Reload when pathname changes, user becomes available, modal closes, or trigger changes

  const testBackendConnection = async () => {
    try {
      setBackendStatus('checking');
      const response = await fetch('/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      } else {
        setBackendStatus('disconnected');
      }
    } catch (error) {
      console.error('Backend connection test failed:', error);
      setBackendStatus('disconnected');
    }
  };

  const loadCourses = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get auth token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      };

      // Step 1: Get internal user ID from /api/users/me
      const userResponse = await fetch('/api/users/me', { headers });
      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user info: ${userResponse.status} ${userResponse.statusText}`);
      }
      const userData = await userResponse.json();

      // Save instructor ID to state for navigation
      setInstructorId(userData.id);

      // Step 2: Use internal ID to fetch courses
      const response = await fetch(`/api/courses/instructor/${userData.id}`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to load courses: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const items: CourseSummary[] = (data.courses || []).map((c: ApiCourse) => ({
        id: c.id,
        title: c.title,
        perusallCourseId: c.perusall_course_id ?? undefined,
        description: c.description ?? undefined,
        classProfileId: c.class_profile_id ?? undefined,
        lastUpdated: c.updated_at ?? c.created_at ?? null,
      }));
      setCourses(items);
    } catch (err) {
      console.error('Failed to load courses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load courses. Please try again.');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const openCourse = (course: CourseSummary) => {
    // RESTful URL structure: /courses/[courseId]/class-profiles/[profileId]/view
    if (course.classProfileId) {
      // Navigate to view existing profile
      router.push(`/courses/${course.id}/class-profiles/${course.classProfileId}/view`);
    } else {
      // Navigate to create new profile using "new" as profileId
      router.push(`/courses/${course.id}/class-profiles/new/edit`);
    }
  };

  // const handleNewClass = () => {
  //   // For new class, we need to create course first, so use a temporary course ID
  //   // In a real app, you might want to create the course first or use a different flow
  //   router.push(`/courses/new/class-profiles/new/edit`);
  // };

  return (
    <AuthGuard>
      <div className={styles.container}>
        <Navigation />
        <div className={styles.dashboard}>
          <div className={styles.dashboardHeader}>
            <h1 className={styles.welcomeTitle}>
              {user ? `Welcome Back, ${getUserFirstName()}` : 'Welcome to InkSpire!'}
            </h1>
            {process.env.NODE_ENV === 'development' && !loading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
              }}>
                <span>Backend:</span>
                {backendStatus === 'checking' && (
                  <span style={{ color: '#666' }}>Checking...</span>
                )}
                {backendStatus === 'connected' && (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Connected</span>
                )}
                {backendStatus === 'disconnected' && (
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Disconnected</span>
                )}
                <button
                  onClick={testBackendConnection}
                  style={{
                    marginLeft: '8px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    background: '#fff',
                    color: 'red'
                  }}
                >
                  Test
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p>Loading your courses...</p>
            </div>
          ) : (
            <>
              {error ? (
                <div style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '2rem',
                  backgroundColor: '#fee2e2',
                  borderRadius: '0.5rem',
                  border: '1px solid #fca5a5',
                  marginBottom: '2rem'
                }}>
                  <p style={{ color: '#991b1b', margin: 0 }}>{error}</p>
                  <button
                    onClick={() => loadCourses()}
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className={styles.classCardsGrid}>
                  {courses.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                      {user ? 'No courses yet. Import your first one from Perusall!' : 'Please sign in to view your courses.'}
                    </div>
                  ) : (
                    courses.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        onClick={openCourse}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* <div className={styles.newClassButtonContainer}>
            <button
              className={styles.newClassButton}
              onClick={handleNewClass}
            >
              <span className={styles.plusIcon}>+</span>
              New Class Profile
            </button>
          </div> */}
        </div>
      </div>
    </AuthGuard>
  );
}