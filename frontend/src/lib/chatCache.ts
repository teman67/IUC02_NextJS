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

// Off-topic penalty storage
interface PenaltyEntry {
  penaltyUntil: number;
}

// Off-topic tracking
interface OffTopicTracker {
  count: number;
  resetTime: number;
}

class ChatCache {
  private cache = new Map<string, CacheEntry>();
  private rateLimits = new Map<string, RateLimitEntry>();
  private penalties = new Map<string, PenaltyEntry>();
  private offTopicTrackers = new Map<string, OffTopicTracker>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;
  private readonly PENALTY_DURATION = 5 * 60 * 1000; // 5 minutes penalty
  private readonly OFF_TOPIC_LIMIT = 3; // 3 strikes before penalty
  private readonly OFF_TOPIC_WINDOW = 10 * 60 * 1000; // 10 minute tracking window

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
      if (firstKey) {
        this.cache.delete(firstKey);
      }
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

  // Track off-topic questions and apply penalty after 3 strikes
  trackOffTopic(ip: string): { shouldPenalize: boolean; strikeCount: number } {
    const now = Date.now();
    const tracker = this.offTopicTrackers.get(ip);

    // No tracker or tracking window expired - reset
    if (!tracker || now > tracker.resetTime) {
      this.offTopicTrackers.set(ip, {
        count: 1,
        resetTime: now + this.OFF_TOPIC_WINDOW
      });
      console.log(`⚠️ ${ip}: Off-topic strike 1/${this.OFF_TOPIC_LIMIT}`);
      return { shouldPenalize: false, strikeCount: 1 };
    }

    // Increment count
    tracker.count++;
    console.log(`⚠️ ${ip}: Off-topic strike ${tracker.count}/${this.OFF_TOPIC_LIMIT}`);

    // Check if reached limit
    if (tracker.count >= this.OFF_TOPIC_LIMIT) {
      console.log(`🚫 ${ip}: Reached ${this.OFF_TOPIC_LIMIT} off-topic questions - applying penalty`);
      this.applyPenalty(ip);
      // Reset tracker
      this.offTopicTrackers.delete(ip);
      return { shouldPenalize: true, strikeCount: tracker.count };
    }

    return { shouldPenalize: false, strikeCount: tracker.count };
  }

  // Check if user is penalized for off-topic questions
  checkPenalty(ip: string): { penalized: boolean; retryAfter?: number } {
    const penalty = this.penalties.get(ip);
    const now = Date.now();

    if (!penalty || now > penalty.penaltyUntil) {
      // No penalty or penalty expired
      if (penalty) {
        this.penalties.delete(ip);
      }
      return { penalized: false };
    }

    // User is still penalized
    const retryAfter = Math.ceil((penalty.penaltyUntil - now) / 1000);
    console.log(`⛔ ${ip} is penalized for off-topic questions. ${retryAfter}s remaining`);
    return { penalized: true, retryAfter };
  }

  // Apply penalty for off-topic questions
  private applyPenalty(ip: string): void {
    const now = Date.now();
    this.penalties.set(ip, {
      penaltyUntil: now + this.PENALTY_DURATION
    });
    console.log(`⚠️ Applied 5-minute penalty to ${ip} for repeated off-topic questions`);
  }

  // Cleanup old entries periodically
  cleanup(): void {
    const now = Date.now();
    
    // Clean cache
    const cacheKeys = Array.from(this.cache.keys());
    cacheKeys.forEach(key => {
      const entry = this.cache.get(key);
      if (entry && now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    });

    // Clean rate limits
    const rateLimitKeys = Array.from(this.rateLimits.keys());
    rateLimitKeys.forEach(ip => {
      const limit = this.rateLimits.get(ip);
      if (limit && now > limit.resetTime) {
        this.rateLimits.delete(ip);
      }
    });

    // Clean penalties
    const penaltyKeys = Array.from(this.penalties.keys());
    penaltyKeys.forEach(ip => {
      const penalty = this.penalties.get(ip);
      if (penalty && now > penalty.penaltyUntil) {
        this.penalties.delete(ip);
      }
    });

    // Clean off-topic trackers
    const offTopicKeys = Array.from(this.offTopicTrackers.keys());
    offTopicKeys.forEach(ip => {
      const tracker = this.offTopicTrackers.get(ip);
      if (tracker && now > tracker.resetTime) {
        this.offTopicTrackers.delete(ip);
      }
    });
  }
}

// Export singleton instance
export const chatCache = new ChatCache();

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => chatCache.cleanup(), 5 * 60 * 1000);
}
