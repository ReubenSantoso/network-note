import { NextRequest, NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import { getAdminDb } from '@/lib/firebase-admin'

/**
 * POST /api/send-followup-reminder
 * Sends a reminder email to the logged-in user: new entry + follow up with action items.
 * Called 10 seconds after a new contact is saved. All actual follow-up sending is in the app.
 * Body: { userId, contactId, userEmail }
 */
export async function POST(request: NextRequest) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const { userId, contactId, userEmail } = await request.json()

  if (!userId || !contactId || !userEmail) {
    return NextResponse.json({ error: 'userId, contactId, and userEmail are required' }, { status: 400 })
  }

  const adminDb = getAdminDb()
  const contactRef = adminDb.doc(`users/${userId}/contacts/${contactId}`)
  const contactSnap = await contactRef.get()

  if (!contactSnap.exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const contact = contactSnap.data()!
  const name = (contact.name as string) || 'your contact'
  const actionItems = (contact.actionItems as string[] | undefined) || []
  const meetingContext = (contact.meetingContext as string) || ''

  // Production: always link to public app. Local: use request origin (localhost).
  const appUrl = process.env.NODE_ENV === 'production' ? 'https://www.network-note.ink' : request.nextUrl.origin
  const subject = `Reminder: Follow up with ${name}`
  const actionItemsBlock =
    actionItems.length > 0
      ? `\n\nAction items you noted:\n${actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : ''
  const text = `Hey, you have a new entry.\n\nDon't forget to follow up with ${name}.${actionItemsBlock}\n\nOpen NetworkNote to send your follow-up:\n${appUrl}`
  const actionItemsHtml =
    actionItems.length > 0
      ? `
    <p style="font-size:15px;font-weight:600;color:#111;margin:0 0 8px">Action items you noted:</p>
    <ul style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;padding-left:20px">
      ${actionItems.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
    </ul>`
      : ''
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px">
    <p style="font-size:12px;font-weight:600;letter-spacing:0.08em;color:#999;margin:0 0 16px">NetworkNote · Reminder</p>
    <h1 style="font-size:20px;font-weight:600;color:#111;margin:0 0 12px">You have a new entry</h1>
    <p style="font-size:15px;color:#444;line-height:1.5;margin:0 0 12px">
      Don't forget to follow up with <strong>${escapeHtml(name)}</strong>${meetingContext ? ` — ${escapeHtml(meetingContext)}` : ''}.
    </p>
    ${actionItemsHtml}
    <p style="font-size:15px;color:#444;line-height:1.5;margin:0 0 24px">
      Open the app to write and send your follow-up.
    </p>
    <a href="${appUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:500">Open NetworkNote</a>
    <p style="font-size:12px;color:#999;margin:24px 0 0">This email is just a reminder — everything is sent from the app.</p>
  </div>
</body>
</html>`

  await sgMail.send({
    to: userEmail,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject,
    text,
    html,
  })

  return NextResponse.json({ success: true })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
