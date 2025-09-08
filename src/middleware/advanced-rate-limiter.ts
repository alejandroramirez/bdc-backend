import { rateLimiter } from 'hono-rate-limiter'
import type { Store } from 'hono-rate-limiter'
import type { Context } from 'hono'

interface StoredData {
  totalHits: number
  resetTime?: Date
}

/**
 * Fixed WorkersKVStore that ensures expiration is always at least 60 seconds in the future
 * Fixes the issue where expired resetTime entries cause KV PUT failures
 */
class WorkersKVStore implements Store {
  private namespace: KVNamespace
  prefix: string
  private windowMs: number = 60000 // Default 1 minute

  constructor(options: { namespace: KVNamespace; prefix?: string }) {
    this.namespace = options.namespace
    this.prefix = options.prefix ?? 'hrl:'
  }

  private prefixKey(key: string): string {
    return `${this.prefix}${key}`
  }

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs
  }

  async get(key: string): Promise<StoredData | undefined> {
    const stored = await this.namespace.get(this.prefixKey(key), 'json')
    if (stored) {
      const data = stored as any
      return {
        totalHits: data.totalHits,
        resetTime: data.resetTime ? new Date(data.resetTime) : undefined
      }
    }
    return undefined
  }

  async increment(key: string): Promise<StoredData> {
    const now = Date.now()
    const futureResetTime = new Date(now + this.windowMs)

    let data: StoredData = {
      totalHits: 1,
      resetTime: futureResetTime
    }

    const existing = await this.get(key)
    if (existing && existing.resetTime) {
      // Only use existing resetTime if it's still in the future
      // This fixes the bug where expired resetTime causes KV PUT failures
      if (existing.resetTime.getTime() > now) {
        data = {
          totalHits: existing.totalHits + 1,
          resetTime: existing.resetTime
        }
      } else {
        // Reset time has expired, start a new window
        data = {
          totalHits: 1,
          resetTime: futureResetTime
        }
      }
    }

    // Ensure expiration is at least 60 seconds in the future
    const expirationTime = data.resetTime!.getTime()
    const minExpiration = now + 60000 // At least 60 seconds from now
    const safeExpiration = Math.max(expirationTime, minExpiration)

    await this.namespace.put(
      this.prefixKey(key),
      JSON.stringify(data),
      { expiration: Math.floor(safeExpiration / 1000) }
    )

    return data
  }

  async decrement(key: string): Promise<void> {
    const existing = await this.get(key)
    if (existing && existing.resetTime) {
      const now = Date.now()

      // Only decrement if the reset time is still valid
      if (existing.resetTime.getTime() > now) {
        const data = {
          totalHits: Math.max(0, existing.totalHits - 1),
          resetTime: existing.resetTime
        }

        // Ensure expiration is at least 60 seconds in the future
        const minExpiration = now + 60000
        const safeExpiration = Math.max(existing.resetTime.getTime(), minExpiration)

        await this.namespace.put(
          this.prefixKey(key),
          JSON.stringify(data),
          { expiration: Math.floor(safeExpiration / 1000) }
        )
      }
    }
  }

  async resetKey(key: string): Promise<void> {
    await this.namespace.delete(this.prefixKey(key))
  }
}

// Advanced key generator for widget compatibility and security
export const advancedKeyGenerator = (c: Context): string => {
  // Primary: Use CF-Connecting-IP for accurate client identification
  const cfConnectingIP = c.req.header('CF-Connecting-IP')
  const xForwardedFor = c.req.header('X-Forwarded-For')?.split(',')[0]
  const xRealIP = c.req.header('X-Real-IP')

  const clientIP = cfConnectingIP || xForwardedFor || xRealIP || 'unknown'

  // Secondary: Add Referer-based validation for widgets
  const referer = c.req.header('Referer') || ''
  const isBiodentalcare = referer.includes('biodentalcare.com')

  // Different key prefixes for different request types
  if (isBiodentalcare) {
    return `widget:${clientIP}` // More lenient for legitimate widget requests
  }

  // Stricter limits for non-biodentalcare requests
  return `api:${clientIP}`
}

// Environment-aware rate limiter factory
export const createAdvancedRateLimiter = (environment: 'development' | 'staging' | 'production') => {
  // Base configuration
  const baseConfig = {
    keyGenerator: advancedKeyGenerator,
    skipFailedRequests: true, // Don't count failed requests against limit
    skipSuccessfulRequests: false,
  }

  // Environment-specific limits
  const environmentConfigs = {
    development: {
      windowMs: 1 * 60 * 1000, // 1 minute window
      limit: 500, // Very high limit for development
    },
    staging: {
      windowMs: 5 * 60 * 1000, // 5 minute window  
      limit: 100, // Moderate limit for staging
    },
    production: {
      windowMs: 15 * 60 * 1000, // 15 minute window
      limit: 50, // Conservative limit for production
    },
  }

  return (kvNamespace: KVNamespace) => {
    const config = environmentConfigs[environment]

    return rateLimiter({
      ...baseConfig,
      ...config,
      store: new WorkersKVStore({
        namespace: kvNamespace,
        // Optional: customize KV storage options
        prefix: `rl:${environment}:`, // Prefix keys by environment
      }),
    })
  }
}

// Widget-aware rate limiter with enhanced security
export const createWidgetSecureRateLimiter = (kvNamespace: KVNamespace, environment: 'development' | 'staging' | 'production') => {
  return rateLimiter({
    windowMs: environment === 'development' ? 2 * 60 * 1000 : 15 * 60 * 1000, // 2 min dev, 15 min prod (minimum 60s buffer)
    limit: (c: Context) => {
      const referer = c.req.header('Referer') || ''
      const userAgent = c.req.header('User-Agent') || ''

      // Detect potential widget/legitimate requests
      const isBiodentalcare = referer.includes('biodentalcare.com')
      const isLikelyBot = /bot|crawler|spider|scraper/i.test(userAgent)

      if (environment === 'development') {
        return 500 // High limit for development
      }

      if (isBiodentalcare && !isLikelyBot) {
        return 100 // Higher limit for legitimate biodentalcare requests
      }

      if (isLikelyBot) {
        return 5 // Very low limit for bots
      }

      return 20 // Default moderate limit
    },
    keyGenerator: (c: Context) => {
      const clientIP = c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For')?.split(',')[0] ||
        'unknown'

      const referer = c.req.header('Referer') || ''
      const userAgent = c.req.header('User-Agent') || ''

      // Create composite key for better rate limiting
      const refererDomain = referer ? new URL(referer).hostname : 'direct'
      const isBot = /bot|crawler|spider|scraper/i.test(userAgent)

      return `${environment}:${clientIP}:${refererDomain}:${isBot ? 'bot' : 'human'}`
    },
    store: new WorkersKVStore({
      namespace: kvNamespace,
      prefix: `widget-rl:`,
    }),
    skipFailedRequests: true,
  })
}