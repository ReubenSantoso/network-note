import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sgMail from '@sendgrid/mail'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json(
      { error: 'SendGrid API key not configured' },
      { status: 500 }
    )
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  try {
    const { userId, contactId, overrideTo } = await request.json()

    if (!userId || !contactId) {
      return NextResponse.json(
        { error: 'userId and contactId are required' },
        { status: 400 }
      )
    }

    // Pull contact from Firestore
    const contactRef = doc(db, 'users', userId, 'contacts', contactId)
    const contactSnap = await getDoc(contactRef)

    if (!contactSnap.exists()) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const contact = contactSnap.data()

    const recipientEmail = overrideTo || contact.email

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Contact has no email address' },
        { status: 400 }
      )
    }

    // Generate personalized email with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are writing a follow-up email on behalf of someone who just met ${contact.name} at a networking event.

Here is everything known about ${contact.name} and the conversation:
- Name: ${contact.name}
- Company: ${contact.company || 'unknown'}
- Role: ${contact.role || 'unknown'}
- Where we met: ${contact.meetingContext || 'a networking event'}
- What we talked about: ${contact.keyTopics?.join(', ') || 'various topics'}
- Things to follow up on: ${contact.actionItems?.join('; ') || 'none specified'}
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
      ]
    })

    const textContent = message.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response')
    }

    const cleaned = textContent.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const { subject, body } = JSON.parse(cleaned)

    // Send email via SendGrid (plain text only — reads like a real person wrote it)
    await sgMail.send({
      to: recipientEmail,
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject,
      text: body,
    })

    // Update Firestore status
    const now = new Date().toISOString()
    await updateDoc(contactRef, {
      followUpStatus: 'sent',
      followUpSentAt: now,
    })

    return NextResponse.json({ success: true, subject, to: recipientEmail })
  } catch (error) {
    console.error('Error sending follow-up:', error)
    return NextResponse.json(
      { error: 'Failed to send follow-up email' },
      { status: 500 }
    )
  }
}
