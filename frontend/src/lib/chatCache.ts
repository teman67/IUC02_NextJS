// Simple in-memory cache for chat responses
interface CacheEntry {
  response: string;
  timestamp: number;
}

// Rate limiting storage
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class ChatCache {
  private cache = new Map<string, CacheEntry>();
  private rateLimits = new Map<string, RateLimitEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  // Generate cache key from messages
  getCacheKey(messages: any[]): string {
    return JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })));
  }

  // Get cached response if available and not expired
  get(key: string): string | null {
    console.log('📖 Cache get - Total cached items:', this.cache.size);
    const entry = this.cache.get(key);
    if (!entry) {
      console.log('❌ No cache entry found');
      return null;
    }

    const isExpired = Date.now() - entry.timestamp > this.CACHE_TTL;
    if (isExpired) {
      console.log('⏰ Cache entry expired');
      this.cache.delete(key);
      return null;
    }

    console.log('✅ Valid cache entry found');
    return entry.response;
  }

  // Store response in cache
  set(key: string, response: string): void {
    // Implement simple LRU by deleting oldest entries
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });
    
    console.log('💾 Cached response - Total items:', this.cache.size);
  }

  // Rate limiting: Check if IP has exceeded limits
  checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
    const limit = this.rateLimits.get(ip);
    const now = Date.now();

    // No previous requests or reset time passed
    if (!limit || now > limit.resetTime) {
      console.log(`✅ New rate limit window for ${ip}`);
      this.rateLimits.set(ip, {
        count: 1,
        resetTime: now + 2 * 60 * 1000 // 2 minute window
      });
      return { allowed: true };
    }

    // Within rate limit
    if (limit.count < 10) { // 10 requests per 2 minutes
      limit.count++;
      console.log(`📊 ${ip}: ${limit.count}/10 requests`);
      return { allowed: true };
    }

    // Rate limit exceeded
    console.log(`🚫 Rate limit exceeded for ${ip}`);
    const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Cleanup old entries periodically
  cleanup(): void {
    const now = Date.now();
    
    // Clean cache
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }

    // Clean rate limits
    for (const [ip, limit] of this.rateLimits.entries()) {
      if (now > limit.resetTime) {
        this.rateLimits.delete(ip);
      }
    }
  }
}

// Export singleton instance
export const chatCache = new ChatCache();

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => chatCache.cleanup(), 5 * 60 * 1000);
}
