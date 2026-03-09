import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminDb } from '@/lib/firebase-admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/followup-chat
 * Chat to refine the follow-up draft. Sends user message, returns updated draft + assistant reply.
 * Body: { userId, contactId, message, history? }
 */
export async function POST(request: NextRequest) {
  const { userId, contactId, message, history = [] } = await request.json()

  if (!userId || !contactId || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'userId, contactId, and message are required' }, { status: 400 })
  }

  const adminDb = getAdminDb()
  const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
  const contactSnap = await contactRef.get()

  if (!contactSnap.exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const contact = contactSnap.data()!
  const draft = contact.followUpDraft as { subject: string; body: string } | undefined
  const storedHistory = (contact.followUpChatHistory as { role: 'user' | 'assistant'; content: string }[]) || []

  if (!draft?.subject || !draft?.body) {
    return NextResponse.json({ error: 'No draft to edit' }, { status: 400 })
  }

  const chatHistory = Array.isArray(history) && history.length > 0
    ? history
    : storedHistory

  const systemPrompt = `You are helping refine a follow-up email. The user may:
1. Edit the draft (e.g. "make it shorter", "mention the project we discussed", "friendlier tone").
2. Change the recipient email (e.g. "send it to john.work@company.com instead", "use their work email", "the correct email is ...").

If the user specifies a different email address to send to, include it in "email" (use only if they clearly indicate a new address). Otherwise omit "email".
Respond in JSON only:
{
  "subject": "updated subject",
  "body": "updated body with \\n for line breaks",
  "reply": "Brief human reply to the user (e.g. 'Done—shortened.' or 'Updated the send-to address to john@company.com.')",
  "email": "optional new recipient email if user requested a change"
}`

  const userPrompt = `Contact: ${contact.name}. Current recipient email: ${(contact.email as string) || 'none'}.
Current draft:
Subject: ${draft.subject}
Body:
${draft.body}

User message: ${message.trim()}`

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userPrompt },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })

  const textContent = response.content.find((b) => b.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 })
  }

  let subject: string
  let body: string
  let reply: string
  let email: string | undefined
  try {
    const parsed = JSON.parse(
      textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    )
    subject = parsed.subject ?? draft.subject
    body = parsed.body ?? draft.body
    reply = typeof parsed.reply === 'string' ? parsed.reply : 'Draft updated.'
    if (typeof parsed.email === 'string' && parsed.email.trim().length > 0) {
      const trimmed = parsed.email.trim()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        email = trimmed
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid chat response' }, { status: 500 })
  }

  const newHistory = [
    ...chatHistory,
    { role: 'user' as const, content: message.trim() },
    { role: 'assistant' as const, content: reply },
  ]

  const updateData: Record<string, unknown> = {
    followUpDraft: { subject, body },
    followUpChatHistory: newHistory,
  }
  if (email !== undefined) {
    updateData.email = email
  }

  await contactRef.update(updateData)

  return NextResponse.json({
    success: true,
    subject,
    body,
    assistantMessage: reply,
    ...(email !== undefined ? { email } : {}),
  })
}
