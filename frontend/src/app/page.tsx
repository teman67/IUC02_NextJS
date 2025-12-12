'use client'

import { useState, useEffect } from 'react'
import WorkflowDiagram from '@/components/WorkflowDiagram'
import WarningMessage from '@/components/WarningMessage'

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto">
      <WarningMessage />
      
      <div className="mb-12 animate-slide-up">
        <h1 className="section-title mb-3">
          IUC02: Framework for Curation and Distribution of Reference Datasets
        </h1>
        <h2 className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-gray-600 to-gray-800 bg-clip-text text-transparent mb-8 animate-fade-in">
          (on the Example of Creep Data of Ni-Based Superalloys)
        </h2>
      </div>

      <div className="card space-y-6 text-gray-700 leading-relaxed text-lg mb-12 animate-slide-up animate-delay-100">
        <p className="text-xl">
          The aim of this IUC is to <strong className="text-gradient font-bold">develop a framework for reference material data sets</strong> using creep properties of single crystal Ni-based superalloy as an example. 
          Such reference data sets are necessary for:
        </p>
        
        <div className="space-y-4 pl-6 border-l-4 border-gradient-to-b from-primary-400 via-accent-purple to-primary-600 bg-gradient-to-r from-primary-50/50 to-purple-50/50 p-6 rounded-r-2xl backdrop-blur-sm">
          <p className="flex items-start group hover:translate-x-1 transition-transform duration-300">
            <span className="text-2xl mr-4 group-hover:scale-110 transition-transform">✓</span>
            <span><strong className="text-primary-700">Evaluating and validating</strong> experimental/modeling methods and their uncertainties</span>
          </p>
          <p className="flex items-start group hover:translate-x-1 transition-transform duration-300">
            <span className="text-2xl mr-4 group-hover:scale-110 transition-transform">✓</span>
            <span><strong className="text-primary-700">Assessing the performance</strong> of analysis, modeling, and simulation tools by use of standardized processes</span>
          </p>
          <p className="flex items-start group hover:translate-x-1 transition-transform duration-300">
            <span className="text-2xl mr-4 group-hover:scale-110 transition-transform">✓</span>
            <span><strong className="text-primary-700">Providing comprehensive material descriptions</strong> (e.g., meta-data schemas and ontologies)</span>
          </p>
        </div>

        <p className="text-lg leading-loose">
          Community-driven processes will be established for the <strong className="text-gradient">definition, identification, and curation of reference material data sets</strong>, including metadata, raw data, processed data, and quality assessment routines. 
          Reference data sets will contain <strong className="text-gradient">detailed meta-data and context concerning materials history, data collection</strong> (e.g., testing and measurement equipment, calibration status/certificate), 
          and the related specific uncertainty/error (measurement, model, simulation). Existing data on Ni-base superalloys from PP18 BAM and PP01 SFB/TR103 will be used, 
          where superalloys have been well characterized using a broad spectrum of characterization methods and in-depth data is available.
        </p>

        <div className="flex items-center gap-3 bg-gradient-to-r from-primary-100 via-purple-100 to-blue-100 p-6 rounded-2xl hover:shadow-medium transition-all duration-300 group border border-primary-200">
          <span className="text-3xl group-hover:scale-110 transition-transform duration-300">📚</span>
          <span className="text-lg">
            For more details about the Workflow, please visit the{' '}
            <a 
              href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gradient font-bold hover:underline transition-all duration-300 hover:tracking-wide"
            >
              Git Repository →
            </a>
          </span>
        </div>
      </div>

      <WorkflowDiagram />
    </div>
  )
}
