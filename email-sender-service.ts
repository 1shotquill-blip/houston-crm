// packages/worker/src/services/email-sender.ts
import sgMail from '@sendgrid/mail'
import { PrismaClient } from '@elevate/database'

const prisma = new PrismaClient()

interface SendEmailParams {
  emailId: string
}

export class EmailSender {
  private initialized = false

  private ensureInitialized(apiKey: string) {
    if (!this.initialized) {
      sgMail.setApiKey(apiKey)
      this.initialized = true
    }
  }

  async send({ emailId }: SendEmailParams): Promise<void> {
    try {
      // Get email record
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { account: true }
      })

      if (!email) {
        throw new Error(`Email ${emailId} not found`)
      }

      if (email.status !== 'QUEUED') {
        console.log(`Email ${emailId} already processed (status: ${email.status})`)
        return
      }

      // Update status to SENDING
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'SENDING' }
      })

      // Get API key based on provider
      let apiKey: string | null = null

      if (email.account.provider === 'SENDGRID') {
        apiKey = email.account.apiKey
      } else if (email.account.provider === 'SMTP') {
        // Handle SMTP sending separately
        await this.sendViaSMTP(email, email.account)
        return
      } else {
        throw new Error(`Unsupported email provider: ${email.account.provider}`)
      }

      if (!apiKey) {
        throw new Error(`No API key configured for ${email.account.provider}`)
      }

      // Initialize SendGrid
      this.ensureInitialized(apiKey)

      // Build email content with tracking
      let htmlContent = email.bodyHtml || this.textToHtml(email.body)

      // Add tracking pixel if tracking enabled
      if (email.trackingId) {
        const trackingUrl = `${process.env.APP_URL}/api/track/open/${email.trackingId}`
        htmlContent += `<img src="${trackingUrl}" width="1" height="1" alt="" />`

        // Wrap links for click tracking
        htmlContent = this.wrapLinksForTracking(htmlContent, email.trackingId)
      }

      // Send via SendGrid
      const msg = {
        to: email.to,
        cc: email.cc.length > 0 ? email.cc : undefined,
        bcc: email.bcc.length > 0 ? email.bcc : undefined,
        from: email.from,
        subject: email.subject,
        text: email.body,
        html: htmlContent,
        customArgs: {
          email_id: email.id,
          tenant_id: email.tenantId,
          tracking_id: email.trackingId || ''
        }
      }

      const response = await sgMail.send(msg)

      // Update email status
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date()
        }
      })

      console.log(`Email ${emailId} sent successfully via SendGrid`)
    } catch (error) {
      console.error(`Failed to send email ${emailId}:`, error)

      // Update email status to FAILED
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED'
        }
      })

      throw error
    }
  }

  private async sendViaSMTP(email: any, account: any): Promise<void> {
    const nodemailer = require('nodemailer')

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: {
        user: account.smtpUser,
        pass: account.smtpPass
      }
    })

    let htmlContent = email.bodyHtml || this.textToHtml(email.body)

    if (email.trackingId) {
      const trackingUrl = `${process.env.APP_URL}/api/track/open/${email.trackingId}`
      htmlContent += `<img src="${trackingUrl}" width="1" height="1" alt="" />`
      htmlContent = this.wrapLinksForTracking(htmlContent, email.trackingId)
    }

    await transporter.sendMail({
      from: email.from,
      to: email.to.join(', '),
      cc: email.cc.join(', '),
      bcc: email.bcc.join(', '),
      subject: email.subject,
      text: email.body,
      html: htmlContent
    })

    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'SENT',
        sentAt: new Date()
      }
    })

    console.log(`Email ${email.id} sent successfully via SMTP`)
  }

  private textToHtml(text: string): string {
    return text
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  private wrapLinksForTracking(html: string, trackingId: string): string {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi
    return html.replace(linkRegex, (match, url) => {
      const trackUrl = `${process.env.APP_URL}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}`
      return match.replace(url, trackUrl)
    })
  }

  async processQueue(): Promise<void> {
    const queuedEmails = await prisma.email.findMany({
      where: { status: 'QUEUED' },
      take: 10, // Process 10 at a time
      orderBy: { createdAt: 'asc' }
    })

    for (const email of queuedEmails) {
      try {
        await this.send({ emailId: email.id })
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error)
      }
    }
  }
}

// Webhook handlers for SendGrid events
export async function handleSendGridWebhook(events: any[]): Promise<void> {
  for (const event of events) {
    const trackingId = event.tracking_id || event.customArgs?.tracking_id

    if (!trackingId) continue

    const email = await prisma.email.findFirst({
      where: { trackingId }
    })

    if (!email) continue

    switch (event.event) {
      case 'delivered':
        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'DELIVERED' }
        })
        break

      case 'open':
        if (!email.openedAt) {
          await prisma.email.update({
            where: { id: email.id },
            data: {
              status: 'OPENED',
              openedAt: new Date()
            }
          })
        }
        break

      case 'click':
        if (!email.clickedAt) {
          await prisma.email.update({
            where: { id: email.id },
            data: {
              status: 'CLICKED',
              clickedAt: new Date()
            }
          })
        }
        break

      case 'bounce':
      case 'dropped':
        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'BOUNCED' }
        })
        break
    }
  }
}
