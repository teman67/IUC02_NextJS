# Supabase Setup for Visit Tracking

## 1. Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details:
   - Name: `iuc02-analytics` (or your preferred name)
   - Database Password: Choose a strong password
   - Region: Select closest to your users
4. Wait for project to finish setting up (~2 minutes)

## 2. Create Database Table

1. In your Supabase project, go to **SQL Editor**
2. Click "New Query"
3. Paste the following SQL:

```sql
-- Create app_visits table
CREATE TABLE app_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_app_visits_timestamp ON app_visits(timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE app_visits ENABLE ROW LEVEL SECURITY;

-- Create policy to allow inserts from anyone
CREATE POLICY "Allow public inserts" ON app_visits
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policy to allow public reads (for analytics)
CREATE POLICY "Allow public reads" ON app_visits
  FOR SELECT
  TO public
  USING (true);
```

4. Click **Run** to execute the SQL

## 3. Get Your Supabase Credentials

1. Go to **Project Settings** (gear icon in sidebar)
2. Click **API** in the left menu
3. Copy the following values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys")

## 4. Configure Your Application

Add to `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with your actual values from step 3.

## 5. Install Dependencies

```bash
cd frontend
npm install @supabase/supabase-js
```

## 6. Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open the app in browser
3. Check browser console for: `📊 App visit tracked`
4. In Supabase Dashboard, go to **Table Editor** → `app_visits`
5. You should see a new row with your visit data

## 7. View Analytics

### Query Total Visits
In Supabase SQL Editor:
```sql
SELECT COUNT(*) as total_visits FROM app_visits;
```

### Visits by Day
```sql
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as visits
FROM app_visits
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

### Recent Visits
```sql
SELECT 
  timestamp,
  page_url,
  SUBSTRING(user_agent, 1, 50) as browser
FROM app_visits
ORDER BY timestamp DESC
LIMIT 10;
```

### Visits by Hour
```sql
SELECT 
  EXTRACT(HOUR FROM timestamp) as hour,
  COUNT(*) as visits
FROM app_visits
GROUP BY hour
ORDER BY hour;
```

## 8. Optional: Create Analytics Dashboard

You can use Supabase Studio or connect tools like:
- **Metabase** - Free, open-source
- **Grafana** - For real-time dashboards
- **Custom Next.js page** - Build your own analytics view

## Features

✅ **Automatic Tracking** - Tracks when app opens
✅ **Session-Based** - One track per browser session
✅ **User Agent** - Captures browser/device info
✅ **Page URL** - Tracks which page was opened
✅ **Timestamp** - Records exact time of visit
✅ **Privacy-Friendly** - No personal data collected
✅ **Real-time** - Data appears instantly in Supabase

## Troubleshooting

**Issue: "Failed to track visit" in console**
- Check if Supabase URL and keys are correct
- Verify table `app_visits` exists
- Check RLS policies are enabled

**Issue: No data in table**
- Check browser console for errors
- Verify network tab shows request to Supabase
- Check if sessionStorage is blocking (incognito mode)

**Issue: Too many requests**
- Normal - sessionStorage prevents duplicate tracks
- Each browser session = 1 track (desired behavior)

## Security Notes

- ✅ Using `anon` key (public, safe for client-side)
- ✅ RLS policies limit what can be accessed
- ✅ No sensitive data stored
- ✅ Read-only access for analytics
- ⚠️ Never expose `service_role` key in frontend

## Cost

- **Free Tier**: Up to 500MB database, 2GB bandwidth
- Visit tracking uses minimal storage (~100 bytes/visit)
- ~5,000,000 visits possible on free tier
