# Update Supabase Schema for Geolocation Tracking

## Add City and Country Columns to app_visits Table

Run this SQL in your Supabase SQL Editor to add city and country tracking:

```sql
-- Add city and country columns to app_visits table
ALTER TABLE app_visits 
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

-- Create index for country-based queries
CREATE INDEX IF NOT EXISTS idx_app_visits_country ON app_visits(country);

-- Create index for city-based queries
CREATE INDEX IF NOT EXISTS idx_app_visits_city ON app_visits(city);
```

## Verify the Update

Check that the columns were added successfully:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'app_visits';
```

## Query Examples with Geolocation

### Visits by Country
```sql
SELECT 
  country,
  COUNT(*) as visit_count
FROM app_visits
WHERE country IS NOT NULL AND country != 'Unknown'
GROUP BY country
ORDER BY visit_count DESC;
```

### Visits by City
```sql
SELECT 
  city,
  country,
  COUNT(*) as visit_count
FROM app_visits
WHERE city IS NOT NULL AND city != 'Unknown'
GROUP BY city, country
ORDER BY visit_count DESC
LIMIT 20;
```

### Recent Visits with Location
```sql
SELECT 
  timestamp,
  city,
  country,
  page_url,
  SUBSTRING(user_agent, 1, 50) as browser
FROM app_visits
ORDER BY timestamp DESC
LIMIT 10;
```

### Top Countries Today
```sql
SELECT 
  country,
  COUNT(*) as visits
FROM app_visits
WHERE DATE(timestamp) = CURRENT_DATE
  AND country IS NOT NULL 
  AND country != 'Unknown'
GROUP BY country
ORDER BY visits DESC;
```

## Geolocation API Configuration

The app uses **ipinfo.io** for geolocation. Your `.env.local` already has:

```env
NEXT_PUBLIC_IPINFO_API_TOKEN=5d438a698af5b0
```

### Free Tier Limits (ipinfo.io)
- **50,000 requests/month** on free tier
- Rate limit: 1,000 requests/day
- Returns: city, country, region, timezone, coordinates, etc.

### Alternative Geolocation APIs

If you need more requests or different features:

1. **ip-api.com** (Free)
   - 45 requests/minute
   - No API key needed
   - Change URL to: `http://ip-api.com/json/`

2. **ipgeolocation.io** (Free tier: 30,000/month)
   - More detailed location data
   - Sign up at: https://ipgeolocation.io

3. **ipapi.co** (Free tier: 30,000/month)
   - Good accuracy
   - Sign up at: https://ipapi.co

## Features

✅ **City Tracking** - Captures visitor's city
✅ **Country Tracking** - Captures visitor's country code
✅ **Privacy-Friendly** - Only stores city/country, not precise coordinates
✅ **Automatic** - No user interaction needed
✅ **Fallback** - Shows "Unknown" if geolocation fails
✅ **Indexed** - Fast queries on country and city

## Testing

1. Run the SQL migration in Supabase SQL Editor
2. Restart your Next.js dev server: `npm run dev`
3. Open the app in a browser
4. Check Supabase Table Editor → `app_visits`
5. You should see new rows with `city` and `country` populated

## Privacy Notes

- Only city and country are stored (not precise location)
- IP address is NOT stored
- Complies with GDPR (aggregate location data)
- Users are not personally identifiable from this data
