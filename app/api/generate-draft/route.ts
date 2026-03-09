import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminDb } from '@/lib/firebase-admin'
import { buildEmailPrompt } from '@/lib/email-draft'

/** Allow up to 60s for Claude to respond (serverless default is often 10s). */
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/generate-draft
 * Generates a follow-up draft and saves to Firestore. No email is sent.
 * Body: { userId, contactId }
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('generate-draft: ANTHROPIC_API_KEY is not set')
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const { userId, contactId } = await request.json()

    if (!userId || !contactId) {
      return NextResponse.json({ error: 'userId and contactId are required' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
    const contactSnap = await contactRef.get()

    if (!contactSnap.exists) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const contact = contactSnap.data()!
    const existingDraft = contact.followUpDraft as { subject: string; body: string } | undefined

    // Ensure contact has at least a name so the prompt is valid
    const safeContact = {
      ...contact,
      name: contact.name ?? 'this contact',
      company: contact.company ?? undefined,
      role: contact.role ?? undefined,
      meetingContext: contact.meetingContext ?? undefined,
      keyTopics: contact.keyTopics ?? [],
      actionItems: contact.actionItems ?? [],
      summary: contact.summary ?? undefined,
      followUpSuggestion: contact.followUpSuggestion ?? undefined,
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      messages: [{ role: 'user', content: buildEmailPrompt(safeContact) }],
    })

    const textContent = message.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      console.error('generate-draft: Claude returned no text content', message)
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    const rawText = textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : rawText

    let subject: string
    let body: string
    try {
      const parsed = JSON.parse(jsonStr)
      subject = parsed.subject
      body = parsed.body
      if (typeof subject !== 'string' || typeof body !== 'string') {
        throw new Error('subject and body must be strings')
      }
    } catch (parseErr) {
      console.error('generate-draft: Failed to parse Claude response', rawText.slice(0, 500), parseErr)
      return NextResponse.json({ error: 'Invalid draft response from AI' }, { status: 500 })
    }

    const threadId = (contact.followUpThreadId as string) || crypto.randomUUID()

    await contactRef.update({
      followUpStatus: 'draft_sent',
      followUpDraft: { subject, body },
      followUpChatHistory: [],
      ...(!existingDraft ? { followUpThreadId: threadId } : {}),
    })

    return NextResponse.json({ success: true, subject, body })
  } catch (err) {
    console.error('generate-draft error:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate draft'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
