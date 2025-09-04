import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { phoneValidationApp } from './routes/phone-validation'

const app = new OpenAPIHono()

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

// Mount phone validation routes
app.route('/', phoneValidationApp)

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

export default app
