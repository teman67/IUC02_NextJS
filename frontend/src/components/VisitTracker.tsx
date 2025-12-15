'use client';

import { useEffect } from 'react';
import { trackAppVisit } from '@/lib/supabase';

export default function VisitTracker() {
  useEffect(() => {
    // Track visit when component mounts (app opens)
    const track = async () => {
      try {
        // Only track once per session using sessionStorage
        if (typeof window !== 'undefined' && !sessionStorage.getItem('visit_tracked')) {
          await trackAppVisit();
          sessionStorage.setItem('visit_tracked', 'true');
        }
      } catch (error) {
        console.error('Failed to track visit:', error);
      }
    };

    track();
  }, []);

  return null; // This component doesn't render anything
}
