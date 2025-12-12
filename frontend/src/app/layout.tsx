import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'
import BackgroundLogo from '@/components/BackgroundLogo'

export const metadata: Metadata = {
  title: 'IUC02: Framework for Curation and Distribution of Reference Datasets',
  description: 'Framework for reference material data sets using creep properties of single crystal Ni-based superalloy',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Navigation />
        <BackgroundLogo />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
          {children}
        </main>
      </body>
    </html>
  )
}
