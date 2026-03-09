/**
 * GET /api/followup-reject?userId=...&contactId=...
 *
 * Called when the user clicks "↺ Try again" in the draft review email.
 * Generates a new draft with Claude and sends a new review email.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'
import { buildEmailPrompt, buildPlainReview, buildHtmlReview } from '@/lib/email-draft'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VARIATION_HINT = `
IMPORTANT: Write a DIFFERENT version from the previous draft.
Change the opening line completely, adjust the tone slightly, and suggest a different next step.
`.trim()

function confirmationPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f4f0; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 400px;
            text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; color: #111; margin: 0 0 8px; }
    p { font-size: 15px; color: #666; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">↺</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const userId = searchParams.get('userId')
  const contactId = searchParams.get('contactId')

  if (!userId || !contactId) {
    return new NextResponse('Missing userId or contactId', { status: 400 })
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    return new NextResponse(confirmationPage('Error', 'Email is not configured.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const adminDb = getAdminDb()
  const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
  const snap = await contactRef.get()

  if (!snap.exists) {
    return new NextResponse(confirmationPage('Not found', 'Contact not found.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const contact = snap.data()!

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: buildEmailPrompt(contact, VARIATION_HINT),
      },
    ],
  })

  const textContent = message.content.find((b) => b.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return new NextResponse(confirmationPage('Error', 'Could not generate a new draft.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  let subject: string
  let body: string
  try {
    const parsed = JSON.parse(
      textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    )
    subject = parsed.subject
    body = parsed.body
  } catch {
    return new NextResponse(confirmationPage('Error', 'Invalid draft response.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  await contactRef.update({
    followUpDraft: { subject, body },
  })

  const baseUrl = request.nextUrl.origin
  const params = `userId=${encodeURIComponent(userId)}&contactId=${encodeURIComponent(contactId)}`
  const approveUrl = `${baseUrl}/api/followup-approve?${params}`
  const rejectUrl = `${baseUrl}/api/followup-reject?${params}`

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const replyDomain = process.env.INBOUND_PARSE_REPLY_DOMAIN
  const replyInstructions = replyDomain
    ? `Reply to this email with your edits, or type "yes send" to send the follow-up to ${contact.name}.`
    : undefined

  let reviewTo = process.env.SENDGRID_FROM_EMAIL
  try {
    const userRecord = await getAdminAuth().getUser(userId)
    if (userRecord.email) reviewTo = userRecord.email
  } catch {
    // Fall back to SENDGRID_FROM_EMAIL
  }

  const mailOptions: Parameters<typeof sgMail.send>[0] = {
    to: reviewTo,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `[Review] Follow-up for ${contact.name}`,
    text: buildPlainReview(contact, subject, body, approveUrl, rejectUrl, replyInstructions),
    html: buildHtmlReview(contact, subject, body, approveUrl, rejectUrl, replyInstructions),
  }

  const threadId = contact.followUpThreadId as string | undefined
  if (replyDomain && threadId) {
    mailOptions.replyTo = `reply+${threadId}@${replyDomain}`
  }

  await sgMail.send(mailOptions)

  return new NextResponse(
    confirmationPage('New draft on its way!', 'Check your inbox for a fresh version.'),
    { headers: { 'Content-Type': 'text/html' } }
  )
}
