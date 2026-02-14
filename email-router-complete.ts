// packages/trpc/src/routers/email.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const emailRouter = router({
  // List email accounts
  listAccounts: tenantProcedure
    .query(async ({ ctx }) => {
      const accounts = await ctx.prisma.emailAccount.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { isDefault: 'desc' }
      })
      return accounts
    }),

  // Create email account
  createAccount: tenantProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      provider: z.enum(['SENDGRID', 'MAILGUN', 'SES', 'SMTP', 'POSTMARK']),
      apiKey: z.string().optional(),
      smtpHost: z.string().optional(),
      smtpPort: z.number().optional(),
      smtpUser: z.string().optional(),
      smtpPass: z.string().optional(),
      isDefault: z.boolean().default(false)
    }))
    .mutation(async ({ ctx, input }) => {
      // If setting as default, unset other defaults
      if (input.isDefault) {
        await ctx.prisma.emailAccount.updateMany({
          where: { tenantId: ctx.tenantId, isDefault: true },
          data: { isDefault: false }
        })
      }

      const account = await ctx.prisma.emailAccount.create({
        data: {
          ...input,
          tenantId: ctx.tenantId
        }
      })

      return account
    }),

  // Send email
  send: tenantProcedure
    .input(z.object({
      accountId: z.string().optional(), // Use default if not specified
      contactId: z.string().optional(),
      to: z.array(z.string().email()).min(1),
      cc: z.array(z.string().email()).default([]),
      bcc: z.array(z.string().email()).default([]),
      subject: z.string().min(1),
      body: z.string().min(1),
      bodyHtml: z.string().optional(),
      trackOpens: z.boolean().default(true),
      trackClicks: z.boolean().default(true),
      scheduledFor: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      // Get email account
      let account
      if (input.accountId) {
        account = await ctx.prisma.emailAccount.findFirst({
          where: { id: input.accountId, tenantId: ctx.tenantId }
        })
      } else {
        account = await ctx.prisma.emailAccount.findFirst({
          where: { tenantId: ctx.tenantId, isDefault: true }
        })
      }

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No email account configured. Please add an email account first.'
        })
      }

      // Generate tracking ID if tracking enabled
      const trackingId = (input.trackOpens || input.trackClicks)
        ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : null

      // Create email record
      const email = await ctx.prisma.email.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: account.id,
          contactId: input.contactId,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          from: account.email,
          subject: input.subject,
          body: input.body,
          bodyHtml: input.bodyHtml,
          trackingId,
          status: input.scheduledFor ? 'QUEUED' : 'QUEUED'
        }
      })

      // Queue for sending (actual sending happens in worker)
      // For now, we'll mark it as QUEUED and return
      // The worker will pick this up and send via the provider

      // Log activity if associated with contact
      if (input.contactId) {
        await ctx.prisma.activity.create({
          data: {
            tenantId: ctx.tenantId,
            contactId: input.contactId,
            userId: ctx.user.id,
            type: 'EMAIL',
            title: 'Email sent',
            description: input.subject,
            metadata: { emailId: email.id }
          }
        })
      }

      return email
    }),

  // List sent emails
  list: tenantProcedure
    .input(z.object({
      contactId: z.string().optional(),
      status: z.enum(['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED']).optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(50)
    }))
    .query(async ({ ctx, input }) => {
      const emails = await ctx.prisma.email.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.contactId && { contactId: input.contactId }),
          ...(input.status && { status: input.status })
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: { select: { firstName: true, lastName: true, email: true } }
        }
      })

      let nextCursor: string | undefined
      if (emails.length > input.limit) {
        const nextItem = emails.pop()
        nextCursor = nextItem!.id
      }

      return { emails, nextCursor }
    }),

  // Get email details
  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const email = await ctx.prisma.email.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          contact: true,
          account: { select: { name: true, email: true, provider: true } }
        }
      })

      if (!email) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found' })
      }

      return email
    }),

  // Track email open (webhook endpoint will call this)
  trackOpen: tenantProcedure
    .input(z.object({ trackingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = await ctx.prisma.email.findFirst({
        where: { trackingId: input.trackingId, tenantId: ctx.tenantId }
      })

      if (email && !email.openedAt) {
        await ctx.prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'OPENED',
            openedAt: new Date()
          }
        })
      }

      return { success: true }
    }),

  // Track email click
  trackClick: tenantProcedure
    .input(z.object({ trackingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = await ctx.prisma.email.findFirst({
        where: { trackingId: input.trackingId, tenantId: ctx.tenantId }
      })

      if (email && !email.clickedAt) {
        await ctx.prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'CLICKED',
            clickedAt: new Date()
          }
        })
      }

      return { success: true }
    }),

  // Get email statistics
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

      const [total, sent, delivered, opened, clicked, bounced, failed] = await Promise.all([
        ctx.prisma.email.count({ where }),
        ctx.prisma.email.count({ where: { ...where, status: 'SENT' } }),
        ctx.prisma.email.count({ where: { ...where, status: 'DELIVERED' } }),
        ctx.prisma.email.count({ where: { ...where, openedAt: { not: null } } }),
        ctx.prisma.email.count({ where: { ...where, clickedAt: { not: null } } }),
        ctx.prisma.email.count({ where: { ...where, status: 'BOUNCED' } }),
        ctx.prisma.email.count({ where: { ...where, status: 'FAILED' } })
      ])

      const openRate = delivered > 0 ? (opened / delivered) * 100 : 0
      const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0
      const deliveryRate = total > 0 ? (delivered / total) * 100 : 0

      return {
        total,
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        failed,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        deliveryRate: Math.round(deliveryRate * 10) / 10
      }
    })
})
