import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    query,
    orderBy,
} from 'firebase/firestore'
import { db } from './firebase'

export interface Contact {
    id: string
    name: string
    company?: string
    role?: string
    email?: string
    phone?: string
    location?: string
    photo?: string
    summary?: string
    keyTopics?: string[]
    actionItems?: string[]
    followUpSuggestion?: string
    rawNotes?: string
    meetingContext?: string
    createdAt: string
    followUpDelayHours?: number
    followUpScheduledAt?: string
    followUpStatus?: 'pending' | 'sent' | 'skipped'
    followUpSentAt?: string
}

function contactsCollection(userId: string) {
    return collection(db, 'users', userId, 'contacts')
}

export async function saveContact(userId: string, contact: Contact): Promise<void> {
    const docRef = doc(db, 'users', userId, 'contacts', contact.id)
    await setDoc(docRef, contact)
}

export async function loadContacts(userId: string): Promise<Contact[]> {
    const q = query(contactsCollection(userId), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as Contact)
}

export async function deleteContactFromDB(userId: string, contactId: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'contacts', contactId)
    await deleteDoc(docRef)
}
