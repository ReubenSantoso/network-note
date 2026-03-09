/**
 * GET /api/followup-approve?userId=...&contactId=...
 *
 * Called when the user clicks "✓ Send it" in the draft review email.
 * Sends the stored draft to the contact and updates Firestore.
 */

import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { getAdminDb } from '@/lib/firebase-admin'

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
  const followUpDraft = contact.followUpDraft as { subject: string; body: string } | undefined
  const contactEmail = contact.email as string | undefined

  if (!followUpDraft?.subject || !followUpDraft?.body) {
    return new NextResponse(confirmationPage('Error', 'No draft to send.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!contactEmail) {
    return new NextResponse(confirmationPage('Error', 'This contact has no email on file.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  try {
    await sgMail.send({
      to: contactEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: followUpDraft.subject,
      text: followUpDraft.body,
    })

    await contactRef.update({
      followUpStatus: 'sent',
      followUpSentAt: new Date().toISOString(),
    })

    return new NextResponse(confirmationPage('Email sent!', 'Your follow-up has been delivered.'), {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err) {
    console.error('Followup approve error:', err)
    return new NextResponse(confirmationPage('Error', 'Failed to send email. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}
