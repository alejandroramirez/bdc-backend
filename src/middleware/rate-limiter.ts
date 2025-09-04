import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  max: number // Maximum number of requests per window
  keyGenerator?: (c: Context) => string // Function to generate unique key for each client
  skipSuccessfulRequests?: boolean // Skip counting successful requests
  skipFailedRequests?: boolean // Skip counting failed requests
}

const defaultKeyGenerator = (c: Context): string => {
  // Try to get real IP from Cloudflare headers first, fallback to standard headers
  const cfConnectingIP = c.req.header('CF-Connecting-IP')
  const xForwardedFor = c.req.header('X-Forwarded-For')
  const xRealIP = c.req.header('X-Real-IP')

  return cfConnectingIP || xForwardedFor || xRealIP || 'unknown'
}

export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options

  // In-memory store - in production, you might want to use Cloudflare KV or D1
  const store: RateLimitStore = {}

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c)
    const now = Date.now()

    // Clean up expired entries
    if (store[key] && now > store[key].resetTime) {
      delete store[key]
    }

    // Initialize or get current count
    if (!store[key]) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      }
    }

    const record = store[key]

    // Check if limit exceeded
    if (record.count >= max) {
      const resetIn = Math.ceil((record.resetTime - now) / 1000)

      throw new HTTPException(429, {
        message: 'Too many requests',
        res: new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: resetIn,
            limit: max,
            windowMs: windowMs / 1000,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': resetIn.toString(),
              'X-RateLimit-Limit': max.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(
                record.resetTime / 1000
              ).toString(),
            },
          }
        ),
      })
    }

    // Increment counter before processing request
    record.count++

    try {
      await next()

      // If skipSuccessfulRequests is true and request was successful, decrement
      if (skipSuccessfulRequests && c.res.status < 400) {
        record.count--
      }
    } catch (error) {
      // If skipFailedRequests is true and request failed, decrement
      if (skipFailedRequests && c.res.status >= 400) {
        record.count--
      }
      throw error
    }

    // Add rate limit headers to response
    const remaining = Math.max(0, max - record.count)
    c.res.headers.set('X-RateLimit-Limit', max.toString())
    c.res.headers.set('X-RateLimit-Remaining', remaining.toString())
    c.res.headers.set(
      'X-RateLimit-Reset',
      Math.ceil(record.resetTime / 1000).toString()
    )
  }
}
