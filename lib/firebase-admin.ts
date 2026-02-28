import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let _db: Firestore | null = null

export function getAdminDb(): Firestore {
  if (_db) return _db

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }

  _db = getFirestore()
  return _db
}
