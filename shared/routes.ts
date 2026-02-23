import { z } from 'zod';
import { insertApplicationSchema, insertBookingRequestSchema } from './schema.js';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  applications: {
    create: {
      method: 'POST' as const,
      path: '/api/applications' as const,
      input: insertApplicationSchema,
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
  },
  retreats: {
    list: {
      method: 'GET' as const,
      path: '/api/retreats' as const,
    },
    get: {
      method: 'GET' as const,
      path: '/api/retreats/:id' as const,
    },
    properties: {
      method: 'GET' as const,
      path: '/api/retreats/:id/properties' as const,
    },
  },
  bookingRequests: {
    create: {
      method: 'POST' as const,
      path: '/api/booking-requests' as const,
    },
    mine: {
      method: 'GET' as const,
      path: '/api/booking-requests/me' as const,
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
