import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { env } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { rateLimiter } from '../middleware/rate-limiter'

// HTTP Status constants for readability
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INTERNAL_SERVER_ERROR: 500,
} as const

// Numverify API parameter schemas
const NumverifyQuerySchema = z.object({
  number: z.string().describe('Phone number to validate (required)'),
  country_code: z
    .string()
    .optional()
    .describe('2-letter country code (e.g. US, GB)'),
})

const NumverifyResponseSchema = z.object({
  valid: z.boolean(),
  number: z.string(),
  local_format: z.string(),
  international_format: z.string(),
  country_prefix: z.string(),
  country_code: z.string(),
  country_name: z.string(),
  location: z.string(),
  carrier: z.string(),
  line_type: z.string(),
})

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.number(),
    type: z.string(),
    info: z.string(),
  }),
})

// OpenAPI route definition
const phoneValidationRoute = createRoute({
  method: 'get',
  path: '/api/validate-phone',
  request: {
    query: NumverifyQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: NumverifyResponseSchema,
        },
      },
      description: 'Phone number validation successful',
    },
  },
  tags: ['Phone Validation'],
  summary: 'Validate phone number using Numverify API',
  description:
    'Validates a phone number using the Numverify service. All Numverify API parameters are supported.',
})

export const phoneValidationApp = new OpenAPIHono()

// Apply CORS middleware to restrict access to biodentalcare.com only
phoneValidationApp.use(
  '/api/validate-phone',
  cors({
    origin: (origin, c) => {
      // Get environment context
      const isDevelopment =
        c.env?.NODE_ENV === 'development' || !c.env?.NODE_ENV

      // Production origins - only biodentalcare.com
      const productionOrigins = [
        'https://biodentalcare.com',
        'https://www.biodentalcare.com',
      ]

      // Development origins - include localhost
      const developmentOrigins = [
        ...productionOrigins,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
      ]

      const allowedOrigins = isDevelopment
        ? developmentOrigins
        : productionOrigins

      // If no origin (e.g., same-origin request), allow it
      if (!origin) return origin

      // Return the origin if it's allowed, otherwise return null
      return allowedOrigins.includes(origin) ? origin : null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'OPTIONS'],
  })
)

// Apply rate limiting middleware
phoneValidationApp.use('/api/validate-phone', async (c, next) => {
  // Get environment context for different limits
  const { NODE_ENV } = env<{ NODE_ENV?: string }>(c)
  const isDevelopment = NODE_ENV === 'development' || !NODE_ENV

  // Create rate limiter with environment-specific limits
  const limiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 10, // 10 requests per 15 minutes in production
    skipFailedRequests: true, // Don't count failed requests (4xx/5xx) against limit
    keyGenerator: (c) => {
      // Use CF-Connecting-IP for accurate client identification
      const cfConnectingIP = c.req.header('CF-Connecting-IP')
      const xForwardedFor = c.req.header('X-Forwarded-For')?.split(',')[0]
      const xRealIP = c.req.header('X-Real-IP')

      return cfConnectingIP || xForwardedFor || xRealIP || 'unknown'
    },
  })

  return limiter(c, next)
})

phoneValidationApp.openapi(phoneValidationRoute, async (c) => {
  const { number, country_code } = c.req.valid('query')

  // Get Numverify API key from environment
  const { NUMVERIFY_API_KEY } = env<{ NUMVERIFY_API_KEY: string }>(c)
  if (!NUMVERIFY_API_KEY) {
    throw new HTTPException(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Numverify API key not configured',
    })
  }

  // Build Numverify API URL
  const url = new URL('http://apilayer.net/api/validate')
  url.searchParams.set('access_key', NUMVERIFY_API_KEY)
  url.searchParams.set('number', number)

  if (country_code) {
    url.searchParams.set('country_code', country_code)
  }

  const numverifyUrl = url.toString()

  try {
    // Call Numverify API
    const response = await fetch(numverifyUrl)
    const data = await response.json()

    if (!response.ok) {
      const statusCode =
        response.status === 401
          ? HTTP_STATUS.UNAUTHORIZED
          : HTTP_STATUS.BAD_REQUEST
      throw new HTTPException(statusCode, {
        message: 'Failed to validate phone number',
        cause: data,
      })
    }

    // Check if Numverify returned an error
    if (data.success === false) {
      throw new HTTPException(HTTP_STATUS.BAD_REQUEST, {
        message: 'Phone number validation failed',
        cause: data,
      })
    }

    return c.json(data, HTTP_STATUS.OK)
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }
    throw new HTTPException(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Internal server error',
    })
  }
})
