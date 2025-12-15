# Chat Protection Features

## Implemented Protections

### 1. Rate Limiting
- **Limit:** 10 messages per minute per user
- **Tracking:** IP-based identification
- **Response:** HTTP 429 with retry-after time
- **Reset:** Automatically after 1 minute

### 2. Response Caching
- **Duration:** 5 minutes
- **Storage:** In-memory (100 responses max)
- **Benefit:** Identical questions get instant cached responses
- **Savings:** Reduces API costs and latency

### 3. Input Validation
- **Message format validation:** Ensures proper structure
- **Message history limit:** Only last 10 messages sent to API
- **Prevents:** Token abuse and excessive context

### 4. User Identification
- **OpenAI user field:** Tracks usage per IP
- **Purpose:** OpenAI's built-in abuse monitoring
- **Privacy:** IP hashed/truncated to 50 chars

### 5. Error Handling
- **Rate limit errors:** Clear message with wait time
- **Invalid input:** Specific error messages
- **Network errors:** Graceful fallback

## How It Works

### Rate Limiting Flow
```
User sends message → Check IP → Count < 10? → Allow
                                    ↓ Count ≥ 10
                               Return 429 error
```

### Caching Flow
```
User sends message → Generate cache key → Check cache
                                              ↓ Found
                                         Return cached
                                              ↓ Not found
                                         Call OpenAI → Cache result
```

## Configuration

Edit `frontend/src/lib/chatCache.ts` to adjust:

```typescript
// Rate limit
private readonly MAX_REQUESTS = 10; // messages per minute

// Cache settings
private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
private readonly MAX_CACHE_SIZE = 100; // max cached responses
```

## Benefits

1. **Cost Control**
   - Cached responses = $0 OpenAI cost
   - Rate limiting prevents spam
   - Message history limit reduces tokens

2. **Performance**
   - Cached responses are instant
   - Less load on OpenAI API
   - Better user experience

3. **Abuse Prevention**
   - Can't spam requests
   - Can't send excessive context
   - OpenAI tracks per-user usage

4. **Scalability**
   - In-memory cache is fast
   - Automatic cleanup prevents memory leaks
   - No database required

## Monitoring

### Check Cache Performance
Add logging in `chatCache.ts`:
```typescript
get(key: string): string | null {
  const entry = this.cache.get(key);
  console.log('Cache hit:', !!entry); // Track hit rate
  // ... rest of code
}
```

### Monitor Rate Limits
```typescript
checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  // ... existing code
  console.log(`IP ${ip}: ${limit.count}/10 requests`);
}
```

## Future Enhancements

### Persistent Rate Limiting (Redis)
For production with multiple servers:
```bash
npm install ioredis
```

### Database Caching
For longer-term caching across restarts:
```bash
npm install @vercel/kv
```

### Advanced Abuse Detection
- Pattern detection (repetitive messages)
- Profanity filtering
- Content moderation API

### User Authentication
- Session-based rate limits
- Different limits for authenticated users
- User-specific conversation history

## Testing Rate Limiting

Try sending 11+ messages rapidly - you'll see:
```
"You're sending messages too quickly. Please wait 60 seconds before trying again."
```

## Production Considerations

1. **Environment Variables**
   ```env
   RATE_LIMIT_PER_MINUTE=10
   CACHE_TTL_MINUTES=5
   MAX_CACHE_SIZE=100
   ```

2. **Distributed Systems**
   - Current implementation is single-server
   - For multi-server: Use Redis or similar

3. **Monitoring**
   - Track cache hit rates
   - Monitor rate limit triggers
   - Log OpenAI API costs

4. **Cleanup**
   - Current: Every 5 minutes
   - Adjust based on traffic
   - Consider time-based eviction
