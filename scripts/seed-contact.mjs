import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

// Parse --email and --password from CLI args
const args = process.argv.slice(2)
const getArg = (flag) => {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : null
}
const email = getArg('--email')
const password = getArg('--password')

if (!email || !password) {
  console.error('Usage: node scripts/seed-contact.mjs --email you@example.com --password yourpassword')
  process.exit(1)
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

console.log(`Signing in as ${email}...`)
let userId
try {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  userId = cred.user.uid
  console.log(`✓ Authenticated — uid: ${userId}`)
} catch (err) {
  console.error(`✗ Sign-in failed: ${err.message}`)
  process.exit(1)
}

const contact = {
  id: 'andrew-chen-001',
  name: 'Andrew Chen',
  company: 'University of Washington',
  role: 'CEO',
  email: 'vkliu@uw.edu',
  phone: '775 772 9258',
  location: 'Seattle',
  summary: 'Andrew is interested in AMATH and CS research and wants to study abroad.',
  keyTopics: ['AMATH', 'CS research', 'Study abroad'],
  actionItems: ['Follow up on study abroad programs', 'Share CS research opportunities'],
  followUpSuggestion: 'Reach out within a week with relevant research programs or study abroad resources.',
  rawNotes: 'Andrew is interested in AMATH and CS research and wants to study abroad.',
  meetingContext: 'Manual seed',
  createdAt: new Date().toISOString(),
}

const path = `users/${userId}/contacts/${contact.id}`
console.log(`\nWriting to: ${path}`)

try {
  await setDoc(doc(db, 'users', userId, 'contacts', contact.id), contact)
  console.log('\n✓ Andrew Chen saved to Firestore!')
  console.log('\nVerify in Firebase Console:')
  console.log(`  Firestore → users → ${userId} → contacts → andrew-chen-001`)
  console.log('\nOr open the app — he should appear at the top of your contacts list.')
} catch (err) {
  if (err.code === 'permission-denied') {
    console.error('\n✗ Firestore rules blocked the write.')
    console.log('Fix: Firebase Console → Firestore → Rules → set:')
    console.log('  allow read, write: if request.auth != null;')
  } else {
    console.error('\n✗ Write failed:', err.message)
  }
  process.exit(1)
}
