'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mic, MicOff, Upload, User, Sparkles, Download, Plus,
  ChevronRight, X, Clock, MapPin, Building, Mail, Phone,
  Loader2, Trash2, Edit3, Save, LogOut, LogIn, Send, MessageSquare
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import {
  Contact,
  saveContact,
  loadContacts,
  deleteContactFromDB
} from '@/lib/firestore'

// Local storage helpers (for guest mode)
const STORAGE_KEY = 'networknote_contacts'

const saveToStorage = (contacts: Contact[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
  }
}

const loadFromStorage = (): Contact[] => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  }
  return []
}

// Form types
interface FormData {
  name: string
  company: string
  role: string
  email: string
  phone: string
  location: string
  meetingContext: string
}

// Speech Recognition types
interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
  error: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: (event: SpeechRecognitionEvent) => void
  onerror: (event: SpeechRecognitionErrorEvent) => void
  onend: () => void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

export default function NetworkNote() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [currentContact, setCurrentContact] = useState<Contact | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list')
  const [speechSupported, setSpeechSupported] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(true)
  const [followupChatInput, setFollowupChatInput] = useState('')
  const [followupChatSending, setFollowupChatSending] = useState(false)
  const [draftGenerating, setDraftGenerating] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [sendingFollowup, setSendingFollowup] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    company: '',
    role: '',
    email: '',
    phone: '',
    location: '',
    meetingContext: ''
  })

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Load contacts: Firestore for signed-in users, localStorage for guests
  useEffect(() => {
    if (authLoading) return

    if (user) {
      // Signed in — load from Firestore
      const fetchContacts = async () => {
        try {
          setContactsLoading(true)
          const loaded = await loadContacts(user.uid)
          setContacts(loaded)
        } catch (error) {
          console.error('Failed to load contacts:', error)
        } finally {
          setContactsLoading(false)
        }
      }
      fetchContacts()
    } else {
      // Guest — load from localStorage
      const stored = loadFromStorage()
      setContacts(stored)
      setContactsLoading(false)
    }
  }, [user, authLoading])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognitionClass()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      setSpeechSupported(true)

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart + ' '
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript)
        }
      }

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
      }

      recognitionRef.current.onend = () => {
        if (isRecording) {
          // Restart if still recording (continuous mode workaround)
          try {
            recognitionRef.current?.start()
          } catch (e) {
            setIsRecording(false)
          }
        }
      }
    }
  }, [isRecording])

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
    } else {
      setTranscript('')
      try {
        recognitionRef.current?.start()
        setIsRecording(true)
      } catch (e) {
        console.error('Failed to start recording:', e)
      }
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhoto(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const processWithAI = async () => {
    if (!transcript.trim()) return

    setIsProcessing(true)

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          formData
        })
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const parsed = await response.json()

      const contactEmail = parsed.email || formData.email || undefined
      const newContact: Contact = {
        id: crypto.randomUUID(),
        name: parsed.name || formData.name || 'Unknown Contact',
        company: parsed.company || formData.company || undefined,
        role: parsed.role || formData.role || undefined,
        email: contactEmail,
        phone: parsed.phone || formData.phone || undefined,
        location: parsed.location || formData.location || undefined,
        photo: photo || undefined,
        summary: parsed.summary,
        keyTopics: parsed.keyTopics,
        actionItems: parsed.actionItems,
        followUpSuggestion: parsed.followUpSuggestion,
        rawNotes: transcript,
        meetingContext: formData.meetingContext || undefined,
        createdAt: new Date().toISOString(),
        followUpStatus: contactEmail ? 'pending' : 'skipped',
      }

      if (user) {
        await saveContact(user.uid, newContact)
        // 10 seconds later: email the logged-in user a reminder to follow up (with action items)
        if (user.email) {
          const contactIdToRemind = newContact.id
          const uid = user.uid
          const userEmailToRemind = user.email
          setTimeout(() => {
            ;(async () => {
              try {
                const res = await fetch('/api/send-followup-reminder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: uid,
                    contactId: contactIdToRemind,
                    userEmail: userEmailToRemind,
                  }),
                })
                if (!res.ok) {
                  const errBody = await res.text()
                  console.error('Follow-up reminder failed:', res.status, errBody)
                }
              } catch (err) {
                console.error('Failed to send follow-up reminder:', err)
              }
            })()
          }, 10_000)
        }
      } else {
        saveToStorage([newContact, ...contacts])
      }
      setContacts(prev => [newContact, ...prev])
      setCurrentContact(newContact)
      setView('detail')
      resetForm()

    } catch (error) {
      console.error('AI processing error:', error)
      // Fallback: create contact with raw data
      const fallbackEmail = formData.email || undefined
      const fallbackContact: Contact = {
        id: crypto.randomUUID(),
        name: formData.name || 'New Contact',
        company: formData.company || undefined,
        role: formData.role || undefined,
        email: fallbackEmail,
        phone: formData.phone || undefined,
        location: formData.location || undefined,
        photo: photo || undefined,
        rawNotes: transcript,
        summary: 'Notes captured - AI summary unavailable',
        keyTopics: [],
        actionItems: [],
        followUpSuggestion: 'Review notes and follow up as appropriate',
        meetingContext: formData.meetingContext || undefined,
        createdAt: new Date().toISOString(),
        followUpStatus: fallbackEmail ? 'pending' : 'skipped',
      }
      if (user) {
        await saveContact(user.uid, fallbackContact)
        if (user.email) {
          const contactIdToRemind = fallbackContact.id
          const uid = user.uid
          const userEmailToRemind = user.email
          setTimeout(() => {
            ;(async () => {
              try {
                const res = await fetch('/api/send-followup-reminder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: uid,
                    contactId: contactIdToRemind,
                    userEmail: userEmailToRemind,
                  }),
                })
                if (!res.ok) {
                  const errBody = await res.text()
                  console.error('Follow-up reminder failed:', res.status, errBody)
                }
              } catch (err) {
                console.error('Failed to send follow-up reminder:', err)
              }
            })()
          }, 10_000)
        }
      } else {
        saveToStorage([fallbackContact, ...contacts])
      }
      setContacts(prev => [fallbackContact, ...prev])
      setCurrentContact(fallbackContact)
      setView('detail')
      resetForm()
    }

    setIsProcessing(false)
  }

  const resetForm = () => {
    setTranscript('')
    setPhoto(null)
    setFormData({
      name: '',
      company: '',
      role: '',
      email: '',
      phone: '',
      location: '',
      meetingContext: ''
    })
  }

  const deleteContact = async (id: string) => {
    try {
      if (user) {
        await deleteContactFromDB(user.uid, id)
      }
      const updated = contacts.filter(c => c.id !== id)
      setContacts(updated)
      if (!user) {
        saveToStorage(updated)
      }
      setView('list')
      setCurrentContact(null)
    } catch (error) {
      console.error('Failed to delete contact:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/auth')
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  const sendFollowUpNow = async (contact: Contact) => {
    if (!user) return
    try {
      const res = await fetch('/api/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          contactId: contact.id,
          userEmail: user.email ?? undefined,
        }),
      })
      if (res.ok) {
        const updated: Contact = {
          ...contact,
          followUpStatus: 'sent',
          followUpSentAt: new Date().toISOString(),
        }
        setCurrentContact(updated)
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)))
      }
    } catch (err) {
      console.error('Failed to send follow-up:', err)
    }
  }

  const generateDraft = async (contact: Contact) => {
    if (!user) return
    setDraftError(null)
    setDraftGenerating(true)
    try {
      const res = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, contactId: contact.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const updated: Contact = {
          ...contact,
          followUpStatus: 'draft_sent',
          followUpDraft: data.subject != null && data.body != null ? { subject: data.subject, body: data.body } : undefined,
          followUpChatHistory: [],
        }
        setCurrentContact(updated)
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)))
      } else {
        setDraftError(data.error || `Request failed (${res.status})`)
      }
    } catch (err) {
      console.error('Failed to generate draft:', err)
      setDraftError(err instanceof Error ? err.message : 'Failed to generate draft')
    } finally {
      setDraftGenerating(false)
    }
  }

  const sendFollowupChatMessage = async (contact: Contact, message: string) => {
    if (!user || !message.trim()) return
    setFollowupChatSending(true)
    const userMessage = message.trim()
    setFollowupChatInput('')
    const history = contact.followUpChatHistory ?? []
    const optimisticUserTurn = { role: 'user' as const, content: userMessage }
    const optimisticContact: Contact = {
      ...contact,
      followUpChatHistory: [...history, optimisticUserTurn],
    }
    setCurrentContact(optimisticContact)
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? optimisticContact : c)))
    try {
      const res = await fetch('/api/followup-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          contactId: contact.id,
          message: userMessage,
          history,
        }),
      })
      const data = await res.json()
      if (res.ok && data.subject != null && data.body != null) {
        const updated: Contact = {
          ...contact,
          followUpDraft: { subject: data.subject, body: data.body },
          followUpChatHistory: [
            ...history,
            optimisticUserTurn,
            { role: 'assistant' as const, content: data.assistantMessage ?? 'Draft updated.' },
          ],
          ...(typeof data.email === 'string' ? { email: data.email } : {}),
        }
        setCurrentContact(updated)
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)))
      }
    } catch (err) {
      console.error('Failed to send chat message:', err)
      setCurrentContact(contact)
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)))
    } finally {
      setFollowupChatSending(false)
    }
  }

  const sendFollowupToContact = async (contact: Contact) => {
    if (!user || !contact.followUpDraft?.subject || !contact.followUpDraft?.body) return
    setSendingFollowup(true)
    try {
      const res = await fetch('/api/send-followup-to-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          contactId: contact.id,
          userEmail: user.email ?? undefined,
        }),
      })
      if (res.ok) {
        const updated: Contact = {
          ...contact,
          followUpStatus: 'sent',
          followUpSentAt: new Date().toISOString(),
        }
        setCurrentContact(updated)
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)))
      }
    } catch (err) {
      console.error('Failed to send follow-up:', err)
    } finally {
      setSendingFollowup(false)
    }
  }

  const generateVCard = (contact: Contact) => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${contact.name}
${contact.company ? `ORG:${contact.company}` : ''}
${contact.role ? `TITLE:${contact.role}` : ''}
${contact.email ? `EMAIL:${contact.email}` : ''}
${contact.phone ? `TEL:${contact.phone}` : ''}
${contact.location ? `ADR:;;${contact.location};;;` : ''}
NOTE:${contact.summary || ''} | Met: ${contact.meetingContext || 'Conference'}
END:VCARD`

    const blob = new Blob([vcard], { type: 'text/vcard' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${contact.name.replace(/\s+/g, '_')}.vcf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const avatarColors = [
    ['#E8B4A8', '#D49888'],
    ['#A8C5E8', '#88A5C8'],
    ['#B8E8A8', '#98C888'],
    ['#E8D4A8', '#C8B488'],
    ['#D4A8E8', '#B488C8']
  ]

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100 flex items-center justify-center">
        <Loader2 size={32} className="text-gold-500 animate-spin" />
      </div>
    )
  }

  // Contact List View
  const ListView = () => (
    <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100">
      <header className="px-6 pt-12 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-4xl font-semibold text-warm-900 tracking-tight">
            Your Network
          </h1>
          {user ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warm-500/10 hover:bg-warm-500/20 transition-colors"
            >
              <LogOut size={16} className="text-warm-500" />
              <span className="font-sans text-sm text-warm-500">Sign Out</span>
            </button>
          ) : (
            <button
              onClick={() => router.push('/auth')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gold-500/15 hover:bg-gold-500/25 transition-colors"
            >
              <LogIn size={16} className="text-gold-600" />
              <span className="font-sans text-sm text-gold-600 font-medium">Sign In</span>
            </button>
          )}
        </div>
        {user ? (
          <p className="font-sans text-warm-400 text-sm mb-1">
            {user.email}
          </p>
        ) : (
          <p className="font-sans text-warm-400 text-sm mb-1">
            Guest mode — <span className="text-gold-500">sign in</span> to sync across devices
          </p>
        )}
        <p className="font-sans text-warm-500 mt-1">
          {contacts.length} connection{contacts.length !== 1 ? 's' : ''} captured
        </p>

        <p className="font-sans text-warm-400 text-sm mt-3 leading-relaxed">
          Voice-powered CRM for conferences. Dictate who you met, get AI-summarized action items, and download contact cards to your phone.
        </p>

        <div className="mt-5 p-4 bg-white/60 rounded-xl border border-cream-200/50">
          <p className="font-sans text-warm-600 text-xs font-semibold uppercase tracking-wider mb-3">How it works</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold-500 text-white text-xs font-semibold flex items-center justify-center">1</span>
              <p className="font-sans text-warm-600 text-sm">Tap the <span className="text-gold-600 font-medium">+</span> button to add a new connection</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold-500 text-white text-xs font-semibold flex items-center justify-center">2</span>
              <p className="font-sans text-warm-600 text-sm">Fill in basic details and record voice notes about your conversation</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold-500 text-white text-xs font-semibold flex items-center justify-center">3</span>
              <p className="font-sans text-warm-600 text-sm">Tap <span className="text-gold-600 font-medium">Generate Summary</span> to create AI-powered insights and action items</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold-500 text-white text-xs font-semibold flex items-center justify-center">4</span>
              <p className="font-sans text-warm-600 text-sm">Download the <span className="text-gold-600 font-medium">.vcf card</span> to save directly to your phone contacts</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 pb-32">
        {contactsLoading ? (
          <div className="text-center py-16">
            <Loader2 size={32} className="text-gold-500 animate-spin mx-auto mb-4" />
            <p className="font-sans text-warm-500">Loading your contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-cream-200 to-cream-300 flex items-center justify-center">
              <User size={32} className="text-gold-600" />
            </div>
            <p className="font-sans text-warm-500 text-lg">
              No contacts yet.<br />Tap + to add your first connection.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {contacts.map((contact, idx) => (
              <div
                key={contact.id}
                onClick={() => { setCurrentContact(contact); setView('detail') }}
                className="cursor-pointer transition-all duration-300 hover:scale-[1.02] animate-slide-up"
                style={{
                  animationDelay: `${idx * 0.1}s`,
                  animationFillMode: 'both'
                }}
              >
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-cream-200/50 flex items-center gap-4">
                  {contact.photo ? (
                    <img
                      src={contact.photo}
                      alt={contact.name}
                      className="w-14 h-14 rounded-2xl object-cover"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-display text-xl font-semibold"
                      style={{
                        background: `linear-gradient(135deg, ${avatarColors[idx % 5][0]} 0%, ${avatarColors[idx % 5][1]} 100%)`
                      }}
                    >
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-sans font-semibold text-warm-900 text-lg truncate">
                      {contact.name}
                    </h3>
                    {(contact.role || contact.company) && (
                      <p className="font-sans text-warm-500 text-sm truncate">
                        {[contact.role, contact.company].filter(Boolean).join(' @ ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={20} className="text-cream-400 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setView('new')}
        className="fixed bottom-8 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 shadow-lg shadow-gold-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
      >
        <Plus size={28} className="text-white" strokeWidth={2.5} />
      </button>
    </div>
  )

  // New Contact View
  const NewContactView = () => (
    <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100">
      <header className="px-6 pt-8 pb-6 flex items-center justify-between">
        <button
          onClick={() => { setView('list'); resetForm() }}
          className="bg-warm-500/10 rounded-xl p-3"
        >
          <X size={20} className="text-warm-500" />
        </button>
        <h2 className="font-display text-xl font-semibold text-warm-900">
          New Connection
        </h2>
        <div className="w-11" />
      </header>

      <div className="px-6 pb-32 space-y-6">
        {/* Photo Upload */}
        <div className="text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-24 h-24 rounded-3xl overflow-hidden transition-all ${photo ? '' : 'border-2 border-dashed border-cream-400 bg-cream-400/10 hover:border-gold-500'
              }`}
          >
            {photo ? (
              <img src={photo} alt="Contact" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <Upload size={24} className="text-gold-500" />
                <span className="font-sans text-xs text-warm-500 mt-2">Add Photo</span>
              </div>
            )}
          </button>
        </div>

        {/* Quick Info Fields */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-sans font-semibold text-warm-900 mb-4 text-sm uppercase tracking-wider">
            Quick Details
          </h3>

          <div className="space-y-3">
            {[
              { key: 'name', placeholder: 'Name', type: 'text' },
              { key: 'company', placeholder: 'Company', type: 'text' },
              { key: 'role', placeholder: 'Role / Title', type: 'text' },
              { key: 'email', placeholder: 'Email', type: 'email' },
              { key: 'phone', placeholder: 'Phone', type: 'tel' },
              { key: 'meetingContext', placeholder: 'Where did you meet?', type: 'text' }
            ].map(({ key, placeholder, type }) => (
              <input
                key={key}
                type={type}
                placeholder={placeholder}
                value={formData[key as keyof FormData]}
                onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-xl border border-cream-200 bg-cream-50/50 font-sans text-warm-900 placeholder:text-warm-500/60 focus:border-gold-500 transition-colors"
              />
            ))}
          </div>
        </div>

        {/* Voice Recording Section */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-sans font-semibold text-warm-900 mb-4 text-sm uppercase tracking-wider">
            Conversation Notes
          </h3>

          <p className="font-sans text-warm-500 text-sm mb-6 leading-relaxed">
            Dictate what you discussed, their interests, potential collaborations, or anything memorable about them.
          </p>

          <div className="flex justify-center mb-4">
            <button
              onClick={toggleRecording}
              disabled={!speechSupported}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${!speechSupported
                ? 'bg-cream-300 cursor-not-allowed'
                : isRecording
                  ? 'bg-gradient-to-br from-red-400 to-red-500 shadow-lg shadow-red-500/40 animate-pulse-recording'
                  : 'bg-gradient-to-br from-gold-400 to-gold-500 shadow-lg shadow-gold-500/30 hover:scale-105'
                }`}
            >
              {isRecording ? <MicOff size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
            </button>
          </div>

          <p className={`text-center font-sans text-sm ${isRecording ? 'text-red-500 font-medium' : 'text-warm-500'}`}>
            {!speechSupported
              ? 'Voice not supported in this browser'
              : isRecording
                ? 'Listening... tap to stop'
                : 'Tap to start recording'}
          </p>

          {transcript && (
            <div className="mt-6 p-4 bg-cream-50 rounded-xl border border-cream-200">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="w-full min-h-32 border-none bg-transparent font-sans text-warm-900 leading-relaxed resize-y focus:outline-none"
                placeholder="Your notes will appear here..."
              />
            </div>
          )}
        </div>

        {/* Process Button */}
        <button
          onClick={processWithAI}
          disabled={!transcript.trim() || isProcessing}
          className={`w-full py-4 rounded-2xl font-sans font-semibold flex items-center justify-center gap-3 transition-all ${transcript.trim() && !isProcessing
            ? 'bg-gradient-to-r from-warm-900 to-warm-800 text-white shadow-lg shadow-warm-900/20'
            : 'bg-cream-300 text-warm-500 cursor-not-allowed'
            }`}
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Generate Summary & Save
            </>
          )}
        </button>
      </div>
    </div>
  )

  // Contact Detail View
  const DetailView = () => {
    if (!currentContact) return null

    return (
      <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100">
        <header className="px-6 pt-8 pb-6 flex items-center justify-between">
          <button
            onClick={() => setView('list')}
            className="bg-warm-500/10 rounded-xl p-3"
          >
            <X size={20} className="text-warm-500" />
          </button>
          <h2 className="font-display text-xl font-semibold text-warm-900">
            Connection Details
          </h2>
          <button
            onClick={() => deleteContact(currentContact.id)}
            className="bg-red-500/10 rounded-xl p-3"
          >
            <Trash2 size={20} className="text-red-500" />
          </button>
        </header>

        <div className="px-6 pb-32 space-y-6">
          {/* Profile Header */}
          <div className="text-center">
            {currentContact.photo ? (
              <img
                src={currentContact.photo}
                alt={currentContact.name}
                className="w-24 h-24 rounded-3xl object-cover mx-auto mb-4 shadow-lg shadow-warm-500/20"
              />
            ) : (
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center mx-auto mb-4 text-white font-display text-3xl font-semibold shadow-lg shadow-gold-500/30">
                {currentContact.name.charAt(0).toUpperCase()}
              </div>
            )}

            <h1 className="font-display text-2xl font-semibold text-warm-900 mb-1">
              {currentContact.name}
            </h1>

            {(currentContact.role || currentContact.company) && (
              <p className="font-sans text-warm-500">
                {[currentContact.role, currentContact.company].filter(Boolean).join(' @ ')}
              </p>
            )}

            {currentContact.meetingContext && (
              <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-gold-500/15 rounded-full">
                <MapPin size={14} className="text-gold-500" />
                <span className="font-sans text-sm text-gold-500">
                  {currentContact.meetingContext}
                </span>
              </div>
            )}
          </div>

          {/* Contact Info */}
          {(currentContact.email || currentContact.phone || currentContact.location) && (
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              {currentContact.email && (
                <div className="flex items-center gap-3">
                  <Mail size={18} className="text-gold-500" />
                  <a href={`mailto:${currentContact.email}`} className="font-sans text-warm-900 hover:text-gold-500 transition-colors">
                    {currentContact.email}
                  </a>
                </div>
              )}
              {currentContact.phone && (
                <div className="flex items-center gap-3">
                  <Phone size={18} className="text-gold-500" />
                  <a href={`tel:${currentContact.phone}`} className="font-sans text-warm-900 hover:text-gold-500 transition-colors">
                    {currentContact.phone}
                  </a>
                </div>
              )}
              {currentContact.location && (
                <div className="flex items-center gap-3">
                  <MapPin size={18} className="text-gold-500" />
                  <span className="font-sans text-warm-900">{currentContact.location}</span>
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          {currentContact.summary && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-gold-500" />
                <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider">
                  Summary
                </h3>
              </div>
              <p className="font-sans text-warm-700 leading-relaxed">
                {currentContact.summary}
              </p>
            </div>
          )}

          {/* Key Topics */}
          {currentContact.keyTopics && currentContact.keyTopics.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider mb-4">
                Topics Discussed
              </h3>
              <div className="flex flex-wrap gap-2">
                {currentContact.keyTopics.map((topic, idx) => (
                  <span key={idx} className="px-4 py-2 bg-gradient-to-br from-cream-100 to-cream-200 rounded-full font-sans text-sm text-warm-700">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {currentContact.actionItems && currentContact.actionItems.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-gold-500/20">
              <h3 className="font-sans font-semibold text-gold-500 text-sm uppercase tracking-wider mb-4">
                Action Items
              </h3>
              <ul className="space-y-3">
                {currentContact.actionItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-2.5 flex-shrink-0" />
                    <span className="font-sans text-warm-700 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up Suggestion */}
          {currentContact.followUpSuggestion && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-gold-500" />
                <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider">
                  Follow-up Suggestion
                </h3>
              </div>
              <p className="font-sans text-warm-700 leading-relaxed">
                {currentContact.followUpSuggestion}
              </p>
            </div>
          )}

          {/* Follow-up: in-app draft + chat + send */}
          {currentContact.followUpStatus === 'pending' && (
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 flex items-start gap-3">
              <Loader2 size={18} className="text-amber-500 mt-0.5 flex-shrink-0 animate-spin" />
              <div>
                <p className="font-sans font-semibold text-amber-700 text-sm">Generating draft…</p>
                <p className="font-sans text-amber-600 text-xs mt-0.5">Draft will appear here in a moment</p>
                {currentContact.email && (
                  <p className="font-sans text-amber-600 text-xs mt-1.5 font-medium">
                    Email will be sent to: {currentContact.email}
                  </p>
                )}
              </div>
            </div>
          )}

          {currentContact.email && !currentContact.followUpDraft && currentContact.followUpStatus !== 'pending' && currentContact.followUpStatus !== 'sent' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-cream-200/50">
              <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider mb-2">
                Follow-up email
              </h3>
              <p className="font-sans text-warm-600 text-sm mb-2">
                Generate a draft to review and edit in the app, then send.
              </p>
              <p className="font-sans text-warm-700 text-sm font-medium mb-4 px-3 py-2 bg-cream-100 rounded-lg">
                Confirmation: email will be sent to <span className="text-gold-600">{currentContact.email}</span>
              </p>
              {draftError && (
                <p className="font-sans text-red-600 text-sm mb-4 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                  {draftError}
                </p>
              )}
              <button
                onClick={() => generateDraft(currentContact)}
                disabled={draftGenerating}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-white font-sans font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {draftGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {draftGenerating ? 'Generating…' : 'Generate follow-up draft'}
              </button>
            </div>
          )}

          {currentContact.followUpStatus === 'draft_sent' && currentContact.followUpDraft && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-cream-200/50">
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={16} className="text-gold-500" />
                  <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider">
                    Follow-up draft
                  </h3>
                </div>
                {currentContact.email && (
                  <p className="font-sans text-warm-600 text-xs mb-3 px-3 py-2 bg-gold-500/10 rounded-lg border border-gold-500/20">
                    Will be sent to: <span className="font-medium text-warm-800">{currentContact.email}</span>
                  </p>
                )}
                <p className="font-sans text-warm-700 text-sm font-medium mb-1">Subject: {currentContact.followUpDraft.subject}</p>
                <div className="font-sans text-warm-700 text-sm whitespace-pre-wrap leading-relaxed border-t border-cream-200 pt-3 mt-3">
                  {currentContact.followUpDraft.body}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-cream-200/50">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-gold-500" />
                  <h3 className="font-sans font-semibold text-warm-900 text-sm uppercase tracking-wider">
                    Edit with AI
                  </h3>
                </div>
                <p className="font-sans text-warm-600 text-xs mb-3">
                  Ask for changes (e.g. &quot;make it shorter&quot;, &quot;mention the project&quot;, or &quot;send to john@work.com instead&quot;).
                </p>
                {(currentContact.followUpChatHistory ?? []).length > 0 && (
                  <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                    {currentContact.followUpChatHistory!.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-gold-500/15 text-warm-800 ml-4' : 'bg-cream-100 text-warm-700 mr-4'}`}
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={followupChatInput}
                    onChange={(e) => setFollowupChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendFollowupChatMessage(currentContact, followupChatInput)
                      }
                    }}
                    placeholder="e.g. Make it friendlier"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-cream-200 bg-cream-50 font-sans text-sm focus:border-gold-500 focus:outline-none"
                    disabled={followupChatSending}
                  />
                  <button
                    onClick={() => sendFollowupChatMessage(currentContact, followupChatInput)}
                    disabled={followupChatSending || !followupChatInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-gold-500 text-white font-sans text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {followupChatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Send
                  </button>
                </div>
              </div>

              {user && (
                <button
                  onClick={() => sendFollowupToContact(currentContact)}
                  disabled={sendingFollowup}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-600 to-green-700 text-white font-sans font-semibold flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 disabled:opacity-70"
                >
                  {sendingFollowup ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  {sendingFollowup ? 'Sending…' : 'Send follow-up to ' + currentContact.name}
                </button>
              )}
              {currentContact.email && (
                <p className="font-sans text-warm-500 text-xs text-center">
                  Sends to: {currentContact.email}
                </p>
              )}
            </div>
          )}

          {currentContact.followUpStatus === 'sent' && (
            <div className="bg-green-50 rounded-2xl p-5 border border-green-200 flex items-start gap-3">
              <Send size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-sans font-semibold text-green-700 text-sm">Follow-up sent</p>
                <p className="font-sans text-green-700 text-sm mt-0.5">
                  Sent to: <span className="font-medium break-all">{currentContact.email || currentContact.name}</span>
                </p>
                <p className="font-sans text-green-600 text-xs mt-1">Replies will go to your email</p>
                {currentContact.followUpSentAt && (
                  <p className="font-sans text-green-600 text-xs mt-0.5">
                    {new Date(currentContact.followUpSentAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Raw Notes */}
          {currentContact.rawNotes && (
            <details className="bg-white rounded-2xl p-6 shadow-sm">
              <summary className="font-sans font-semibold text-warm-500 text-sm cursor-pointer outline-none">
                View Original Notes
              </summary>
              <p className="font-sans text-warm-600 leading-relaxed mt-4 pt-4 border-t border-cream-200 text-sm">
                {currentContact.rawNotes}
              </p>
            </details>
          )}

          {/* Download vCard Button */}
          <button
            onClick={() => generateVCard(currentContact)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-warm-900 to-warm-800 text-white font-sans font-semibold flex items-center justify-center gap-3 shadow-lg shadow-warm-900/20 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Download size={20} />
            Save Contact Card (.vcf)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto min-h-screen">
      {view === 'list' && ListView()}
      {view === 'new' && NewContactView()}
      {view === 'detail' && DetailView()}
    </div>
  )
}
