// packages/trpc/src/routers/contact.ts
import { z } from 'zod'
import { router, tenantProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@elevate/database'

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  leadSource: z.string().optional().nullable(),
  leadStatus: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
  assignedToId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  customData: z.record(z.any()).optional()
})

export const contactRouter = router({
  // List contacts with filters and pagination
  list: tenantProcedure
    .input(z.object({
      search: z.string().optional(),
      tagIds: z.array(z.string()).optional(),
      leadStatus: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
      assignedToId: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(20)
    }))
    .query(async ({ ctx, input }) => {
      const where: Prisma.ContactWhereInput = {
        tenantId: ctx.tenantId,
        ...(input.search && {
          OR: [
            { firstName: { contains: input.search, mode: 'insensitive' } },
            { lastName: { contains: input.search, mode: 'insensitive' } },
            { email: { contains: input.search, mode: 'insensitive' } },
            { company: { contains: input.search, mode: 'insensitive' } }
          ]
        }),
        ...(input.leadStatus && { leadStatus: input.leadStatus }),
        ...(input.assignedToId && { assignedToId: input.assignedToId }),
        ...(input.tagIds?.length && {
          tags: { some: { tagId: { in: input.tagIds } } }
        })
      }

      const contacts = await ctx.prisma.contact.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          tags: { include: { tag: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { deals: true, activities: true, notes: true } }
        }
      })

      let nextCursor: string | undefined
      if (contacts.length > input.limit) {
        const nextItem = contacts.pop()
        nextCursor = nextItem!.id
      }

      return { contacts, nextCursor }
    }),

  // Get single contact with full details
  get: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          tags: { include: { tag: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          deals: { include: { pipeline: true, stage: true } },
          activities: { 
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { firstName: true, lastName: true } } }
          },
          notes: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { user: { select: { firstName: true, lastName: true } } }
          },
          appointments: { where: { status: { not: 'CANCELLED' } }, orderBy: { startTime: 'asc' } },
          emails: { orderBy: { createdAt: 'desc' }, take: 20 },
          smsMessages: { orderBy: { createdAt: 'desc' }, take: 20 }
        }
      })

      if (!contact) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' })
      }

      return contact
    }),

  // Create contact
  create: tenantProcedure
    .input(contactSchema)
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...contactData } = input

      // Check for duplicate email
      if (contactData.email) {
        const existing = await ctx.prisma.contact.findFirst({
          where: { tenantId: ctx.tenantId, email: contactData.email }
        })
        if (existing) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'A contact with this email already exists' 
          })
        }
      }

      const contact = await ctx.prisma.contact.create({
        data: {
          ...contactData,
          tenantId: ctx.tenantId,
          tags: tagIds?.length ? {
            create: tagIds.map(tagId => ({ tagId }))
          } : undefined
        },
        include: {
          tags: { include: { tag: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } }
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: contact.id,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Contact created',
          description: `Contact ${contact.firstName} ${contact.lastName} was created`
        }
      })

      return contact
    }),

  // Update contact
  update: tenantProcedure
    .input(z.object({
      id: z.string(),
      data: contactSchema.partial()
    }))
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...contactData } = input.data

      // Verify contact belongs to tenant
      const existing = await ctx.prisma.contact.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId }
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' })
      }

      // Handle tag updates
      const contact = await ctx.prisma.contact.update({
        where: { id: input.id },
        data: {
          ...contactData,
          ...(tagIds !== undefined && {
            tags: {
              deleteMany: {},
              create: tagIds.map(tagId => ({ tagId }))
            }
          })
        },
        include: {
          tags: { include: { tag: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } }
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: contact.id,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Contact updated',
          description: `Contact ${contact.firstName} ${contact.lastName} was updated`
        }
      })

      return contact
    }),

  // Delete contact
  delete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId }
      })
      if (!contact) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' })
      }

      await ctx.prisma.contact.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // Bulk delete
  bulkDelete: tenantProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.contact.deleteMany({
        where: { id: { in: input.ids }, tenantId: ctx.tenantId }
      })
      return { deleted: result.count }
    }),

  // Add note to contact
  addNote: tenantProcedure
    .input(z.object({
      contactId: z.string(),
      content: z.string().min(1)
    }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.prisma.contact.findFirst({
        where: { id: input.contactId, tenantId: ctx.tenantId }
      })
      if (!contact) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' })
      }

      const note = await ctx.prisma.note.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: input.contactId,
          userId: ctx.user.id,
          content: input.content
        },
        include: {
          user: { select: { firstName: true, lastName: true } }
        }
      })

      // Log activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: input.contactId,
          userId: ctx.user.id,
          type: 'NOTE',
          title: 'Note added',
          description: input.content.substring(0, 100)
        }
      })

      return note
    }),

  // Bulk import from CSV
  bulkImport: tenantProcedure
    .input(z.object({
      contacts: z.array(z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        leadSource: z.string().optional(),
        tags: z.array(z.string()).optional()
      })),
      skipDuplicates: z.boolean().default(true)
    }))
    .mutation(async ({ ctx, input }) => {
      const results = {
        created: 0,
        skipped: 0,
        errors: [] as string[]
      }

      for (const contactData of input.contacts) {
        try {
          // Check for duplicate email
          if (input.skipDuplicates && contactData.email) {
            const existing = await ctx.prisma.contact.findFirst({
              where: { tenantId: ctx.tenantId, email: contactData.email }
            })
            if (existing) {
              results.skipped++
              continue
            }
          }

          const { tags, ...data } = contactData

          await ctx.prisma.contact.create({
            data: {
              ...data,
              tenantId: ctx.tenantId,
              leadStatus: 'NEW'
            }
          })

          results.created++
        } catch (error) {
          results.errors.push(`Failed to import ${contactData.email}: ${error}`)
        }
      }

      // Log bulk import activity
      await ctx.prisma.activity.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Bulk contact import',
          description: `Imported ${results.created} contacts, skipped ${results.skipped} duplicates`
        }
      })

      return results
    }),

  // Get contact statistics
  stats: tenantProcedure
    .query(async ({ ctx }) => {
      const [total, byStatus, bySource, recentlyAdded] = await Promise.all([
        ctx.prisma.contact.count({ where: { tenantId: ctx.tenantId } }),
        ctx.prisma.contact.groupBy({
          by: ['leadStatus'],
          where: { tenantId: ctx.tenantId },
          _count: true
        }),
        ctx.prisma.contact.groupBy({
          by: ['leadSource'],
          where: { tenantId: ctx.tenantId, leadSource: { not: null } },
          _count: true,
          orderBy: { _count: { leadSource: 'desc' } },
          take: 10
        }),
        ctx.prisma.contact.count({
          where: {
            tenantId: ctx.tenantId,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        })
      ])

      return {
        total,
        byStatus: Object.fromEntries(byStatus.map(s => [s.leadStatus, s._count])),
        topSources: bySource.map(s => ({ source: s.leadSource, count: s._count })),
        recentlyAdded
      }
    })
})
