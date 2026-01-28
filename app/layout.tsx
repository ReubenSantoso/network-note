import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NetworkNote - Voice Contact CRM',
  description: 'Capture conversations with voice, get AI summaries, and save contacts to your phone',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#FDF8F3',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NetworkNote',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
