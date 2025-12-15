// Track app visit using API route (avoids client-side Supabase import issues)
export async function trackAppVisit() {
  try {
    const response = await fetch('/api/track-visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        page_url: typeof window !== 'undefined' ? window.location.href : 'unknown'
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Visit tracked successfully');
    } else {
      console.log('📊', data.message || 'Visit tracking skipped');
    }

    return data;
  } catch (error) {
    console.error('Failed to track visit:', error);
    return null;
  }
}

// Get total visit count (using direct REST API)
export async function getVisitCount() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase')) {
    return 0;
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/app_visits?select=count`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('content-range');
    if (count) {
      const match = count.match(/\/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    }

    return 0;
  } catch (error) {
    console.error('Failed to get visit count:', error);
    return 0;
  }
}
