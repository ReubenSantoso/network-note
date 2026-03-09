/**
 * POST /api/inbound-email
 *
 * SendGrid Inbound Parse webhook. Receives email replies when users reply to draft review emails.
 * Parses the reply, classifies intent (send vs edit), and either sends to the contact or
 * generates a revised draft.
 *
 * Requires INBOUND_PARSE_REPLY_DOMAIN to be set. Configure SendGrid Inbound Parse to POST
 * to this URL. Use Reply-To: reply+{threadId}@domain in draft emails.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'
import { buildEmailPrompt, buildPlainReview, buildHtmlReview } from '@/lib/email-draft'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractThreadIdFromTo(to: string): string | null {
  // to can be "reply+threadId@domain" or "Name <reply+threadId@domain>"
  const match = to.match(/reply\+([a-f0-9-]+)@/i)
  return match ? match[1] : null
}

function extractEmailAddress(str: string): string {
  const angleMatch = str.match(/<([^>]+)>/)
  if (angleMatch) return angleMatch[1].trim().toLowerCase()
  return str.trim().toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    await processInboundEmail(request)
  } catch (err) {
    console.error('Inbound email processing error:', err)
  }
  return new NextResponse(null, { status: 200 })
}

async function processInboundEmail(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.error('Inbound email: SendGrid not configured')
    return
  }

  const replyDomain = process.env.INBOUND_PARSE_REPLY_DOMAIN
  if (!replyDomain) {
    console.error('Inbound email: INBOUND_PARSE_REPLY_DOMAIN not set')
    return
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    console.error('Inbound email: failed to parse form data')
    return
  }

  const toRaw = formData.get('to') as string | null
  const fromRaw = formData.get('from') as string | null
  const subject = (formData.get('subject') as string | null) || ''
  const text = (formData.get('text') as string | null) || ''
  const html = (formData.get('html') as string | null) || ''

  if (!toRaw || !fromRaw) {
    console.error('Inbound email: missing to or from')
    return
  }

  const threadId = extractThreadIdFromTo(toRaw)
  if (!threadId) {
    console.error('Inbound email: could not extract threadId from to:', toRaw)
    return
  }

  const senderEmail = extractEmailAddress(fromRaw)
  const bodyText = (text || html.replace(/<[^>]+>/g, ' ')).trim().slice(0, 2000)

  const adminDb = getAdminDb()
  const snapshot = await adminDb
    .collectionGroup('contacts')
    .where('followUpThreadId', '==', threadId)
    .limit(1)
    .get()

  if (snapshot.empty) {
    console.error('Inbound email: no contact found for threadId:', threadId)
    return
  }

  const contactDoc = snapshot.docs[0]
  const contactRef = contactDoc.ref
  const contact = contactDoc.data()
  const pathParts = contactRef.path.split('/')
  const userId = pathParts[1]
  const contactId = pathParts[3]

  // Verify sender is the account owner
  let ownerEmail: string
  try {
    const userRecord = await getAdminAuth().getUser(userId)
    ownerEmail = (userRecord.email || '').toLowerCase()
  } catch {
    console.error('Inbound email: could not get user')
    return
  }

  if (senderEmail !== ownerEmail) {
    console.error('Inbound email: sender does not match owner', { senderEmail, ownerEmail })
    return
  }

  const draft = contact.followUpDraft as { subject: string; body: string } | undefined
  if (!draft?.subject || !draft?.body) {
    console.error('Inbound email: no draft on contact')
    return
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const classifyMessage = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: `The user received a draft follow-up email and replied with this message. Classify their intent.

User reply: "${bodyText}"

Respond with ONLY one word:
- "send" if they want to send the draft as-is (e.g. "yes send", "send it", "approve", "looks good", "go ahead")
- "edit" if they want changes (e.g. edits, suggestions, "make it shorter", "change the tone", "try again")
`,
      },
    ],
  })

  const classifyContent = classifyMessage.content.find((b) => b.type === 'text')
  const intent = (classifyContent && classifyContent.type === 'text'
    ? classifyContent.text.trim().toLowerCase()
    : 'edit'
  ).startsWith('send')
    ? 'send'
    : 'edit'

  if (intent === 'send') {
    const contactEmail = contact.email as string | undefined
    if (!contactEmail) {
      await sgMail.send({
        to: ownerEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: `[NetworkNote] No email on file for ${contact.name}`,
        text: `The contact ${contact.name} has no email address saved. Add their email in the app to send the follow-up.`,
      })
      return
    }

    await sgMail.send({
      to: contactEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: draft.subject,
      text: draft.body,
    })

    await contactRef.update({
      followUpStatus: 'sent',
      followUpSentAt: new Date().toISOString(),
    })

    await sgMail.send({
      to: ownerEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: `[NetworkNote] Follow-up sent to ${contact.name}`,
      text: `Your follow-up has been delivered to ${contact.name}.`,
    })
  } else {
    const conversationHistory = (contact.followUpConversationHistory as Array<{ role: string; content: string }>) || []
    const historyWithReply = [
      ...conversationHistory,
      { role: 'user' as const, content: `User feedback on the draft: "${bodyText}"` },
    ]

    const editPrompt = `You are refining a follow-up email based on user feedback.

Contact context:
- Name: ${contact.name}
- Company: ${contact.company || 'unknown'}
- Role: ${contact.role || 'unknown'}
- Meeting context: ${contact.meetingContext || 'a networking event'}
- Summary: ${contact.summary || 'N/A'}
- Key topics: ${(contact.keyTopics as string[] | undefined)?.join(', ') || 'N/A'}
- Action items: ${(contact.actionItems as string[] | undefined)?.join('; ') || 'N/A'}

Current draft:
Subject: ${draft.subject}
Body:
${draft.body}

${historyWithReply.map((h) => `${h.role}: ${h.content}`).join('\n\n')}

Incorporate the user's feedback and produce a revised draft. Respond in JSON only — no markdown, no backticks:
{
  "subject": "subject line here",
  "body": "full email body here, use \\n for line breaks"
}`

    const editMessage = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: editPrompt }],
    })

    const editText = editMessage.content.find((b) => b.type === 'text')
    if (!editText || editText.type !== 'text') {
      await sgMail.send({
        to: ownerEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: `[NetworkNote] Could not apply your edits`,
        text: `We couldn't generate a new draft. Please try the "Try again" link in your last email.`,
      })
      return
    }

    let newSubject: string
    let newBody: string
    try {
      const parsed = JSON.parse(
        editText.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      )
      newSubject = parsed.subject
      newBody = parsed.body
    } catch {
      await sgMail.send({
        to: ownerEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: `[NetworkNote] Could not apply your edits`,
        text: `We couldn't parse the new draft. Please try the "Try again" link in your last email.`,
      })
      return
    }

    await contactRef.update({
      followUpDraft: { subject: newSubject, body: newBody },
      followUpConversationHistory: [
        ...historyWithReply,
        { role: 'assistant', content: `Revised draft: Subject "${newSubject}"` },
      ],
    })

    const baseUrl = request.nextUrl.origin
    const params = `userId=${encodeURIComponent(userId)}&contactId=${encodeURIComponent(contactId)}`
    const approveUrl = `${baseUrl}/api/followup-approve?${params}`
    const rejectUrl = `${baseUrl}/api/followup-reject?${params}`

    const replyInstructions = `Reply with more edits, or type "yes send" to send to ${contact.name}.`

    await sgMail.send({
      to: ownerEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      replyTo: `reply+${threadId}@${replyDomain}`,
      subject: `[Review] Revised follow-up for ${contact.name}`,
      text: buildPlainReview(contact, newSubject, newBody, approveUrl, rejectUrl, replyInstructions),
      html: buildHtmlReview(contact, newSubject, newBody, approveUrl, rejectUrl, replyInstructions),
    })
  }
}
