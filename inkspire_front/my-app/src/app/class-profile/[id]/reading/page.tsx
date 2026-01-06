// RESTful route: /class-profile/[id]/reading
// This page redirects to the new RESTful structure for backward compatibility
// Extract courseId from query params and redirect to the new structure
'use client';

import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useEffect } from 'react';

export default function ReadingPageRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  
  useEffect(() => {
    const profileId = params.id as string;
    const courseId = searchParams.get('courseId');
    const instructorId = searchParams.get('instructorId');
    
    if (courseId) {
      // Redirect to new RESTful structure
      const newParams = new URLSearchParams();
      if (profileId) newParams.set('profileId', profileId);
      if (instructorId) newParams.set('instructorId', instructorId);
      
      const queryString = newParams.toString();
      router.push(`/courses/${courseId}/readings${queryString ? `?${queryString}` : ''}`);
    } else {
      // If no courseId, redirect to course selection or show error
      router.push('/courses');
    }
  }, [router, searchParams, params]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Redirecting...</div>
    </div>
  );
}

