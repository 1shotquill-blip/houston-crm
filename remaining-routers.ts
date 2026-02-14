// packages/trpc/src/routers/calendar.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const calendarRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.calendar.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { appointments: true } } }
    })
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const calendar = await ctx.prisma.calendar.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId }
      })
      if (!calendar) throw new TRPCError({ code: 'NOT_FOUND' })
      return calendar
    }),

  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().default('#3B82F6'),
      timezone: z.string().default('America/New_York'),
      bufferMinutes: z.number().default(15)
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.calendar.create({
        data: { ...input, tenantId: ctx.tenantId }
      })
    }),

  // Appointments
  listAppointments: tenantProcedure
    .input(z.object({
      calendarId: z.string().optional(),
      startDate: z.date(),
      endDate: z.date()
    }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.appointment.findMany({
        where: {
          calendar: { tenantId: ctx.tenantId },
          ...(input.calendarId && { calendarId: input.calendarId }),
          startTime: { gte: input.startDate, lte: input.endDate }
        },
        include: {
          contact: { select: { firstName: true, lastName: true, email: true } },
          calendar: { select: { name: true, color: true } }
        },
        orderBy: { startTime: 'asc' }
      })
    }),

  createAppointment: tenantProcedure
    .input(z.object({
      calendarId: z.string(),
      contactId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      startTime: z.date(),
      endTime: z.date(),
      guestName: z.string().optional(),
      guestEmail: z.string().email().optional(),
      locationType: z.enum(['ZOOM', 'GOOGLE_MEET', 'PHONE', 'IN_PERSON', 'CUSTOM']).default('ZOOM')
    }))
    .mutation(async ({ ctx, input }) => {
      const calendar = await ctx.prisma.calendar.findFirst({
        where: { id: input.calendarId, tenantId: ctx.tenantId }
      })
      if (!calendar) throw new TRPCError({ code: 'NOT_FOUND', message: 'Calendar not found' })

      return await ctx.prisma.appointment.create({
        data: { ...input, status: 'CONFIRMED' }
      })
    })
})

// packages/trpc/src/routers/funnel.ts
export const funnelRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.funnel.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { pages: true } } },
      orderBy: { createdAt: 'desc' }
    })
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const funnel = await ctx.prisma.funnel.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { pages: { orderBy: { createdAt: 'asc' } } }
      })
      if (!funnel) throw new TRPCError({ code: 'NOT_FOUND' })
      return funnel
    }),

  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/)
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.funnel.findFirst({
        where: { tenantId: ctx.tenantId, slug: input.slug }
      })
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Slug already exists' })

      return await ctx.prisma.funnel.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          status: 'DRAFT'
        }
      })
    })
})

// packages/trpc/src/routers/automation.ts
export const automationRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.automation.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' }
    })
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId }
      })
      if (!automation) throw new TRPCError({ code: 'NOT_FOUND' })
      return automation
    }),

  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      trigger: z.any(),
      nodes: z.any(),
      edges: z.any()
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.automation.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          status: 'DRAFT'
        }
      })
    })
})

// packages/trpc/src/routers/settings.ts
export const settingsRouter = router({
  getTenant: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.tenant.findUnique({
      where: { id: ctx.tenantId }
    })
  }),

  updateTenant: tenantProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      branding: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: input
      })
    }),

  listUsers: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLoginAt: true
      }
    })
  }),

  listTags: tenantProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.tag.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { contacts: true } } }
    })
  }),

  createTag: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      color: z.string().default('#3B82F6')
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.tag.create({
        data: { ...input, tenantId: ctx.tenantId }
      })
    })
})
