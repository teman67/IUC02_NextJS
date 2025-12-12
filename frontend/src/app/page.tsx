'use client'

import { useState, useEffect } from 'react'
import WorkflowDiagram from '@/components/WorkflowDiagram'
import WarningMessage from '@/components/WarningMessage'

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto">
      <WarningMessage />
      
      <div className="mb-8 animate-slide-up">
        <h1 className="section-title mb-2">
          IUC02: Framework for Curation and Distribution of Reference Datasets
        </h1>
        <h2 className="text-xl md:text-2xl font-semibold text-gray-600 mb-6">
          (on the Example of Creep Data of Ni-Based Superalloys)
        </h2>
      </div>

      <div className="card space-y-6 text-gray-700 leading-relaxed text-lg mb-10">
        <p>
          The aim of this IUC is to <strong className="text-primary-700">develop a framework for reference material data sets</strong> using creep properties of single crystal Ni-based superalloy as an example. 
          Such reference data sets are necessary for:
        </p>
        
        <div className="space-y-3 pl-4 border-l-4 border-primary-400 bg-primary-50 p-4 rounded-r-lg">
          <p className="flex items-start">
            <span className="text-primary-600 font-bold mr-3">(i)</span>
            <span><strong>Evaluating and validating</strong> experimental/modeling methods and their uncertainties</span>
          </p>
          <p className="flex items-start">
            <span className="text-primary-600 font-bold mr-3">(ii)</span>
            <span><strong>Assessing the performance</strong> of analysis, modeling, and simulation tools by use of standardized processes</span>
          </p>
          <p className="flex items-start">
            <span className="text-primary-600 font-bold mr-3">(iii)</span>
            <span><strong>Providing comprehensive material descriptions</strong> (e.g., meta-data schemas and ontologies)</span>
          </p>
        </div>

        <p>
          Community-driven processes will be established for the <strong className="text-primary-700">definition, identification, and curation of reference material data sets</strong>, including metadata, raw data, processed data, and quality assessment routines. 
          Reference data sets will contain <strong className="text-primary-700">detailed meta-data and context concerning materials history, data collection</strong> (e.g., testing and measurement equipment, calibration status/certificate), 
          and the related specific uncertainty/error (measurement, model, simulation). Existing data on Ni-base superalloys from PP18 BAM and PP01 SFB/TR103 will be used, 
          where superalloys have been well characterized using a broad spectrum of characterization methods and in-depth data is available.
        </p>

        <div className="flex items-center gap-2 bg-gradient-to-r from-primary-100 to-blue-100 p-4 rounded-lg">
          <span className="text-2xl">📚</span>
          <span>
            For more details about the Workflow, please visit the{' '}
            <a 
              href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary-700 hover:text-primary-900 underline font-semibold transition-colors"
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
