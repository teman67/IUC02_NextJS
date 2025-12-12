'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

export default function Home() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const features = [
    {
      icon: '🔬',
      title: 'Data Generation',
      description: 'Comprehensive data collection and generation processes for creep testing',
      link: '/data-generation',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: '🧬',
      title: 'Semantic Resources',
      description: 'Rich metadata schemas and ontologies for material data organization',
      link: '/workflow',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: '✅',
      title: 'Data Validation',
      description: 'Robust validation tools ensuring data quality and consistency',
      link: '/data-validation',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: '📊',
      title: 'Complete Workflow',
      description: 'End-to-end framework for reference dataset curation',
      link: '/workflow',
      gradient: 'from-orange-500 to-amber-500'
    }
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-purple-500/10 to-pink-500/10 animate-pulse-subtle"></div>
        
        <div className={`max-w-7xl mx-auto px-6 text-center relative z-10 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="inline-block mb-6 px-6 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 rounded-full border border-primary-300 backdrop-blur-sm animate-fade-in">
            <span className="text-primary-700 font-semibold text-sm md:text-base">NFDI-MatWerk IUC02</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-slide-up">
              Reference Dataset Framework
            </span>
          </h1>
          
          <h2 className="text-xl md:text-3xl lg:text-4xl font-semibold mb-8 bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent animate-slide-up animate-delay-100">
            For Ni-Based Superalloy Creep Data
          </h2>
          
          <p className="text-lg md:text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed animate-slide-up animate-delay-200">
            A comprehensive framework for curating, validating, and distributing high-quality reference material datasets with detailed metadata and quality assessment
          </p>
          
          <div className="flex flex-wrap justify-center gap-6 animate-slide-up animate-delay-300">
            <Link href="/workflow" className="btn-primary">
              Explore Workflow
            </Link>
            <Link href="/data-generation" className="btn-secondary">
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-3xl md:text-4xl font-bold text-center mb-16 bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          Key Components
        </h3>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Link
              key={index}
              href={feature.link}
              className={`group card hover:scale-105 transition-all duration-500 cursor-pointer animate-slide-up`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`text-6xl mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500`}>
                {feature.icon}
              </div>
              <h4 className={`text-xl font-bold mb-3 bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}>
                {feature.title}
              </h4>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
              <div className="mt-4 flex items-center text-primary-600 font-semibold group-hover:translate-x-2 transition-transform duration-300">
                Learn more <span className="ml-2">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="card bg-gradient-to-br from-primary-600 via-purple-600 to-pink-600 text-white">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div className="group hover:scale-110 transition-transform duration-500">
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg">
                100%
              </div>
              <div className="text-lg md:text-xl opacity-90">
                FAIR Compliant
              </div>
            </div>
            <div className="group hover:scale-110 transition-transform duration-500">
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg">
                ∞
              </div>
              <div className="text-lg md:text-xl opacity-90">
                Data Quality
              </div>
            </div>
            <div className="group hover:scale-110 transition-transform duration-500">
              <div className="text-5xl md:text-6xl font-bold mb-2 drop-shadow-lg">
                24/7
              </div>
              <div className="text-lg md:text-xl opacity-90">
                Accessibility
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <div className="card bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-primary-200">
          <h3 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            Ready to Get Started?
          </h3>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Explore our comprehensive workflow and start working with high-quality reference datasets
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/workflow" className="btn-primary text-lg px-10 py-4">
              View Full Workflow
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
