// packages/trpc/src/routers/analytics.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'

export const analyticsRouter = router({
  // Dashboard overview
  overview: tenantProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const startDate = input.startDate || new Date(now.getFullYear(), now.getMonth(), 1)
      const endDate = input.endDate || now

      // Get counts for current period
      const [
        totalContacts,
        newContacts,
        totalDeals,
        openDeals,
        wonDeals,
        totalDealValue,
        wonDealValue,
        emailsSent,
        smsSent,
        appointmentsScheduled
      ] = await Promise.all([
        // Total contacts
        ctx.prisma.contact.count({
          where: { tenantId: ctx.tenantId }
        }),
        // New contacts in period
        ctx.prisma.contact.count({
          where: {
            tenantId: ctx.tenantId,
            createdAt: { gte: startDate, lte: endDate }
          }
        }),
        // Total deals
        ctx.prisma.deal.count({
          where: { tenantId: ctx.tenantId }
        }),
        // Open deals
        ctx.prisma.deal.count({
          where: { tenantId: ctx.tenantId, status: 'OPEN' }
        }),
        // Won deals in period
        ctx.prisma.deal.count({
          where: {
            tenantId: ctx.tenantId,
            status: 'WON',
            actualCloseDate: { gte: startDate, lte: endDate }
          }
        }),
        // Total deal value
        ctx.prisma.deal.aggregate({
          where: { tenantId: ctx.tenantId, status: 'OPEN' },
          _sum: { value: true }
        }),
        // Won deal value in period
        ctx.prisma.deal.aggregate({
          where: {
            tenantId: ctx.tenantId,
            status: 'WON',
            actualCloseDate: { gte: startDate, lte: endDate }
          },
          _sum: { value: true }
        }),
        // Emails sent in period
        ctx.prisma.email.count({
          where: {
            tenantId: ctx.tenantId,
            sentAt: { gte: startDate, lte: endDate }
          }
        }),
        // SMS sent in period
        ctx.prisma.smsMessage.count({
          where: {
            tenantId: ctx.tenantId,
            sentAt: { gte: startDate, lte: endDate }
          }
        }),
        // Appointments scheduled in period
        ctx.prisma.appointment.count({
          where: {
            tenantId: ctx.tenantId,
            createdAt: { gte: startDate, lte: endDate },
            status: { not: 'CANCELLED' }
          }
        })
      ])

      return {
        contacts: {
          total: totalContacts,
          new: newContacts
        },
        deals: {
          total: totalDeals,
          open: openDeals,
          won: wonDeals,
          totalValue: Number(totalDealValue._sum.value || 0),
          wonValue: Number(wonDealValue._sum.value || 0)
        },
        communication: {
          emailsSent,
          smsSent
        },
        appointments: {
          scheduled: appointmentsScheduled
        }
      }
    }),

  // Contact growth over time
  contactGrowth: tenantProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      interval: z.enum(['day', 'week', 'month']).default('day')
    }))
    .query(async ({ ctx, input }) => {
      // Get contacts grouped by creation date
      const contacts = await ctx.prisma.contact.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: input.startDate, lte: input.endDate }
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' }
      })

      // Group by interval
      const grouped = new Map<string, number>()
      contacts.forEach(contact => {
        const date = contact.createdAt
        let key: string

        if (input.interval === 'day') {
          key = date.toISOString().split('T')[0]
        } else if (input.interval === 'week') {
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          key = weekStart.toISOString().split('T')[0]
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        }

        grouped.set(key, (grouped.get(key) || 0) + 1)
      })

      return Array.from(grouped.entries()).map(([date, count]) => ({
        date,
        count
      }))
    }),

  // Pipeline performance
  pipelinePerformance: tenantProcedure
    .input(z.object({
      pipelineId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        tenantId: ctx.tenantId,
        ...(input.pipelineId && { pipelineId: input.pipelineId }),
        ...(input.startDate && { createdAt: { gte: input.startDate } }),
        ...(input.endDate && { createdAt: { lte: input.endDate } })
      }

      const [stageDistribution, conversionRates] = await Promise.all([
        // Deals by stage
        ctx.prisma.deal.groupBy({
          by: ['stageId'],
          where: { ...where, status: 'OPEN' },
          _count: true,
          _sum: { value: true }
        }),
        // Conversion rates
        ctx.prisma.deal.groupBy({
          by: ['status'],
          where,
          _count: true,
          _sum: { value: true }
        })
      ])

      // Get stage details
      const stageIds = stageDistribution.map(s => s.stageId)
      const stages = await ctx.prisma.pipelineStage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, name: true, color: true }
      })

      const stageMap = new Map(stages.map(s => [s.id, s]))

      return {
        byStage: stageDistribution.map(s => ({
          stage: stageMap.get(s.stageId),
          count: s._count,
          value: Number(s._sum.value || 0)
        })),
        byStatus: conversionRates.map(s => ({
          status: s.status,
          count: s._count,
          value: Number(s._sum.value || 0)
        }))
      }
    }),

  // Lead sources analysis
  leadSources: tenantProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const sources = await ctx.prisma.contact.groupBy({
        by: ['leadSource'],
        where: {
          tenantId: ctx.tenantId,
          leadSource: { not: null },
          ...(input.startDate && { createdAt: { gte: input.startDate } }),
          ...(input.endDate && { createdAt: { lte: input.endDate } })
        },
        _count: true,
        orderBy: { _count: { leadSource: 'desc' } },
        take: 10
      })

      return sources.map(s => ({
        source: s.leadSource || 'Unknown',
        count: s._count
      }))
    }),

  // Activity timeline
  activityTimeline: tenantProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      limit: z.number().min(1).max(100).default(50)
    }))
    .query(async ({ ctx, input }) => {
      const activities = await ctx.prisma.activity.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: input.startDate, lte: input.endDate }
        },
        take: input.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true } },
          contact: { select: { firstName: true, lastName: true } },
          deal: { select: { title: true } }
        }
      })

      return activities
    }),

  // Email performance
  emailPerformance: tenantProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        tenantId: ctx.tenantId,
        ...(input.startDate && { sentAt: { gte: input.startDate } }),
        ...(input.endDate && { sentAt: { lte: input.endDate } })
      }

      const [total, opened, clicked, bounced] = await Promise.all([
        ctx.prisma.email.count({ where }),
        ctx.prisma.email.count({ where: { ...where, openedAt: { not: null } } }),
        ctx.prisma.email.count({ where: { ...where, clickedAt: { not: null } } }),
        ctx.prisma.email.count({ where: { ...where, status: 'BOUNCED' } })
      ])

      const openRate = total > 0 ? (opened / total) * 100 : 0
      const clickRate = total > 0 ? (clicked / total) * 100 : 0
      const bounceRate = total > 0 ? (bounced / total) * 100 : 0

      return {
        total,
        opened,
        clicked,
        bounced,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 10) / 10
      }
    }),

  // Revenue tracking
  revenue: tenantProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      interval: z.enum(['day', 'week', 'month']).default('month')
    }))
    .query(async ({ ctx, input }) => {
      const wonDeals = await ctx.prisma.deal.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: 'WON',
          actualCloseDate: { gte: input.startDate, lte: input.endDate }
        },
        select: { value: true, actualCloseDate: true },
        orderBy: { actualCloseDate: 'asc' }
      })

      // Group by interval
      const grouped = new Map<string, number>()
      wonDeals.forEach(deal => {
        if (!deal.actualCloseDate) return

        const date = deal.actualCloseDate
        let key: string

        if (input.interval === 'day') {
          key = date.toISOString().split('T')[0]
        } else if (input.interval === 'week') {
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          key = weekStart.toISOString().split('T')[0]
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        }

        const current = grouped.get(key) || 0
        grouped.set(key, current + Number(deal.value))
      })

      return Array.from(grouped.entries()).map(([date, revenue]) => ({
        date,
        revenue
      }))
    })
})
