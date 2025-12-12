'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navigation() {
  const pathname = usePathname()
  
  const links = [
    { href: '/', label: 'Home' },
    { href: '/workflow', label: 'Workflow' },
    { href: '/data-generation', label: 'Data Generation' },
    { href: '/data-validation', label: 'Data Validation' },
    { href: '/about', label: 'About Us' },
  ]

  return (
    <nav className="bg-gradient-to-r from-dark-700 via-dark-600 to-primary-700 text-white shadow-hard sticky top-0 z-50 backdrop-blur-md bg-opacity-90 border-b border-white/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-2 sm:space-x-4 lg:space-x-8 py-5 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all duration-500 relative overflow-hidden group ${
                pathname === link.href
                  ? 'bg-white text-primary-700 shadow-medium transform scale-105'
                  : 'hover:bg-white/20 hover:shadow-medium hover:scale-105 hover:-translate-y-0.5'
              }`}
            >
              <span className="relative z-10">{link.label}</span>
              {pathname !== link.href && (
                <span className="absolute inset-0 bg-gradient-to-r from-accent-purple/0 via-accent-purple/30 to-accent-purple/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
