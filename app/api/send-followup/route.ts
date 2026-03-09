import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { getAdminDb } from '@/lib/firebase-admin'
import { buildEmailPrompt, buildPlainReview, buildHtmlReview } from '@/lib/email-draft'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const { userId, contactId, userEmail, overrideTo } = await request.json()

  if (!userId || !contactId) {
    return NextResponse.json({ error: 'userId and contactId are required' }, { status: 400 })
  }

  const reviewTo = overrideTo || userEmail || process.env.SENDGRID_FROM_EMAIL
  if (!reviewTo) {
    return NextResponse.json({ error: 'userEmail or overrideTo is required when SENDGRID_FROM_EMAIL is not set' }, { status: 400 })
  }

  // Pull contact from Firestore via Admin SDK
  const adminDb = getAdminDb()
  const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
  const contactSnap = await contactRef.get()

  if (!contactSnap.exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const contact = contactSnap.data()!
  const existingDraft = contact.followUpDraft as { subject: string; body: string } | undefined

  // Generate draft with Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: buildEmailPrompt(contact),
      },
    ],
  })

  const textContent = message.content.find((b) => b.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })
  }

  const { subject, body } = JSON.parse(
    textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  )

  // Generate threadId for email-reply flow (Phase 2)
  const threadId = (contact.followUpThreadId as string) || crypto.randomUUID()

  // Store draft and threadId in Firestore
  await contactRef.update({
    followUpStatus: 'draft_sent',
    followUpDraft: { subject, body },
    ...(!existingDraft ? { followUpThreadId: threadId } : {}),
  })

  // Build approve / reject URLs from the current request origin
  const baseUrl = request.nextUrl.origin
  const params = `userId=${encodeURIComponent(userId)}&contactId=${encodeURIComponent(contactId)}`
  const approveUrl = `${baseUrl}/api/followup-approve?${params}`
  const rejectUrl = `${baseUrl}/api/followup-reject?${params}`

  const replyDomain = process.env.INBOUND_PARSE_REPLY_DOMAIN
  const replyInstructions = replyDomain
    ? `Reply to this email with your edits, or type "yes send" to send the follow-up to ${contact.name}.`
    : undefined

  const mailOptions: Parameters<typeof sgMail.send>[0] = {
    to: reviewTo,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: `[Review] Follow-up for ${contact.name}`,
    text: buildPlainReview(contact, subject, body, approveUrl, rejectUrl, replyInstructions),
    html: buildHtmlReview(contact, subject, body, approveUrl, rejectUrl, replyInstructions),
  }

  if (replyDomain) {
    mailOptions.replyTo = `reply+${threadId}@${replyDomain}`
  }

  await sgMail.send(mailOptions)

  return NextResponse.json({ success: true, draftSubject: subject, reviewSentTo: reviewTo })
}
