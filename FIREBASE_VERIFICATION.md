# Firebase Setup Verification Report

## ✅ What’s Working

### 1. Firebase configuration (`lib/firebase.ts`)
- All required env vars are set in `.env.local`
- `initializeApp` is used only when no app exists
- Auth and Firestore exports are wired correctly

### 2. User credentials and info
- **Auth:** `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signInWithGoogle`
- **Storage:** Firebase Authentication (not Firestore) stores credentials
- **User identity:** `user.uid`, `user.email` from `onAuthStateChanged`
- **Note:** No custom user profile doc in Firestore; this is fine unless you add profile fields later

### 3. Contacts under user accounts
- **Path:** `users/{userId}/contacts/{contactId}`
- **Save:** `saveContact(user.uid, newContact)` in `processWithAI()` after AI processing
- **Load:** `loadContacts(user.uid)` on mount when signed in
- **Delete:** `deleteContactFromDB(user.uid, id)` when signed in
- **Guest mode:** Falls back to `localStorage` when not signed in

### 4. Data flow
| Action | Signed-in user | Guest |
|--------|----------------|-------|
| New contact (Generate Summary) | ✅ Firestore | localStorage |
| Load contacts | ✅ Firestore | localStorage |
| Delete contact | ✅ Firestore | localStorage |

---

## ⚠️ Issues to Address

### 1. `send-followup` API uses client Firestore SDK
- **File:** `app/api/send-followup/route.ts` imports `db` from `lib/firebase`
- **Problem:** API routes run server-side with no user auth. Reads/updates use unauthenticated context.
- **Impact:** If Firestore rules enforce `request.auth.uid == userId`, this route will get permission denied.
- **Fix:** Switch to Firebase Admin SDK (`getAdminDb()`) so server calls bypass rules with proper admin access.

### 2. `followup-approve` is a stub
- **File:** `app/api/followup-approve/route.ts`
- **Problem:** Returns “Email sent!” without sending the email or updating Firestore.
- **Impact:** “Send it” in the review email does nothing meaningful.
- **Fix:** Implement using `getAdminDb()` and SendGrid as in the TODO comments.

### 3. `sendFollowUpNow` status handling
- **File:** `app/page.tsx` around lines 342–351
- **Problem:** On success, sets `followUpStatus: 'sent'` in local state even though the API only sends a review email (draft), not the final email to the contact.
- **Impact:** UI can show “Follow-up sent to [contact]” when only a draft was sent to the account owner.
- **Fix:** Keep status as `'draft_sent'` on success, or reflect the actual outcome in the response.

---

## How to Verify in Firebase Console

1. **Firebase Console → Authentication → Users**
   - Confirm users appear after sign-up or Google sign-in.

2. **Firebase Console → Firestore Database**
   - Structure: `users/{uid}/contacts/{contactId}`
   - Create a contact while signed in, then refresh Firestore and confirm documents under your `uid`.

3. **Firestore rules** (Console → Firestore → Rules)
   - Ensure rules allow reads/writes only for the owner, for example:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

---

## Quick runtime test

1. Sign in with a test account.
2. Add a new contact via “Generate Summary & Save”.
3. Check Firestore for `users/{your-uid}/contacts/` and confirm the new document.
4. Refresh the app and confirm the contact still loads from Firestore.
5. Delete the contact and confirm it disappears from Firestore.
