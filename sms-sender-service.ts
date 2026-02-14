// packages/worker/src/services/sms-sender.ts
import { PrismaClient } from '@elevate/database'
import twilio from 'twilio'

const prisma = new PrismaClient()

interface SendSmsParams {
  smsId: string
}

export class SmsSender {
  async send({ smsId }: SendSmsParams): Promise<void> {
    try {
      // Get SMS record
      const sms = await prisma.smsMessage.findUnique({
        where: { id: smsId },
        include: { account: true }
      })

      if (!sms) {
        throw new Error(`SMS ${smsId} not found`)
      }

      if (sms.status !== 'QUEUED') {
        console.log(`SMS ${smsId} already processed (status: ${sms.status})`)
        return
      }

      // Update status to SENDING
      await prisma.smsMessage.update({
        where: { id: smsId },
        data: { status: 'SENDING' }
      })

      // Send based on provider
      if (sms.account.provider === 'TWILIO') {
        await this.sendViaTwilio(sms, sms.account)
      } else {
        throw new Error(`Unsupported SMS provider: ${sms.account.provider}`)
      }

      console.log(`SMS ${smsId} sent successfully`)
    } catch (error) {
      console.error(`Failed to send SMS ${smsId}:`, error)

      // Update SMS status to FAILED
      await prisma.smsMessage.update({
        where: { id: smsId },
        data: { status: 'FAILED' }
      })

      throw error
    }
  }

  private async sendViaTwilio(sms: any, account: any): Promise<void> {
    const client = twilio(account.accountSid, account.authToken)

    const message = await client.messages.create({
      body: sms.body,
      from: sms.from,
      to: sms.to
    })

    await prisma.smsMessage.update({
      where: { id: sms.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: message.sid
      }
    })
  }

  async processQueue(): Promise<void> {
    const queuedMessages = await prisma.smsMessage.findMany({
      where: { status: 'QUEUED' },
      take: 10,
      orderBy: { createdAt: 'asc' }
    })

    for (const sms of queuedMessages) {
      try {
        await this.send({ smsId: sms.id })
      } catch (error) {
        console.error(`Error processing SMS ${sms.id}:`, error)
      }
    }
  }
}

// Webhook handler for Twilio status updates
export async function handleTwilioWebhook(data: any): Promise<void> {
  const messageId = data.MessageSid

  const sms = await prisma.smsMessage.findFirst({
    where: { providerMessageId: messageId }
  })

  if (!sms) return

  const status = data.MessageStatus

  switch (status) {
    case 'delivered':
      await prisma.smsMessage.update({
        where: { id: sms.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date()
        }
      })
      break

    case 'failed':
    case 'undelivered':
      await prisma.smsMessage.update({
        where: { id: sms.id },
        data: { status: 'FAILED' }
      })
      break
  }
}
