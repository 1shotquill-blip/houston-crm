// packages/trpc/src/routers/deal.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@elevate/database'

export const dealRouter = router({
  // List deals with filters
  list: tenantProcedure
    .input(z.object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      contactId: z.string().optional(),
      status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(50)
    }))
    .query(async ({ ctx, input }) => {
      const where: Prisma.DealWhereInput = {
        tenantId: ctx.tenantId,
        ...(input.pipelineId && { pipelineId: input.pipelineId }),
        ...(input.stageId && { stageId: input.stageId }),
        ...(input.contactId && { contactId: input.contactId }),
        ...(input.status && { status: input.status })
      }

      const deals = await ctx.prisma.deal.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
          pipeline: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, color: true, order: true } }
        }
      })

      let nextCursor: string | undefined
      if (deals.length > input.limit) {
        const nextItem = deals.pop()
        nextCursor = nextItem!.id
      }

      return { deals, nextCursor }
    }),

  // Get deals grouped by stage (for kanban view)
  byStage: tenantProcedure
    .input(z.object({ pipelineId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify pipeline belongs to tenant
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: { id: input.pipelineId, tenantId: ctx.tenantId },
        include: { stages: { orderBy: { order: 'asc' } } }
      })

      if (!pipeline) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      // Get all deals for this pipeline
      const deals = await ctx.prisma.deal.findMany({
        where: { pipelineId: input.pipelineId, status: 'OPEN' },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
          stage: true
        },
        orderBy: { createdAt: 'desc' }
      })

      // Group by stage
      const dealsByStage = pipeline.stages.map(stage => ({
        stage,
        deals: deals.filter(d => d.stageId === stage.id),
        totalValue: deals
          .filter(d => d.stageId === stage.id)
          .reduce((sum, d) => sum + Number(d.value), 0)
      }))

      return {
        pipeline,
        stages: dealsByStage,
        totalValue: deals.reduce((sum, d) => sum + Number(d.value), 0),
        totalDeals: deals.length
      }
    }),

  // Get single deal
  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deal = await ctx.prisma.deal.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          contact: true,
          pipeline: true,
          stage: true,
          activities: {
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { firstName: true, lastName: true } } }
          }
        }
      })

      if (!deal) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' })
      }

      return deal
    }),

  // Create deal
  create: tenantProcedure
    .input(z.object({
      contactId: z.string(),
      pipelineId: z.string(),
      stageId: z.string(),
      title: z.string().min(1),
      value: z.number().min(0).default(0),
      currency: z.string().default('USD'),
      probability: z.number().min(0).max(100).optional(),
      expectedCloseDate: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify contact, pipeline, and stage belong to tenant
      const [contact, pipeline, stage] = await Promise.all([
        ctx.prisma.contact.findFirst({ where: { id: input.contactId, tenantId: ctx.tenantId } }),
        ctx.prisma.pipeline.findFirst({ where: { id: input.pipelineId, tenantId: ctx.tenantId } }),
        ctx.prisma.pipelineStage.findFirst({ where: { id: input.stageId, pipelineId: input.pipelineId } })
      ])

      if (!contact) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' })
      if (!pipeline) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      if (!stage) throw new TRPCError({ code: 'NOT_FOUND', message: 'Stage not found' })

      const deal = await ctx.prisma.deal.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: input.contactId,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          title: input.title,
          value: input.value,
          currency: input.currency,
          probability: input.probability,
          expectedCloseDate: input.expectedCloseDate,
          status: 'OPEN'
        },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          pipeline: true,
          stage: true
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: input.contactId,
          dealId: deal.id,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Deal created',
          description: `Deal "${deal.title}" created with value ${deal.currency} ${deal.value}`
        }
      })

      return deal
    }),

  // Update deal
  update: tenantProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      value: z.number().min(0).optional(),
      probability: z.number().min(0).max(100).optional(),
      expectedCloseDate: z.date().optional().nullable(),
      status: z.enum(['OPEN', 'WON', 'LOST']).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const existing = await ctx.prisma.deal.findFirst({
        where: { id, tenantId: ctx.tenantId }
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' })
      }

      const deal = await ctx.prisma.deal.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === 'WON' && { actualCloseDate: new Date() }),
          ...(data.status === 'LOST' && { actualCloseDate: new Date() })
        },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true } },
          stage: true
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          contactId: deal.contactId,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Deal updated',
          description: `Deal "${deal.title}" was updated`
        }
      })

      return deal
    }),

  // Move deal to different stage
  moveStage: tenantProcedure
    .input(z.object({
      id: z.string(),
      stageId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await ctx.prisma.deal.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { stage: true, pipeline: true }
      })
      if (!deal) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' })
      }

      // Verify new stage belongs to same pipeline
      const newStage = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.stageId, pipelineId: deal.pipelineId }
      })
      if (!newStage) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid stage for this pipeline' })
      }

      const updated = await ctx.prisma.deal.update({
        where: { id: input.id },
        data: { stageId: input.stageId },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true } },
          stage: true
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          contactId: deal.contactId,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Deal moved',
          description: `Deal moved from "${deal.stage.name}" to "${newStage.name}"`
        }
      })

      return updated
    }),

  // Delete deal
  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await ctx.prisma.deal.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId }
      })
      if (!deal) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' })
      }

      await ctx.prisma.deal.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // Get deal statistics
  stats: tenantProcedure
    .input(z.object({ 
      pipelineId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const where: Prisma.DealWhereInput = {
        tenantId: ctx.tenantId,
        ...(input.pipelineId && { pipelineId: input.pipelineId }),
        ...(input.startDate && { createdAt: { gte: input.startDate } }),
        ...(input.endDate && { createdAt: { lte: input.endDate } })
      }

      const [totalDeals, wonDeals, lostDeals, openDeals, totalValue, wonValue] = await Promise.all([
        ctx.prisma.deal.count({ where }),
        ctx.prisma.deal.count({ where: { ...where, status: 'WON' } }),
        ctx.prisma.deal.count({ where: { ...where, status: 'LOST' } }),
        ctx.prisma.deal.count({ where: { ...where, status: 'OPEN' } }),
        ctx.prisma.deal.aggregate({
          where,
          _sum: { value: true }
        }),
        ctx.prisma.deal.aggregate({
          where: { ...where, status: 'WON' },
          _sum: { value: true }
        })
      ])

      const winRate = totalDeals > 0 ? ((wonDeals / (wonDeals + lostDeals)) * 100) : 0

      return {
        totalDeals,
        wonDeals,
        lostDeals,
        openDeals,
        totalValue: Number(totalValue._sum.value || 0),
        wonValue: Number(wonValue._sum.value || 0),
        winRate: Math.round(winRate * 10) / 10
      }
    })
})
