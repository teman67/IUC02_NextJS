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

    // Get visitor's IP address - Vercel-specific headers
    // Vercel provides the real client IP in these headers
    const ip = request.headers.get('x-vercel-forwarded-for') ||
               request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || 
               request.ip ||
               'unknown';

    console.log(`🌐 Detected IP: ${ip}`);
    console.log(`🔑 API Token available: ${ipinfoToken ? 'YES' : 'NO'}`);

    // Fetch geolocation data
    let city = 'Unknown';
    let country = 'Unknown';
    
    if (ip !== 'unknown' && ip !== '::1' && ip !== '127.0.0.1') {
      try {
        // Try ipinfo.io first if token is available
        if (ipinfoToken) {
          const geoResponse = await fetch(`https://ipinfo.io/${ip}?token=${ipinfoToken}`, {
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            city = geoData.city || 'Unknown';
            country = geoData.country || 'Unknown';
            console.log(`✅ ipinfo.io: ${city}, ${country}`);
            console.log(`📊 Full data:`, JSON.stringify(geoData, null, 2));
          } else {
            const errorText = await geoResponse.text();
            console.error(`❌ ipinfo.io failed (${geoResponse.status}):`, errorText);
            throw new Error('ipinfo.io failed');
          }
        } else {
          throw new Error('No API token');
        }
      } catch (error) {
        // Fallback to free ip-api.com service (no auth required)
        console.log(`⚠️ Trying fallback service (ip-api.com)...`);
        try {
          const fallbackResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,query`);
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.status === 'success') {
              city = fallbackData.city || 'Unknown';
              country = fallbackData.countryCode || 'Unknown';
              console.log(`✅ ip-api.com: ${city}, ${country}`);
              console.log(`📊 Fallback data:`, JSON.stringify(fallbackData, null, 2));
            } else {
              console.error(`❌ ip-api.com returned error:`, fallbackData.message);
            }
          }
        } catch (fallbackError) {
          console.error('❌ Fallback geolocation also failed:', fallbackError);
        }
      }
    } else {
      console.log(`⚠️ Skipping geolocation: IP=${ip} is localhost or unknown`);
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
