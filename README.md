# NetworkNote

Voice-powered networking CRM. Record conversations at events, get AI-extracted contact cards, and send personalized follow-up emails with a human approval step before anything goes out.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Auth + Database | Firebase (Auth + Firestore) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Email | SendGrid |
| Hosting | Vercel |

---

## Complete Workflow

```
① User goes to networking event
   Opens the app → logs in → taps +

② Records a conversation
   Fills in name / company / role / email
   Taps the mic button → speaks notes about who they met
   Taps "Generate Summary & Save"

③ AI processes the recording
   POST /api/process
   → Claude extracts structured contact data
   → Contact saved to Firestore: users/{uid}/contacts/{id}
   → followUpStatus = 'pending'

④ Draft review email fires immediately (fire-and-forget after save)
   POST /api/send-followup
   → Claude generates a personalized follow-up email draft
   → Draft stored in Firestore: followUpDraft = { subject, body }
   → followUpStatus = 'draft_sent'
   → Review email sent to YOU (account owner) with two buttons:
       ✓ Send it   → GET /api/followup-approve?userId=...&contactId=...
       ↺ Try again → GET /api/followup-reject?userId=...&contactId=...

⑤ You review the draft in your inbox
   Option A — "Send it":
     → /api/followup-approve sends the draft to contact.email
     → Firestore: followUpStatus = 'sent', followUpSentAt = now
   Option B — "Try again":
     → /api/followup-reject generates a new draft
     → New review email arrives in your inbox
     → Repeat until satisfied

⑥ Contact card in the app updates automatically
   Shows green "Follow-up sent" chip once approved
```

---

## File Structure

```
network-note/
├── app/
│   ├── page.tsx                    Main UI — list / new contact / detail views
│   ├── layout.tsx                  Root layout with AuthProvider
│   ├── auth/
│   │   └── page.tsx                Sign-in / sign-up page
│   └── api/
│       ├── process/
│       │   └── route.ts            POST: Claude extracts contact from voice transcript
│       ├── send-followup/
│       │   └── route.ts            POST: generates draft, sends review email to owner
│       ├── followup-approve/
│       │   └── route.ts            GET:  [PARTNER TODO] sends draft to contact
│       └── followup-reject/
│           └── route.ts            GET:  [PARTNER TODO] regenerates draft, re-emails owner
├── lib/
│   ├── firebase.ts                 Firebase client SDK init (used in browser + API routes)
│   ├── firebase-admin.ts           Firebase Admin SDK — lazy init, server-side only
│   ├── firestore.ts                Contact interface + saveContact / loadContacts / deleteContact
│   └── AuthContext.tsx             React auth context — useAuth() hook
├── .env.local                      All secrets (never commit this file)
└── README.md                       This file
```

---

## API Endpoints

### `POST /api/process`
Converts a voice transcript into a structured contact object.

**Body:** `{ transcript: string, formData: { name, company, role, email, ... } }`
**Returns:** `{ name, company, role, email, summary, keyTopics[], actionItems[], followUpSuggestion }`
**Called by:** `processWithAI()` in `page.tsx`

---

### `POST /api/send-followup`
Generates a follow-up email draft and sends a review email to the account owner.

**Body:** `{ userId, contactId, overrideTo? }`
- `overrideTo` — optional recipient override (used by test button in the list view)

**What it does:**
1. Fetches contact from Firestore (client SDK)
2. Claude generates `{ subject, body }` — a personalized follow-up email
3. Stores draft in Firestore: `followUpDraft = { subject, body }`, `followUpStatus = 'draft_sent'`
4. Sends HTML review email to `SENDGRID_FROM_EMAIL` with ✓ Send it / ↺ Try again buttons
5. Button URLs: `/api/followup-approve?userId=...&contactId=...` and `/api/followup-reject?...`

**Triggered by:**
- `page.tsx` immediately after saving a new contact (fire-and-forget)
- "Resend Draft" button in the contact detail view
- "Send test follow-up email" button in the list view

---

### `GET /api/followup-approve?userId=...&contactId=...`
**[PARTNER TODO]** — Linked from the "✓ Send it" button in the review email.

Must:
1. Read `followUpDraft` from `users/{userId}/contacts/{contactId}` in Firestore
2. Send `followUpDraft.body` to `contact.email` via SendGrid (plain text)
3. Update Firestore: `followUpStatus = 'sent'`, `followUpSentAt = now`
4. Return the confirmation HTML page (helper already in the file)

---

### `GET /api/followup-reject?userId=...&contactId=...`
**[PARTNER TODO]** — Linked from the "↺ Try again" button in the review email.

Must:
1. Read contact from Firestore
2. Call Claude with same prompt + variation instruction ("write a different version")
3. Store new draft: `followUpDraft = { subject, body }`
4. Send a new review email to `SENDGRID_FROM_EMAIL` (same HTML format as `send-followup`)
5. Return the confirmation HTML page

---

## Firestore Schema

### `users/{userId}/contacts/{contactId}`

```typescript
{
  // Core contact info
  id: string
  name: string
  company?: string
  role?: string
  email?: string              // Contact's email — where the final follow-up goes
  phone?: string
  location?: string
  photo?: string              // base64 data URL
  meetingContext?: string     // "Where did you meet?"
  createdAt: string           // ISO timestamp

  // AI-generated
  summary?: string
  keyTopics?: string[]
  actionItems?: string[]
  followUpSuggestion?: string
  rawNotes?: string           // Original voice transcript

  // Follow-up email flow
  followUpStatus?: 'pending' | 'draft_sent' | 'sent' | 'skipped'
  followUpDraft?: {           // Set when draft is generated
    subject: string
    body: string
  }
  followUpSentAt?: string     // ISO timestamp — set when email is sent to contact
}
```

**Status transitions:**
```
[saved with email]  →  pending
pending             →  draft_sent   (after /api/send-followup runs)
draft_sent          →  sent         (after /api/followup-approve runs)
draft_sent          →  draft_sent   (on reject: new draft, status unchanged)
[saved, no email]   →  skipped
```

---

## Environment Variables

```bash
# .env.local — never commit this file

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# SendGrid
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=you@yourdomain.com
# This address: receives the draft review emails (the Yes/No inbox)
#               sends approved follow-ups to contacts
# Must be verified in SendGrid → Settings → Sender Authentication

# Firebase client SDK (public — safe to expose in NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK (private — server-side only, never exposed to browser)
# Source: Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## One-Time Setup Checklist

- [ ] Verify `SENDGRID_FROM_EMAIL` in SendGrid Console → Sender Authentication
- [ ] Set Firestore security rules (Firebase Console → Firestore → Rules):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- [ ] Add all env vars to Vercel project settings (Settings → Environment Variables)

---

## Partner Handoff

Two route files need the approve/reject logic implemented. Both are fully stubbed:

**`app/api/followup-approve/route.ts`**
- Uncomment the implementation block
- Use `getAdminDb()` from `@/lib/firebase-admin`
- Use `sgMail` from `@sendgrid/mail`

**`app/api/followup-reject/route.ts`**
- Uncomment the implementation block
- Copy the Claude prompt from `send-followup/route.ts` and append the variation instruction
- Copy the `buildHtmlReview` function from `send-followup/route.ts` (or extract to a shared lib)

All context, variable names, and Firestore paths are documented in each file's header comment.
