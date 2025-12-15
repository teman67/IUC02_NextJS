import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { timestamp, user_agent, page_url } = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const ipinfoToken = process.env.IPINFO_API_TOKEN;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase')) {
      console.log('Supabase not configured - skipping tracking');
      return NextResponse.json({ success: false, message: 'Supabase not configured' });
    }

    // Get visitor's IP address
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Fetch geolocation data from ipinfo.io
    let city = 'Unknown';
    let country = 'Unknown';
    
    if (ipinfoToken && ip !== 'unknown') {
      try {
        const geoResponse = await fetch(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          city = geoData.city || 'Unknown';
          country = geoData.country || 'Unknown';
          console.log(`📍 Geolocation: ${city}, ${country} (IP: ${ip})`);
        }
      } catch (geoError) {
        console.log('Could not fetch geolocation:', geoError);
      }
    }

    // Direct REST API call to Supabase (avoiding the JS client)
    const response = await fetch(`${supabaseUrl}/rest/v1/app_visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        timestamp,
        user_agent,
        page_url,
        city,
        country
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to track visit' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking visit:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase')) {
      console.log('Supabase not configured - skipping tracking');
      return NextResponse.json({ success: false, message: 'Supabase not configured' });
    }

    // Fetch total visit count from Supabase
    const response = await fetch(`${supabaseUrl}/rest/v1/app_visits`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch visit count' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const totalVisits = data.length; // Assuming each row represents a visit

    return NextResponse.json({ success: true, totalVisits });
  } catch (error) {
    console.error('Error fetching visit count:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
