import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { getAdminDb } from '@/lib/firebase-admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(request: NextRequest) {
  // Verify the request comes from the cron scheduler
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const now = new Date().toISOString()
  const adminDb = getAdminDb()

  // Query ALL users' contacts that are due — no user session needed
  const snapshot = await adminDb
    .collectionGroup('contacts')
    .where('followUpStatus', '==', 'pending')
    .where('followUpScheduledAt', '<=', now)
    .get()

  if (snapshot.empty) {
    return NextResponse.json({ processed: 0 })
  }

  const results: { id: string; status: string; to?: string }[] = []

  for (const docSnap of snapshot.docs) {
    const contact = docSnap.data()

    if (!contact.email) {
      await docSnap.ref.update({ followUpStatus: 'skipped' })
      results.push({ id: docSnap.id, status: 'skipped — no email' })
      continue
    }

    try {
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
      if (!textContent || textContent.type !== 'text') throw new Error('No text from Claude')

      const { subject, body } = JSON.parse(
        textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      )

      await sgMail.send({
        to: contact.email,
        from: process.env.SENDGRID_FROM_EMAIL!,
        subject,
        text: body,
      })

      await docSnap.ref.update({
        followUpStatus: 'sent',
        followUpSentAt: new Date().toISOString(),
      })

      results.push({ id: docSnap.id, status: 'sent', to: contact.email })
    } catch (err) {
      console.error('Failed for contact', docSnap.id, err)
      results.push({ id: docSnap.id, status: 'error' })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

function buildEmailPrompt(contact: FirebaseFirestore.DocumentData): string {
  return `You are writing a follow-up email on behalf of someone who just met ${contact.name} at a networking event.

Here is everything known about ${contact.name} and the conversation:
- Name: ${contact.name}
- Company: ${contact.company || 'unknown'}
- Role: ${contact.role || 'unknown'}
- Where we met: ${contact.meetingContext || 'a networking event'}
- What we talked about: ${(contact.keyTopics ?? []).join(', ') || 'various topics'}
- Things to follow up on: ${(contact.actionItems ?? []).join('; ') || 'none specified'}
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
