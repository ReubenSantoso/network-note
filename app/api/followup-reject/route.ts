/**
 * GET /api/followup-reject?userId=...&contactId=...
 *
 * Called when the user clicks "↺ Try again" in the draft review email.
 *
 * What this needs to do (PARTNER TODO):
 *   1. Read the contact from Firestore
 *   2. Call Claude again with the same prompt but add a variation instruction
 *      (e.g. "Write a slightly different version — different opening, different tone")
 *   3. Store the new draft: followUpDraft = { subject, body }
 *   4. Send a new review email to SENDGRID_FROM_EMAIL with approve/reject buttons
 *      (same format as /api/send-followup — you can call that route internally or duplicate the logic)
 *   5. Return a confirmation HTML page so the button click feels resolved
 *
 * Firestore path:  users/{userId}/contacts/{contactId}
 * Relevant fields: all contact fields (for the Claude prompt), email, name
 *
 * Use getAdminDb() from @/lib/firebase-admin for Firestore.
 * Use @anthropic-ai/sdk for Claude. Model: claude-sonnet-4-20250514.
 * Use @sendgrid/mail for the new review email.
 *
 * The approve/reject URLs in the new email should be:
 *   approve: {origin}/api/followup-approve?userId=...&contactId=...
 *   reject:  {origin}/api/followup-reject?userId=...&contactId=...
 */

import { NextRequest, NextResponse } from 'next/server'
// import Anthropic from '@anthropic-ai/sdk'
// import sgMail from '@sendgrid/mail'
// import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const userId = searchParams.get('userId')
  const contactId = searchParams.get('contactId')

  if (!userId || !contactId) {
    return new NextResponse('Missing userId or contactId', { status: 400 })
  }

  // ─── PARTNER: implement below ─────────────────────────────────────────────
  //
  // const adminDb = getAdminDb()
  // const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
  // const snap = await contactRef.get()
  // if (!snap.exists) return new NextResponse('Contact not found', { status: 404 })
  //
  // const contact = snap.data()!
  // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  //
  // const message = await anthropic.messages.create({
  //   model: 'claude-sonnet-4-20250514',
  //   max_tokens: 1024,
  //   messages: [{ role: 'user', content: buildVariationPrompt(contact) }],
  // })
  //
  // const { subject, body } = JSON.parse(...)
  //
  // await contactRef.update({ followUpDraft: { subject, body } })
  //
  // // Send new review email (same HTML template as send-followup)
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
  // await sgMail.send({ to: process.env.SENDGRID_FROM_EMAIL!, from: process.env.SENDGRID_FROM_EMAIL!,
  //   subject: `[Review] Follow-up for ${contact.name}`, html: buildHtmlReview(...) })
  //
  // ─────────────────────────────────────────────────────────────────────────

  return new NextResponse(
    confirmationPage('New draft on its way!', 'Check your inbox for a fresh version.'),
    { headers: { 'Content-Type': 'text/html' } }
  )
}

// Variation prompt hint for Claude — add this after the main prompt:
// "IMPORTANT: Write a DIFFERENT version from the previous draft.
//  Change the opening line completely, adjust the tone slightly, and suggest a different next step."

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
