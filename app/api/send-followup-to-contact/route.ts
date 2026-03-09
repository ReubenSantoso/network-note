import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { getAdminDb } from '@/lib/firebase-admin'

/**
 * POST /api/send-followup-to-contact
 * Sends the current follow-up draft to the contact. Uses Reply-To so replies go to the logged-in user.
 * Body: { userId, contactId, userEmail }
 * Note: SendGrid only allows sending FROM verified addresses, so From is SENDGRID_FROM_EMAIL;
 * Reply-To is set to userEmail so when the contact replies, it goes to the user.
 */
export async function POST(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const { userId, contactId, userEmail } = await request.json()

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
  const draft = contact.followUpDraft as { subject: string; body: string } | undefined
  const contactEmail = contact.email as string | undefined

  if (!draft?.subject || !draft?.body) {
    return NextResponse.json({ error: 'No draft to send' }, { status: 400 })
  }

  if (!contactEmail) {
    return NextResponse.json({ error: 'Contact has no email' }, { status: 400 })
  }

  const mailOptions: Parameters<typeof sgMail.send>[0] = {
    to: contactEmail,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: draft.subject,
    text: draft.body,
  }

  if (userEmail && typeof userEmail === 'string') {
    mailOptions.replyTo = userEmail
  }

  await sgMail.send(mailOptions)

  await contactRef.update({
    followUpStatus: 'sent',
    followUpSentAt: new Date().toISOString(),
  })

  return NextResponse.json({ success: true })
}
