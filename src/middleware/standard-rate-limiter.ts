import { WorkersKVStore } from '@hono-rate-limiter/cloudflare'
import { rateLimiter } from 'hono-rate-limiter'
import type { Context } from 'hono'

/**
 * Standard rate limiter implementation following official @hono-rate-limiter/cloudflare documentation
 * Uses the original WorkersKVStore without modifications
 */
export const createStandardRateLimiter = (kvNamespace: KVNamespace) => {
  return rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // 100 requests per window
    standardHeaders: "draft-6",
    keyGenerator: (c: Context) => c.req.header("cf-connecting-ip") ?? "",
    store: new WorkersKVStore({ 
      namespace: kvNamespace,
      prefix: "hrl:" // optional custom prefix
    })
  })
}

/**
 * Environment-aware standard rate limiter following official patterns
 */
export const createEnvironmentStandardRateLimiter = (environment: 'development' | 'staging' | 'production') => {
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
      ...config,
      standardHeaders: "draft-6",
      keyGenerator: (c: Context) => c.req.header("cf-connecting-ip") ?? "",
      store: new WorkersKVStore({ 
        namespace: kvNamespace,
        prefix: `hrl:${environment}:` // Prefix keys by environment
      }),
      skipFailedRequests: true
    })
  }
}

/**
 * Widget-aware rate limiter using standard WorkersKVStore
 */
export const createStandardWidgetRateLimiter = (kvNamespace: KVNamespace, environment: 'development' | 'staging' | 'production') => {
  return rateLimiter({
    windowMs: environment === 'development' ? 2 * 60 * 1000 : 15 * 60 * 1000, // 2 min dev, 15 min prod
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
    standardHeaders: "draft-6",
    keyGenerator: (c: Context) => {
      const clientIP = c.req.header('cf-connecting-ip') || 
                      c.req.header('x-forwarded-for')?.split(',')[0] || 
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
      prefix: `widget-hrl:${environment}:`
    }),
    skipFailedRequests: true,
  })
}