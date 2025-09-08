import { createRoute, z } from '@hono/zod-openapi'
import { env } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
// import { createWidgetSecureRateLimiter } from '../middleware/advanced-rate-limiter'
import { createStandardWidgetRateLimiter } from '../middleware/standard-rate-limiter'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import type { StatusCode, ContentfulStatusCode } from 'hono/utils/http-status'

// Using Stoker HTTP status codes for better Hono integration
const {
  OK,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  TOO_MANY_REQUESTS,
  INTERNAL_SERVER_ERROR,
} = HttpStatusCodes

// NumVerify API Types and Schemas
type NumVerifySuccessResponse = {
  valid: boolean
  number: string
  local_format: string
  international_format: string
  country_prefix: string
  country_code: string
  country_name: string
  location: string
  carrier: string
  line_type: string
}

type NumVerifyErrorResponse = {
  success: false
  error: {
    code: number
    type: string
    info: string
  }
}

type NumVerifyApiResponse = NumVerifySuccessResponse | NumVerifyErrorResponse

// Request parameter schemas
const NumverifyQuerySchema = z.object({
  number: z.string().describe('Phone number to validate (required)'),
  country_code: z
    .string()
    .length(2)
    .describe('2-letter country code (e.g. US, GB)'),
})

// Zod schemas for validation and OpenAPI documentation - simplified for API response
const PhoneValidationResponseSchema = z.object({
  valid: z.boolean(),
})

// Full NumVerify response schema for internal use and logging
const NumverifySuccessSchema = z.object({
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

const NumverifyErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.number(),
    type: z.string(),
    info: z.string(),
  }),
})

const ErrorMessageSchema = z.object({
  message: z.string(),
  cause: NumverifyErrorSchema.optional(),
})

// OpenAPI route definition
export const phoneValidationRoute = createRoute({
  method: 'get',
  path: '/api/validate-phone',
  request: {
    query: NumverifyQuerySchema,
  },
  responses: {
    [OK]: {
      ...jsonContent(PhoneValidationResponseSchema, 'Phone number validation successful'),
    },
    [BAD_REQUEST]: {
      ...jsonContent(ErrorMessageSchema, 'Invalid request or NumVerify API error'),
    },
    [UNAUTHORIZED]: {
      ...jsonContent(
        z.object({ message: z.string() }),
        'Unauthorized - Invalid API key'
      ),
    },
    [TOO_MANY_REQUESTS]: {
      ...jsonContent(
        z.object({ message: z.string() }),
        'Rate limit exceeded'
      ),
    },
    [INTERNAL_SERVER_ERROR]: {
      ...jsonContent(
        z.object({ message: z.string() }),
        'Internal server error'
      ),
    },
  },
  tags: ['Phone Validation'],
  summary: 'Validate phone number using Numverify API',
  description:
    'Validates a phone number using the Numverify service. All Numverify API parameters are supported.',
})

// CORS configuration function with error handling
export const getCorsConfig = () => ({
  origin: (origin: string | undefined, c: any) => {
    // Get environment context
    const isDevelopment = c.env.ENVIRONMENT === 'development'

    // Production origins - only biodentalcare.com
    const productionOrigins = [
      'https://biodentalcare.com',
      'https://www.biodentalcare.com',
    ]

    // Development origins - include localhost
    const developmentOrigins = [
      ...productionOrigins,
      'http://localhost:3000',
      'http://localhost:3030',
      'http://localhost:5173',
      'http://localhost:8080',
    ]

    const allowedOrigins = isDevelopment
      ? developmentOrigins
      : productionOrigins

    // If no origin (e.g., same-origin request), allow it
    if (!origin) return origin

    // Return the origin if it's allowed, otherwise return null (CORS will handle the rejection)
    return allowedOrigins.includes(origin) ? origin : null
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})

// Advanced rate limiting middleware for phone validation with widget support
export const phoneValidationRateLimit = async (c: any, next: any) => {
  try {
    // Detect if we're running in Vite dev mode by checking the request origin
    const isViteDev = c.req.url.includes('localhost:5173') || c.req.url.includes('127.0.0.1:5173')
    
    if (isViteDev) {
      console.log('⚠️  Rate limiting disabled - Vite dev mode detected')
      return await next()
    }

    // Get environment context and KV namespace
    const { ENVIRONMENT, RATE_LIMIT_KV } = env<{
      ENVIRONMENT: 'development' | 'staging' | 'production',
      RATE_LIMIT_KV: KVNamespace
    }>(c)

    // Check if we have access to real KV namespace (Wrangler dev/production)
    if (!RATE_LIMIT_KV) {
      console.log('⚠️  Rate limiting disabled - no KV namespace available')
      return await next()
    }

    // Try to test KV availability
    try {
      // Quick test to see if KV is working
      await RATE_LIMIT_KV.get('test-key')
    } catch (kvError) {
      const errorMessage = kvError instanceof Error ? kvError.message : 'Unknown KV error'
      console.log('⚠️  Rate limiting disabled - KV not accessible:', errorMessage)
      return await next()
    }

    // Create widget-aware rate limiter with KV persistence
    // const limiter = createWidgetSecureRateLimiter(RATE_LIMIT_KV, ENVIRONMENT)
    const limiter = createStandardWidgetRateLimiter(RATE_LIMIT_KV, ENVIRONMENT)

    return await limiter(c, next)
  } catch (error) {
    // Fallback: skip rate limiting if there's any error (e.g., in Vite dev mode)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.log('⚠️  Rate limiting disabled due to error:', errorMessage)
    return await next()
  }
}

// Helper function to check if response is an error
function isNumVerifyError(data: NumVerifyApiResponse): data is NumVerifyErrorResponse {
  return 'success' in data && data.success === false
}

// Phone validation route handler
export const phoneValidationHandler = async (c: any) => {
  const { number, country_code } = c.req.valid('query')

  // Get Numverify API key from environment
  const { NUMVERIFY_API_KEY } = env<{ NUMVERIFY_API_KEY: string }>(c)
  if (!NUMVERIFY_API_KEY) {
    throw new HTTPException(INTERNAL_SERVER_ERROR as ContentfulStatusCode, {
      message: 'Numverify API key not configured',
    })
  }

  // Build Numverify API URL
  const url = new URL('http://apilayer.net/api/validate')
  url.searchParams.set('access_key', NUMVERIFY_API_KEY)
  url.searchParams.set('number', number)
  url.searchParams.set('country_code', country_code)

  const numverifyUrl = url.toString()

  try {
    // Call NumVerify API
    const response = await fetch(numverifyUrl)

    if (!response.ok) {
      // Handle HTTP errors from NumVerify API
      let errorMessage = 'Failed to validate phone number'
      let statusCode = BAD_REQUEST

      if (response.status === 401) {
        errorMessage = 'Invalid NumVerify API key'
        statusCode = UNAUTHORIZED
      } else if (response.status === 403) {
        errorMessage = 'NumVerify API access forbidden'
        statusCode = UNAUTHORIZED
      } else if (response.status >= 500) {
        errorMessage = 'NumVerify API service unavailable'
        statusCode = INTERNAL_SERVER_ERROR
      }

      throw new HTTPException(statusCode as ContentfulStatusCode, {
        message: errorMessage,
      })
    }

    const data: NumVerifyApiResponse = await response.json()

    // Log the complete NumVerify API response for internal tracking
    console.log('NumVerify API Response:', JSON.stringify(data, null, 2))

    // Check if NumVerify returned an error response
    if ('success' in data && data.success === false) {
      // Map NumVerify error codes to appropriate HTTP status codes
      let statusCode = BAD_REQUEST
      let message = data.error.info || 'Phone number validation failed'

      // Handle specific NumVerify error codes
      switch (data.error.code) {
        case 101: // Invalid API key
        case 102: // Inactive API key
        case 103: // Invalid API function
          statusCode = UNAUTHORIZED
          message = 'API authentication failed'
          break
        case 210: // No phone number provided
        case 211: // Invalid phone number
        case 310: // Invalid country code
          statusCode = BAD_REQUEST
          message = data.error.info
          break
        case 601: // Monthly API limit exceeded
        case 602: // Rate limit exceeded
          statusCode = TOO_MANY_REQUESTS
          message = 'API rate limit exceeded'
          break
        default:
          message = data.error.info || 'Phone number validation failed'
      }

      throw new HTTPException(statusCode as ContentfulStatusCode, {
        message,
        cause: data,
      })
    }

    // Type guard to ensure we have a success response
    if (!('valid' in data)) {
      throw new HTTPException(INTERNAL_SERVER_ERROR as ContentfulStatusCode, {
        message: 'Unexpected response format from NumVerify API',
      })
    }

    // Return only the validation status to the client
    return c.json({ valid: data.valid }, OK)
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    // Handle network errors and other unexpected errors
    console.error('NumVerify API error:', error)
    throw new HTTPException(INTERNAL_SERVER_ERROR as ContentfulStatusCode, {
      message: 'Internal server error - unable to validate phone number',
    })
  }
}