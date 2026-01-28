'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Mic, MicOff, Upload, User, Sparkles, Download, Plus, 
  ChevronRight, X, Clock, MapPin, Building, Mail, Phone, 
  Loader2, Trash2, Edit3, Save
} from 'lucide-react'

// Types
interface Contact {
  id: number
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
}

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

// Local storage helpers
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

export default function NetworkNote() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [currentContact, setCurrentContact] = useState<Contact | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list')
  const [speechSupported, setSpeechSupported] = useState(false)
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

  // Load contacts from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage()
    setContacts(stored)
  }, [])

  // Save contacts to localStorage whenever they change
  useEffect(() => {
    if (contacts.length > 0 || loadFromStorage().length > 0) {
      saveToStorage(contacts)
    }
  }, [contacts])

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
      
      const newContact: Contact = {
        id: Date.now(),
        name: parsed.name || formData.name || 'Unknown Contact',
        company: parsed.company || formData.company || undefined,
        role: parsed.role || formData.role || undefined,
        email: parsed.email || formData.email || undefined,
        phone: parsed.phone || formData.phone || undefined,
        location: parsed.location || formData.location || undefined,
        photo: photo || undefined,
        summary: parsed.summary,
        keyTopics: parsed.keyTopics,
        actionItems: parsed.actionItems,
        followUpSuggestion: parsed.followUpSuggestion,
        rawNotes: transcript,
        meetingContext: formData.meetingContext || undefined,
        createdAt: new Date().toISOString()
      }
      
      setContacts(prev => [newContact, ...prev])
      setCurrentContact(newContact)
      setView('detail')
      resetForm()
      
    } catch (error) {
      console.error('AI processing error:', error)
      // Fallback: create contact with raw data
      const fallbackContact: Contact = {
        id: Date.now(),
        name: formData.name || 'New Contact',
        company: formData.company || undefined,
        role: formData.role || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        location: formData.location || undefined,
        photo: photo || undefined,
        rawNotes: transcript,
        summary: 'Notes captured - AI summary unavailable',
        keyTopics: [],
        actionItems: [],
        followUpSuggestion: 'Review notes and follow up as appropriate',
        meetingContext: formData.meetingContext || undefined,
        createdAt: new Date().toISOString()
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

  const deleteContact = (id: number) => {
    setContacts(prev => prev.filter(c => c.id !== id))
    setView('list')
    setCurrentContact(null)
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

  // Contact List View
  const ListView = () => (
    <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100">
      <header className="px-6 pt-12 pb-8">
        <h1 className="font-display text-4xl font-semibold text-warm-900 tracking-tight">
          Your Network
        </h1>
        <p className="font-sans text-warm-500 mt-2">
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
        {contacts.length === 0 ? (
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
            className={`w-24 h-24 rounded-3xl overflow-hidden transition-all ${
              photo ? '' : 'border-2 border-dashed border-cream-400 bg-cream-400/10 hover:border-gold-500'
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
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                !speechSupported 
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
          className={`w-full py-4 rounded-2xl font-sans font-semibold flex items-center justify-center gap-3 transition-all ${
            transcript.trim() && !isProcessing
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
      {view === 'list' && <ListView />}
      {view === 'new' && <NewContactView />}
      {view === 'detail' && <DetailView />}
    </div>
  )
}
