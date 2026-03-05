'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'

// Count-up hook
function useCountUp(target: number, duration: number, trigger: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!trigger) return
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [trigger, target, duration])
  return value
}

// IntersectionObserver hook
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setInView(true); obs.disconnect() }
      },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

const CYCLING_WORDS = ['Creep Data', 'Material Science', 'FAIR Datasets', 'Ni Superalloys']

export default function Home() {
  const [heroVisible, setHeroVisible] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const [wordVisible, setWordVisible] = useState(true)

  const { ref: featuresRef, inView: featuresVisible } = useInView()
  const { ref: statsRef, inView: statsVisible } = useInView(0.3)
  const { ref: ctaRef, inView: ctaVisible } = useInView(0.2)

  const fairCount = useCountUp(100, 1800, statsVisible)

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Word cycling every 2.5 s
  useEffect(() => {
    const interval = setInterval(() => {
      setWordVisible(false)
      setTimeout(() => {
        setWordIndex(i => (i + 1) % CYCLING_WORDS.length)
        setWordVisible(true)
      }, 350)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  const features = [
    {
      icon: '🔬',
      title: 'Data Generation',
      description: 'Comprehensive data collection and generation processes for creep testing',
      link: '/data-generation',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: '🧬',
      title: 'Semantic Resources',
      description: 'Rich metadata schemas and ontologies for material data organization',
      link: '/workflow',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: '✅',
      title: 'Data Validation',
      description: 'Robust validation tools ensuring data quality and consistency',
      link: '/data-validation',
      gradient: 'from-emerald-500 to-teal-500',
    },
    {
      icon: '📊',
      title: 'Complete Workflow',
      description: 'End-to-end framework for reference dataset curation',
      link: '/workflow',
      gradient: 'from-orange-500 to-amber-500',
    },
  ]

  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Soft gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-purple-500/10 to-pink-500/10 animate-pulse-subtle" />

        {/* Floating blurred orbs */}
        <div className="orb w-96 h-96 bg-primary-400/20 top-[-80px] left-[-80px] animate-float" />
        <div className="orb w-72 h-72 bg-purple-400/20 bottom-[-40px] right-[-40px] animate-float-delayed" />
        <div className="orb w-56 h-56 bg-pink-400/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-float-slow" />

        {/* Spinning decorative rings (desktop only) */}
        <div className="absolute top-16 right-16 w-32 h-32 rounded-full border border-primary-300/30 animate-spin-slow hidden lg:block" />
        <div className="absolute top-20 right-20 w-20 h-20 rounded-full border border-purple-300/30 animate-spin-reverse hidden lg:block" />
        <div className="absolute bottom-24 left-16 w-24 h-24 rounded-full border border-pink-300/30 animate-spin-slow hidden lg:block" />

        <div
          className={`max-w-7xl mx-auto px-6 text-center relative z-10 transition-all duration-1000 ${
            heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          {/* Badge with pulsing ring */}
          <div className="inline-flex items-center justify-center relative mb-8">
            <div className="absolute inset-0 rounded-full bg-primary-400/20 animate-ping-slow" />
            <div className="relative px-6 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-full border border-primary-300 backdrop-blur-sm">
              <span className="text-primary-700 font-semibold text-sm md:text-base">
                NFDI-MatWerk IUC02
              </span>
            </div>
          </div>

          {/* Animated gradient headline */}
          <h1
            className={`text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight transition-all duration-700 delay-150 ${
              heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <span className="animate-gradient-text">Reference Dataset Framework</span>
          </h1>

          {/* Cycling word subtitle */}
          <h2
            className={`text-xl md:text-3xl lg:text-4xl font-semibold mb-8 text-gray-700 transition-all duration-700 delay-300 ${
              heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            For{' '}
            <span
              className={`inline-block bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent transition-all duration-300 ${
                wordVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              {CYCLING_WORDS[wordIndex]}
            </span>
          </h2>

          <p
            className={`text-lg md:text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed transition-all duration-700 delay-500 ${
              heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            A comprehensive framework for curating, validating, and distributing high-quality
            reference material datasets with detailed metadata and quality assessment
          </p>

          {/* CTA buttons */}
          <div
            className={`flex flex-wrap justify-center gap-6 transition-all duration-700 delay-700 ${
              heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <Link href="/workflow" className="btn-primary group">
              <span className="flex items-center gap-2">
                Explore Workflow
                <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
              </span>
            </Link>
            <Link href="/data-generation" className="btn-secondary">
              Get Started
            </Link>
          </div>

          {/* Scroll indicator */}
          <div
            className={`mt-16 flex justify-center transition-all duration-700 delay-1000 ${
              heroVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex flex-col items-center gap-2 text-gray-400 animate-bounce-subtle">
              <span className="text-xs font-medium tracking-widest uppercase">Scroll</span>
              <div className="w-5 h-8 rounded-full border-2 border-gray-300 flex justify-center pt-1.5">
                <div className="w-1 h-2 rounded-full bg-gray-400 animate-bounce" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ─────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-16" ref={featuresRef}>
        <h3
          className={`text-3xl md:text-4xl font-bold text-center mb-16 animate-gradient-text transition-all duration-700 ${
            featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          Key Components
        </h3>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Link
              key={index}
              href={feature.link}
              className={`group card hover:scale-105 cursor-pointer transition-all duration-700 ${
                featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
              style={{ transitionDelay: featuresVisible ? `${index * 120}ms` : '0ms' }}
            >
              <div className="text-6xl mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 select-none">
                {feature.icon}
              </div>

              <h4
                className={`text-xl font-bold mb-3 bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent relative w-fit`}
              >
                {feature.title}
                <span
                  className={`absolute -bottom-0.5 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-500 bg-gradient-to-r ${feature.gradient} rounded`}
                />
              </h4>

              <p className="text-gray-600 leading-relaxed">{feature.description}</p>

              <div className="mt-4 flex items-center text-primary-600 font-semibold group-hover:translate-x-2 transition-transform duration-300">
                Learn more{' '}
                <span className="ml-2 group-hover:ml-3 transition-all duration-300">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-16" ref={statsRef}>
        <div
          className={`card bg-gradient-to-br from-primary-600 via-purple-600 to-pink-600 text-white transition-all duration-700 ${
            statsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div
              className={`group hover:scale-110 transition-all duration-700 ${
                statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg tabular-nums">
                {fairCount}%
              </div>
              <div className="text-lg md:text-xl opacity-90">FAIR Compliant</div>
            </div>

            <div
              className={`group hover:scale-110 transition-all duration-700 delay-200 ${
                statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg">∞</div>
              <div className="text-lg md:text-xl opacity-90">Data Quality</div>
            </div>

            <div
              className={`group hover:scale-110 transition-all duration-700 delay-400 ${
                statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg">24/7</div>
              <div className="text-lg md:text-xl opacity-90">Accessibility</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center" ref={ctaRef}>
        <div
          className={`card bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-primary-200 transition-all duration-700 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <h3 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            Ready to Get Started?
          </h3>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Explore our comprehensive workflow and start working with high-quality reference datasets
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/workflow" className="btn-primary text-lg px-10 py-4 group">
              <span className="flex items-center gap-2">
                View Full Workflow
                <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
              </span>
            </Link>
            <a
              href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-lg px-10 py-4"
            >
              Git Repository
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
