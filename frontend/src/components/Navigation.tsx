"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function fetchVisitCount() {
      try {
        const response = await fetch("/api/track-visit"); // Replace with actual API endpoint for fetching visit count
        if (response.ok) {
          const data = await response.json();
          setVisitCount(data.totalVisits);
        } else {
          console.error("Failed to fetch visit count");
        }
      } catch (error) {
        console.error("Error fetching visit count:", error);
      }
    }

    fetchVisitCount();
  }, []);

  const links = [
    { href: "/", label: "Home" },
    { href: "/workflow", label: "Workflow" },
    { href: "/data-generation", label: "Data Generation" },
    { href: "/data-validation", label: "Data Validation" },
    { href: "/about", label: "About Us" },
  ];

  return (
    <nav className="bg-gradient-to-r from-dark-700 via-dark-600 to-primary-700 text-white shadow-hard sticky top-0 z-50 backdrop-blur-md bg-opacity-90 border-b border-white/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Desktop Navigation */}
          <div className="hidden lg:flex space-x-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition-all duration-500 relative overflow-hidden group ${
                  pathname === link.href
                    ? "bg-white text-primary-700 shadow-medium transform scale-105"
                    : "hover:bg-white/20 hover:shadow-medium hover:scale-105 hover:-translate-y-0.5"
                }`}
              >
                <span className="relative z-10">{link.label}</span>
                {pathname !== link.href && (
                  <span className="absolute inset-0 bg-gradient-to-r from-accent-purple/0 via-accent-purple/30 to-accent-purple/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
                )}
              </Link>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          {/* Visit Count */}
          <div className="text-sm font-medium hidden sm:block">
            {visitCount !== null ? `Total Visits: ${visitCount}` : "Loading..."}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden pb-4 space-y-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-lg font-semibold transition-all ${
                  pathname === link.href
                    ? "bg-white text-primary-700 shadow-medium"
                    : "hover:bg-white/20"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="px-4 py-2 text-sm font-medium text-white/80 sm:hidden">
              {visitCount !== null
                ? `Total Visits: ${visitCount}`
                : "Loading..."}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
