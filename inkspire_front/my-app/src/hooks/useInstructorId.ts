'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type UseInstructorIdResult = {
  instructorId: string | null;
  loading: boolean;
  error: string | null;
};

export function useInstructorId(): UseInstructorIdResult {
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadInstructorId = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated. Please sign in again.');
        }

        const response = await fetch('/api/users/me', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.id) {
          throw new Error(data?.detail || data?.message || 'Failed to fetch current user.');
        }

        if (!mounted) return;
        setInstructorId(String(data.id));
      } catch (err) {
        if (!mounted) return;
        setInstructorId(null);
        setError(err instanceof Error ? err.message : 'Failed to resolve instructor ID.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadInstructorId();
    return () => {
      mounted = false;
    };
  }, []);

  return { instructorId, loading, error };
}
