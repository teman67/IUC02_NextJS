'use client'

import Image from 'next/image'
import Link from 'next/link'

interface WorkflowStep {
  text: string
  url: string
  bulletPoints?: string[]
  type?: 'semantic' | 'fdo' | 'mse' | 'standard'
}

export default function WorkflowDiagram() {
  const steps: WorkflowStep[] = [
    {
      text: 'Data Generation',
      url: '/data-generation',
      type: 'standard'
    },
    {
      text: 'Semantic Resources',
      url: 'https://git.rwth-aachen.de/nfdi-matwerk/iuc02',
      bulletPoints: [
        'JSON Metadata Schema',
        'Reference Dataset Ontology (RDO)',
        'Application-level extension for reference data on creep testing (RDOC)',
        'SHACL Shapes',
      ],
      type: 'semantic'
    },
    {
      text: 'Data Validation',
      url: '/data-validation',
      type: 'standard'
    },
    {
      text: 'MSE Knowledge Graph',
      url: 'https://nfdi.fiz-karlsruhe.de/matwerk/',
      type: 'mse'
    },
    {
      text: 'FAIR Digital Objects (FDO)',
      url: 'https://kit-data-manager.github.io/fairdoscope/?pid=21.11152/253e0f2a-4d4a-4916-a45a-ef7cd8ad1f9b',
      type: 'fdo'
    },
  ]

  return (
    <div className="card animate-slide-up animate-delay-200">
      <h3 className="text-3xl font-bold mb-10 text-center bg-gradient-to-r from-primary-600 via-accent-purple to-primary-800 bg-clip-text text-transparent">
        Complete Workflow
      </h3>
      <div className="flex justify-center items-center gap-12 flex-wrap">
        {steps.map((step, index) => (
          <div key={index} className="relative group">
            {step.type === 'semantic' && (
              <a href={step.url} target="_blank" rel="noopener noreferrer" className="hover-box large-box relative flex flex-col p-6 no-underline group-hover:animate-float" style={{ height: '260px', width: '320px' }}>
                <div className="flex items-center gap-3 font-bold mb-3" style={{ fontSize: '20px' }}>
                  <Image
                    src="https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png"
                    alt="GitLab"
                    width={50}
                    height={50}
                    className="opacity-90 group-hover:opacity-100 transition-all duration-300 flex-shrink-0 group-hover:rotate-12 group-hover:scale-110"
                  />
                  <span className="drop-shadow-sm">{step.text}</span>
                </div>
                {step.bulletPoints && (
                  <ul className="list-disc pl-4 text-left leading-relaxed" style={{ fontSize: '17px' }}>
                    {step.bulletPoints.map((bullet, i) => (
                      <li key={i} className="mb-1.5 hover:translate-x-1 transition-transform duration-200">{bullet}</li>
                    ))}
                  </ul>
                )}
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"></div>
              </a>
            )}

            {step.type === 'fdo' && (
              <a href={step.url} target="_blank" rel="noopener noreferrer" className="hover-box large-box relative flex items-center justify-center p-6 text-lg no-underline group-hover:animate-float" style={{ height: '100px', width: '340px' }}>
                <span className="block text-center font-bold text-lg drop-shadow-sm">
                  {step.text}
                </span>
                <Image
                  src="https://kit-data-manager.github.io/fairdoscope/images/logo.png"
                  alt="FDO"
                  width={50}
                  height={50}
                  className="absolute bottom-2 right-2 opacity-90 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"></div>
              </a>
            )}

            {step.type === 'mse' && (
              <a href={step.url} target="_blank" rel="noopener noreferrer" className="hover-box large-box relative flex items-center justify-center p-6 text-lg no-underline group-hover:animate-float" style={{ height: '100px', width: '340px' }}>
                <span className="block text-center font-bold text-lg drop-shadow-sm">
                  {step.text}
                </span>
                <Image
                  src="https://cdn-icons-png.flaticon.com/512/14511/14511403.png"
                  alt="MSE Knowledge Graph"
                  width={50}
                  height={50}
                  className="absolute bottom-2 right-2 opacity-90 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"></div>
              </a>
            )}

            {step.type === 'standard' && (
              <Link href={step.url} className="hover-box text-lg group-hover:animate-float drop-shadow-sm" style={{ width: '240px', height: '90px' }}>
                {step.text}
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"></div>
              </Link>
            )}

            {index < steps.length - 1 && (
              <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-4xl text-primary-500 hidden lg:block z-10 group-hover:scale-125 group-hover:text-accent-purple transition-all duration-300 drop-shadow-lg">
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
