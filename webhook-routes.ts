// apps/web/app/api/webhooks/sendgrid/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { handleSendGridWebhook } from '@elevate/worker/services/email-sender'

export async function POST(request: NextRequest) {
  try {
    const events = await request.json()
    
    // Process webhook events
    await handleSendGridWebhook(events)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SendGrid webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// apps/web/app/api/webhooks/twilio/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { handleTwilioWebhook } from '@elevate/worker/services/sms-sender'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const data = Object.fromEntries(formData)
    
    // Process Twilio webhook
    await handleTwilioWebhook(data)
    
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('Twilio webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// apps/web/app/api/track/open/[trackingId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@elevate/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { trackingId: string } }
) {
  try {
    const { trackingId } = params

    const email = await prisma.email.findFirst({
      where: { trackingId }
    })

    if (email && !email.openedAt) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: 'OPENED',
          openedAt: new Date()
        }
      })
    }

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    )

    return new NextResponse(pixel, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
  } catch (error) {
    console.error('Email tracking error:', error)
    return new NextResponse('Error', { status: 500 })
  }
}

// apps/web/app/api/track/click/[trackingId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@elevate/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { trackingId: string } }
) {
  try {
    const { trackingId } = params
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
    }

    const email = await prisma.email.findFirst({
      where: { trackingId }
    })

    if (email && !email.clickedAt) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: 'CLICKED',
          clickedAt: new Date()
        }
      })
    }

    // Redirect to original URL
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Click tracking error:', error)
    return new NextResponse('Error', { status: 500 })
  }
}
