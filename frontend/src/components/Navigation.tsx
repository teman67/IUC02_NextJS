'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navigation() {
  const pathname = usePathname()
  
  const links = [
    { href: '/', label: 'Home' },
    { href: '/data-generation', label: 'Data Generation' },
    { href: '/data-validation', label: 'Data Validation' },
    { href: '/about', label: 'About Us' },
  ]

  return (
    <nav className="bg-gradient-to-r from-dark-600 via-dark-500 to-primary-700 text-white shadow-medium sticky top-0 z-50 backdrop-blur-sm bg-opacity-95">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-2 sm:space-x-4 lg:space-x-8 py-4 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition-all duration-300 ${
                pathname === link.href
                  ? 'bg-white text-primary-700 font-bold shadow-soft transform scale-105'
                  : 'hover:bg-white/10 hover:shadow-soft hover:scale-105'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
