import { rateLimiter } from 'hono-rate-limiter'
import { WorkersKVStore } from '@hono-rate-limiter/cloudflare'
import type { Context } from 'hono'

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
    windowMs: environment === 'development' ? 60 * 1000 : 15 * 60 * 1000, // 1 min dev, 15 min prod
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