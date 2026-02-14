// packages/worker/src/index.ts
import Queue from 'bull'
import dotenv from 'dotenv'
import { EmailSender } from './services/email-sender'
import { SmsSender } from './services/sms-sender'

dotenv.config()

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Create queues
export const emailQueue = new Queue('email', REDIS_URL)
export const smsQueue = new Queue('sms', REDIS_URL)

// Initialize services
const emailSender = new EmailSender()
const smsSender = new SmsSender()

// Email queue processor
emailQueue.process(10, async (job) => {
  console.log(`Processing email job ${job.id}`)
  await emailSender.send({ emailId: job.data.emailId })
  return { success: true }
})

// SMS queue processor
smsQueue.process(10, async (job) => {
  console.log(`Processing SMS job ${job.id}`)
  await smsSender.send({ smsId: job.data.smsId })
  return { success: true }
})

// Error handlers
emailQueue.on('failed', (job, err) => {
  console.error(`Email job ${job.id} failed:`, err)
})

smsQueue.on('failed', (job, err) => {
  console.error(`SMS job ${job.id} failed:`, err)
})

// Success handlers
emailQueue.on('completed', (job) => {
  console.log(`Email job ${job.id} completed`)
})

smsQueue.on('completed', (job) => {
  console.log(`SMS job ${job.id} completed`)
})

// Periodic queue processing (fallback for items not in Bull)
setInterval(async () => {
  try {
    await emailSender.processQueue()
  } catch (error) {
    console.error('Error processing email queue:', error)
  }
}, 30000) // Every 30 seconds

console.log('🚀 Worker started successfully')
console.log('📧 Email queue: Ready')
console.log('📱 SMS queue: Ready')

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...')
  await emailQueue.close()
  await smsQueue.close()
  process.exit(0)
})
