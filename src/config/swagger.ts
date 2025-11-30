import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tawfir API',
      version: '1.0.0',
      description: 'API documentation for the Tawfir food surplus management platform',
      contact: {
        name: 'Tawfir Support',
        email: 'support@tawfir.com',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Auth',
        description: 'Authentication endpoints',
      },
      {
        name: 'Users',
        description: 'User management endpoints',
      },
      {
        name: 'Restaurants',
        description: 'Restaurant management endpoints',
      },
      {
        name: 'Dishes',
        description: 'Dish/Menu item endpoints',
      },
      {
        name: 'Orders',
        description: 'Order management endpoints',
      },
      {
        name: 'Categories',
        description: 'Food category endpoints',
      },
      {
        name: 'Payments',
        description: 'Payment and transaction endpoints',
      },
      {
        name: 'Admin',
        description: 'Admin-only endpoints',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/index.ts'], // Paths to files containing OpenAPI definitions
};

export const swaggerSpec = swaggerJsdoc(options);

