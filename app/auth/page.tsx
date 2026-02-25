'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react'

export default function AuthPage() {
    const [isSignUp, setIsSignUp] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { signIn, signUp, user } = useAuth()
    const router = useRouter()

    // Redirect if already signed in
    if (user) {
        router.push('/')
        return null
    }

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
