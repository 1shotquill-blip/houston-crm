// packages/trpc/src/routers/pipeline.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const pipelineRouter = router({
  // List all pipelines
  list: tenantProcedure
    .query(async ({ ctx }) => {
      const pipelines = await ctx.prisma.pipeline.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          stages: { orderBy: { order: 'asc' } },
          _count: { select: { deals: true } }
        },
        orderBy: { order: 'asc' }
      })

      return pipelines
    }),

  // Get single pipeline with stages
  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          stages: { orderBy: { order: 'asc' } },
          deals: {
            where: { status: 'OPEN' },
            include: {
              contact: { select: { firstName: true, lastName: true, email: true } }
            }
          }
        }
      })

      if (!pipeline) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      return pipeline
    }),

  // Create pipeline
  create: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      stages: z.array(z.object({
        name: z.string().min(1),
        color: z.string().default('#6B7280')
      })).min(1)
    }))
    .mutation(async ({ ctx, input }) => {
      const { stages, ...pipelineData } = input

      // Get the current max order
      const pipelines = await ctx.prisma.pipeline.findMany({
        where: { tenantId: ctx.tenantId },
        select: { order: true },
        orderBy: { order: 'desc' },
        take: 1
      })
      const nextOrder = (pipelines[0]?.order ?? -1) + 1

      const pipeline = await ctx.prisma.pipeline.create({
        data: {
          ...pipelineData,
          tenantId: ctx.tenantId,
          order: nextOrder,
          stages: {
            create: stages.map((stage, index) => ({
              name: stage.name,
              color: stage.color,
              order: index
            }))
          }
        },
        include: {
          stages: { orderBy: { order: 'asc' } }
        }
      })

      return pipeline
    }),

  // Update pipeline
  update: tenantProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      const existing = await ctx.prisma.pipeline.findFirst({
        where: { id, tenantId: ctx.tenantId }
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      const pipeline = await ctx.prisma.pipeline.update({
        where: { id },
        data,
        include: {
          stages: { orderBy: { order: 'asc' } }
        }
      })

      return pipeline
    }),

  // Delete pipeline
  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { _count: { select: { deals: true } } }
      })

      if (!pipeline) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      if (pipeline._count.deals > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete pipeline with active deals'
        })
      }

      await ctx.prisma.pipeline.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // Add stage to pipeline
  addStage: tenantProcedure
    .input(z.object({
      pipelineId: z.string(),
      name: z.string().min(1),
      color: z.string().default('#6B7280'),
      position: z.number().optional() // Insert at specific position
    }))
    .mutation(async ({ ctx, input }) => {
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: { id: input.pipelineId, tenantId: ctx.tenantId },
        include: { stages: { orderBy: { order: 'asc' } } }
      })

      if (!pipeline) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      const order = input.position ?? pipeline.stages.length

      // If inserting in middle, shift existing stages
      if (order < pipeline.stages.length) {
        await ctx.prisma.pipelineStage.updateMany({
          where: {
            pipelineId: input.pipelineId,
            order: { gte: order }
          },
          data: { order: { increment: 1 } }
        })
      }

      const stage = await ctx.prisma.pipelineStage.create({
        data: {
          pipelineId: input.pipelineId,
          name: input.name,
          color: input.color,
          order
        }
      })

      return stage
    }),

  // Update stage
  updateStage: tenantProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // Verify stage belongs to tenant's pipeline
      const stage = await ctx.prisma.pipelineStage.findFirst({
        where: { id, pipeline: { tenantId: ctx.tenantId } }
      })

      if (!stage) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Stage not found' })
      }

      const updated = await ctx.prisma.pipelineStage.update({
        where: { id },
        data
      })

      return updated
    }),

  // Reorder stages
  reorderStages: tenantProcedure
    .input(z.object({
      pipelineId: z.string(),
      stageOrders: z.array(z.object({
        stageId: z.string(),
        order: z.number()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: { id: input.pipelineId, tenantId: ctx.tenantId }
      })

      if (!pipeline) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline not found' })
      }

      // Update each stage order
      await Promise.all(
        input.stageOrders.map(({ stageId, order }) =>
          ctx.prisma.pipelineStage.update({
            where: { id: stageId },
            data: { order }
          })
        )
      )

      return { success: true }
    }),

  // Delete stage
  deleteStage: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.id, pipeline: { tenantId: ctx.tenantId } },
        include: { _count: { select: { deals: true } } }
      })

      if (!stage) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Stage not found' })
      }

      if (stage._count.deals > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete stage with active deals. Move or delete deals first.'
        })
      }

      await ctx.prisma.pipelineStage.delete({ where: { id: input.id } })

      // Reorder remaining stages
      await ctx.prisma.$executeRaw`
        UPDATE pipeline_stages 
        SET "order" = "order" - 1 
        WHERE pipeline_id = ${stage.pipelineId} 
        AND "order" > ${stage.order}
      `

      return { success: true }
    })
})
