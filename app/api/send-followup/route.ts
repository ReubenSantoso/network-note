import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const { userId, contactId, overrideTo } = await request.json()

  if (!userId || !contactId) {
    return NextResponse.json({ error: 'userId and contactId are required' }, { status: 400 })
  }

  // Pull contact from Firestore
  const contactRef = doc(db, 'users', userId, 'contacts', contactId)
  const contactSnap = await getDoc(contactRef)

  if (!contactSnap.exists()) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const contact = contactSnap.data()

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

  // Store draft in Firestore
  await updateDoc(contactRef, {
    followUpStatus: 'draft_sent',
    followUpDraft: { subject, body },
  })

  // Build approve / reject URLs from the current request origin
  const baseUrl = request.nextUrl.origin
  const params = `userId=${encodeURIComponent(userId)}&contactId=${encodeURIComponent(contactId)}`
  const approveUrl = `${baseUrl}/api/followup-approve?${params}`
  const rejectUrl = `${baseUrl}/api/followup-reject?${params}`

  // Send the review email to YOU (the account owner), not to the contact yet
  const reviewTo = overrideTo || process.env.SENDGRID_FROM_EMAIL!

  await sgMail.send({
    to: reviewTo,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: `[Review] Follow-up for ${contact.name}`,
    text: buildPlainReview(contact, subject, body, approveUrl, rejectUrl),
    html: buildHtmlReview(contact, subject, body, approveUrl, rejectUrl),
  })

  return NextResponse.json({ success: true, draftSubject: subject, reviewSentTo: reviewTo })
}

// ─── Email prompt ────────────────────────────────────────────────────────────

function buildEmailPrompt(contact: Record<string, unknown>): string {
  return `You are writing a follow-up email on behalf of someone who just met ${contact.name} at a networking event.

Here is everything known about ${contact.name} and the conversation:
- Name: ${contact.name}
- Company: ${contact.company || 'unknown'}
- Role: ${contact.role || 'unknown'}
- Where we met: ${contact.meetingContext || 'a networking event'}
- What we talked about: ${(contact.keyTopics as string[] | undefined)?.join(', ') || 'various topics'}
- Things to follow up on: ${(contact.actionItems as string[] | undefined)?.join('; ') || 'none specified'}
- Summary of the conversation: ${contact.summary || 'a great conversation'}
- Suggested follow-up approach: ${contact.followUpSuggestion || 'stay in touch'}

Write a follow-up email that:
1. Opens with a specific, genuine callback to something from the conversation — no clichés like "Hope this finds you well"
2. Feels warm and human, written by a real person not a template
3. Is concise — under 180 words in the body
4. Ends with one clear, low-friction next step (a question, a shared resource, or a casual invite to connect)
5. Has a natural sign-off (e.g. "Looking forward to staying in touch," or "Talk soon,")
6. Uses a compelling subject line that references the conversation, not a generic "Following up"

Respond in JSON only — no markdown, no backticks, no extra text:
{
  "subject": "subject line here",
  "body": "full email body here, use \\n for line breaks"
}`
}

// ─── Review email templates ──────────────────────────────────────────────────

function buildPlainReview(
  contact: Record<string, unknown>,
  subject: string,
  body: string,
  approveUrl: string,
  rejectUrl: string
): string {
  return `NetworkNote — Draft follow-up for ${contact.name}

Met at: ${contact.meetingContext || 'a networking event'}
To: ${contact.email || 'no email on file'}

────────────────────────────────────
DRAFT EMAIL
Subject: ${subject}

${body}
────────────────────────────────────

✓ SEND IT: ${approveUrl}

↺ TRY AGAIN: ${rejectUrl}
`
}

function buildHtmlReview(
  contact: Record<string, unknown>,
  subject: string,
  body: string,
  approveUrl: string,
  rejectUrl: string
): string {
  const htmlBody = body
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.65">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <!-- Header -->
  <p style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#999;margin:0 0 20px">NetworkNote · Draft Review</p>

  <h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 6px">Follow-up for ${escapeHtml(String(contact.name))}</h1>
  <p style="font-size:14px;color:#888;margin:0 0 28px">
    Met at: ${escapeHtml(String(contact.meetingContext || 'a networking event'))}
    &nbsp;·&nbsp;
    To: <span style="color:#555">${escapeHtml(String(contact.email || 'no email on file'))}</span>
  </p>

  <!-- Draft box -->
  <div style="background:#fff;border-radius:14px;padding:24px;margin-bottom:24px;border:1px solid #e8e6e1">
    <p style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:#aaa;margin:0 0 14px">Draft email</p>
    <p style="font-size:14px;font-weight:600;color:#111;margin:0 0 14px">Subject: ${escapeHtml(subject)}</p>
    <hr style="border:none;border-top:1px solid #efefed;margin:0 0 14px">
    <div style="font-size:14px;color:#333">${htmlBody}</div>
  </div>

  <!-- Action buttons -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
    <tr>
      <td style="padding-right:10px">
        <a href="${approveUrl}"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:500;letter-spacing:-0.01em">
          ✓&nbsp;&nbsp;Send it
        </a>
      </td>
      <td>
        <a href="${rejectUrl}"
           style="display:inline-block;background:#efefed;color:#333;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:500;letter-spacing:-0.01em">
          ↺&nbsp;&nbsp;Try again
        </a>
      </td>
    </tr>
  </table>

  <p style="font-size:12px;color:#bbb;margin:0">Sent by NetworkNote · Clicking "Send it" delivers this email directly to ${escapeHtml(String(contact.name))}.</p>
</div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
