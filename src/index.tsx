import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import {
  phoneValidationRoute,
  phoneValidationHandler,
  phoneValidationRateLimit,
  getCorsConfig,
} from './routes/phone-validation'

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

app.get('/', (c) => {
  return c.json({
    message: 'BDC Backend API',
    version: '1.0.0',
    endpoints: {
      documentation: '/docs',
      openapi: '/openapi.json',
      phoneValidation: '/api/validate-phone',
    },
  })
})

// Apply global CORS middleware
app.use('*', cors(getCorsConfig()))

// Apply rate limiting specifically to phone validation endpoint
app.use('/api/validate-phone', phoneValidationRateLimit)

// Mount phone validation route
app.openapi(phoneValidationRoute, phoneValidationHandler)

// Add OpenAPI documentation endpoint
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'BDC Backend API',
    description: 'Backend API for BDC application',
  },
})

// Add Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }))

app.get('/hello-world', (c) => {
  return c.text('Hello, World! - Hot Reload Test')
})

app.get(
  '/page/*',
  jsxRenderer(({ children }) => {
    return (
      <html>
        <body>
          <header>
            <title>BDC Form</title>
          </header>
          <div>{children}</div>
        </body>
      </html>
    )
  })
)

app.get('/page/about', (c) => {
  return c.render(<h1>About me!</h1>)
})

export default app
