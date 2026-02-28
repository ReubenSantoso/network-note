/**
 * GET /api/followup-approve?userId=...&contactId=...
 *
 * Called when the user clicks "✓ Send it" in the draft review email.
 *
 * What this needs to do (PARTNER TODO):
 *   1. Read the contact document from Firestore
 *   2. Grab contact.followUpDraft.subject + contact.followUpDraft.body
 *   3. Send that email to contact.email via SendGrid (plain text)
 *   4. Update Firestore: followUpStatus = 'sent', followUpSentAt = now
 *   5. Return a confirmation HTML page so the button click feels resolved
 *
 * Firestore path:  users/{userId}/contacts/{contactId}
 * Relevant fields: email, name, followUpDraft.subject, followUpDraft.body
 *
 * Use getAdminDb() from @/lib/firebase-admin for server-side Firestore access.
 * Use sgMail from @sendgrid/mail for sending (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL in env).
 */

import { NextRequest, NextResponse } from 'next/server'
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
  // const { subject, body } = contact.followUpDraft
  //
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
  // await sgMail.send({
  //   to: contact.email,
  //   from: process.env.SENDGRID_FROM_EMAIL!,
  //   subject,
  //   text: body,
  // })
  //
  // await contactRef.update({ followUpStatus: 'sent', followUpSentAt: new Date().toISOString() })
  //
  // ─────────────────────────────────────────────────────────────────────────

  return new NextResponse(confirmationPage('Email sent!', 'Your follow-up has been delivered.'), {
    headers: { 'Content-Type': 'text/html' },
  })
}

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
    <div class="icon">✓</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}
