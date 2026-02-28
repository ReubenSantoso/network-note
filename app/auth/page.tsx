'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react'

export default function AuthPage() {
    const [isSignUp, setIsSignUp] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { signIn, signUp, signInWithGoogle, user } = useAuth()
    const router = useRouter()

    // Redirect if already signed in
    useEffect(() => {
        if (user) {
            router.push('/')
        }
    }, [user, router])

    const getErrorMessage = (code: string): string => {
        switch (code) {
            case 'auth/email-already-in-use':
                return 'An account with this email already exists'
            case 'auth/invalid-email':
                return 'Please enter a valid email address'
            case 'auth/weak-password':
                return 'Password must be at least 6 characters'
            case 'auth/user-not-found':
                return 'No account found with this email'
            case 'auth/wrong-password':
                return 'Incorrect password'
            case 'auth/invalid-credential':
                return 'Invalid email or password'
            case 'auth/too-many-requests':
                return 'Too many attempts. Please try again later'
            default:
                return 'Something went wrong. Please try again'
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isSignUp) {
                await signUp(email, password)
            } else {
                await signIn(email, password)
            }
            router.push('/')
        } catch (err: unknown) {
            const firebaseError = err as { code?: string }
            setError(getErrorMessage(firebaseError.code || ''))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-cream-50 to-cream-100 flex items-center justify-center px-6">
            <div className="w-full max-w-sm">
                {/* Logo / Header */}
                <div className="text-center mb-10">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/30">
                        <User size={36} className="text-white" />
                    </div>
                    <h1 className="font-display text-3xl font-semibold text-warm-900 tracking-tight">
                        NetworkNote
                    </h1>
                    <p className="font-sans text-warm-500 mt-2">
                        {isSignUp ? 'Create your account' : 'Welcome back'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-warm-400" />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-cream-200 bg-cream-50/50 font-sans text-warm-900 placeholder:text-warm-500/60 focus:border-gold-500 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-warm-400" />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-cream-200 bg-cream-50/50 font-sans text-warm-900 placeholder:text-warm-500/60 focus:border-gold-500 transition-colors"
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                <p className="font-sans text-sm text-red-600">{error}</p>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-warm-900 to-warm-800 text-white font-sans font-semibold flex items-center justify-center gap-3 shadow-lg shadow-warm-900/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                {isSignUp ? 'Creating account...' : 'Signing in...'}
                            </>
                        ) : (
                            <>
                                {isSignUp ? 'Create Account' : 'Sign In'}
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                {/* Toggle */}
                <div className="text-center mt-6 space-y-3">
                    <button
                        onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                        className="font-sans text-warm-500 text-sm hover:text-gold-600 transition-colors"
                    >
                        {isSignUp
                            ? 'Already have an account? Sign in'
                            : "Don't have an account? Create one"}
                    </button>

                    <div className="relative flex items-center justify-center">
                        <div className="border-t border-cream-300 w-full" />
                        <span className="bg-gradient-to-b from-cream-50 to-cream-100 px-3 font-sans text-xs text-warm-400 absolute">or</span>
                    </div>

                    <button
                        onClick={async () => {
                            setError('')
                            setLoading(true)
                            try {
                                await signInWithGoogle()
                                router.push('/')
                            } catch (err: unknown) {
                                const firebaseError = err as { code?: string }
                                if (firebaseError.code !== 'auth/popup-closed-by-user') {
                                    setError(getErrorMessage(firebaseError.code || ''))
                                }
                            } finally {
                                setLoading(false)
                            }
                        }}
                        disabled={loading}
                        className="w-full py-3.5 rounded-2xl bg-white border border-cream-200 font-sans font-medium text-warm-800 flex items-center justify-center gap-3 shadow-sm hover:border-gold-400 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                            <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </svg>
                        Sign in with Google
                    </button>

                    <button
                        onClick={() => router.push('/')}
                        className="font-sans text-warm-500 text-sm hover:text-warm-700 transition-colors"
                    >
                        Continue as Guest →
                    </button>
                </div>
            </div>
        </div>
    )
}
