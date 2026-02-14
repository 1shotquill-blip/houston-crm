// packages/trpc/src/routers/sms.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const smsRouter = router({
  // List SMS accounts
  listAccounts: tenantProcedure
    .query(async ({ ctx }) => {
      const accounts = await ctx.prisma.smsAccount.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { isDefault: 'desc' }
      })
      return accounts
    }),

  // Create SMS account
  createAccount: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      provider: z.enum(['TWILIO', 'TELNYX', 'PLIVO']),
      accountSid: z.string(),
      authToken: z.string(),
      fromNumber: z.string().regex(/^\+\d{10,15}$/, 'Must be E.164 format'),
      isDefault: z.boolean().default(false)
    }))
    .mutation(async ({ ctx, input }) => {
      // If setting as default, unset other defaults
      if (input.isDefault) {
        await ctx.prisma.smsAccount.updateMany({
          where: { tenantId: ctx.tenantId, isDefault: true },
          data: { isDefault: false }
        })
      }

      const account = await ctx.prisma.smsAccount.create({
        data: {
          ...input,
          tenantId: ctx.tenantId
        }
      })

      return account
    }),

  // Send SMS
  send: tenantProcedure
    .input(z.object({
      accountId: z.string().optional(),
      contactId: z.string().optional(),
      to: z.string().regex(/^\+\d{10,15}$/, 'Must be E.164 format'),
      body: z.string().min(1).max(1600), // SMS limit
      scheduledFor: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      // Get SMS account
      let account
      if (input.accountId) {
        account = await ctx.prisma.smsAccount.findFirst({
          where: { id: input.accountId, tenantId: ctx.tenantId }
        })
      } else {
        account = await ctx.prisma.smsAccount.findFirst({
          where: { tenantId: ctx.tenantId, isDefault: true }
        })
      }

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No SMS account configured. Please add an SMS account first.'
        })
      }

      // Create SMS record
      const sms = await ctx.prisma.smsMessage.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: account.id,
          contactId: input.contactId,
          to: input.to,
          from: account.fromNumber,
          body: input.body,
          status: input.scheduledFor ? 'QUEUED' : 'QUEUED'
        }
      })

      // Queue for sending (actual sending happens in worker)

      // Log activity if associated with contact
      if (input.contactId) {
        await ctx.prisma.activity.create({
          data: {
            tenantId: ctx.tenantId,
            contactId: input.contactId,
            userId: ctx.user.id,
            type: 'SMS',
            title: 'SMS sent',
            description: input.body.substring(0, 100),
            metadata: { smsId: sms.id }
          }
        })
      }

      return sms
    }),

  // List sent SMS
  list: tenantProcedure
    .input(z.object({
      contactId: z.string().optional(),
      status: z.enum(['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED']).optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(50)
    }))
    .query(async ({ ctx, input }) => {
      const messages = await ctx.prisma.smsMessage.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.contactId && { contactId: input.contactId }),
          ...(input.status && { status: input.status })
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: { select: { firstName: true, lastName: true, phone: true } }
        }
      })

      let nextCursor: string | undefined
      if (messages.length > input.limit) {
        const nextItem = messages.pop()
        nextCursor = nextItem!.id
      }

      return { messages, nextCursor }
    }),

  // Get SMS statistics
  stats: tenantProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        tenantId: ctx.tenantId,
        ...(input.startDate && { createdAt: { gte: input.startDate } }),
        ...(input.endDate && { createdAt: { lte: input.endDate } })
      }

      const [total, sent, delivered, failed] = await Promise.all([
        ctx.prisma.smsMessage.count({ where }),
        ctx.prisma.smsMessage.count({ where: { ...where, status: 'SENT' } }),
        ctx.prisma.smsMessage.count({ where: { ...where, status: 'DELIVERED' } }),
        ctx.prisma.smsMessage.count({ where: { ...where, status: 'FAILED' } })
      ])

      const deliveryRate = total > 0 ? (delivered / total) * 100 : 0
      const failureRate = total > 0 ? (failed / total) * 100 : 0

      return {
        total,
        sent,
        delivered,
        failed,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        failureRate: Math.round(failureRate * 10) / 10
      }
    })
})
