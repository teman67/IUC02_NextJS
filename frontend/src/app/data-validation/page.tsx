'use client'

import { useState } from 'react'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function DataValidationPage() {
  const [rdfContent, setRdfContent] = useState('')
  const [shaclContent, setShaclContent] = useState('')
  const [validationResult, setValidationResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [rdfOption, setRdfOption] = useState<'upload' | 'example'>('upload')
  const [shaclOption, setShaclOption] = useState<'upload' | 'example'>('upload')

  const loadExampleFile = async (filename: string, setter: (content: string) => void) => {
    try {
      const response = await axios.get(`${API_URL}/api/files/${filename}`)
      setter(response.data.content)
    } catch (error) {
      console.error('Error loading example file:', error)
      alert('Failed to load example file')
    }
  }

  const handleValidate = async () => {
    if (!rdfContent || !shaclContent) {
      alert('Please provide both Data Graph and Shape Graph')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post(`${API_URL}/api/validate`, {
        rdf_content: rdfContent,
        shacl_content: shaclContent
      })
      setValidationResult(response.data)
    } catch (error: any) {
      alert(`Validation failed: ${error.response?.data?.detail || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <h2 className="section-title mb-6">Data Validation Workflow</h2>

      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 mb-8">
        <ul className="space-y-3 text-gray-700">
          <li className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <span>In this Data Validation Workflow you can explore how the exemplary <strong className="text-primary-700">Data Graph</strong> (populated with data from the Reference data on creep) is validated against predefined SHACL Shapes.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📊</span>
            <span>For this step the SHACL Shapes needs to be predefined (<strong className="text-primary-700">Shape Graph</strong>).</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📝</span>
            <span>The output of the Validation Process is the <strong className="text-primary-700">Validation protocol</strong>, which reports the violations of the SHACL constraints.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📤</span>
            <span>You can use your own Data Graph and SHACL Shapes in this Data Validation Workflow.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">💻</span>
            <span>The Script for the validation is running in the backend and can be accessed in the <a href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02" target="_blank" className="text-primary-600 hover:text-primary-800 underline font-semibold">Git Repository</a>.</span>
          </li>
        </ul>
      </div>

      {/* Data Graph Section */}
      <div className="card bg-gradient-to-br from-dark-600 to-dark-700 text-white mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>📄</span> Select Data Graph file:
            </h3>
            <div className="space-y-3 mb-4 bg-white/10 p-4 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="upload"
                  checked={rdfOption === 'upload'}
                  onChange={() => setRdfOption('upload')}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="text-lg">Upload Your Own</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="example"
                  checked={rdfOption === 'example'}
                  onChange={() => {
                    setRdfOption('example')
                    loadExampleFile('rdfGraph_smallExample.ttl', setRdfContent)
                  }}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="text-lg">Use Example Data Graph</span>
              </label>
            </div>

            {rdfOption === 'upload' && (
              <input
                type="file"
                accept=".ttl"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      setRdfContent(event.target?.result as string)
                    }
                    reader.readAsText(file)
                  }
                }}
                className="mb-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-white file:text-primary-700 hover:file:bg-gray-100 file:cursor-pointer"
              />
            )}

            <textarea
              value={rdfContent}
              onChange={(e) => setRdfContent(e.target.value)}
              placeholder="Edit Data Graph..."
              className="w-full h-64 p-3 text-gray-900 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-400 outline-none"
            />
          </div>

          <div className="flex items-start">
            <button
              onClick={() => downloadFile(rdfContent, 'example_data.ttl')}
              disabled={!rdfContent}
              className="btn-secondary w-full"
            >
              📥 Download Example Data Graph
            </button>
          </div>
        </div>
      </div>

      {/* SHACL Shape Section */}
      <div className="card bg-gradient-to-br from-primary-600 to-primary-700 text-white mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🔍</span> Select Shape Graph file:
            </h3>
            <div className="space-y-3 mb-4 bg-white/10 p-4 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="upload"
                  checked={shaclOption === 'upload'}
                  onChange={() => setShaclOption('upload')}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="text-lg">Upload Your Own</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="example"
                  checked={shaclOption === 'example'}
                  onChange={() => {
                    setShaclOption('example')
                    loadExampleFile('shaclShape_smallExample.ttl', setShaclContent)
                  }}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="text-lg">Use Example Shape Graph</span>
              </label>
            </div>

            {shaclOption === 'upload' && (
              <input
                type="file"
                accept=".ttl"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      setShaclContent(event.target?.result as string)
                    }
                    reader.readAsText(file)
                  }
                }}
                className="mb-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-white file:text-primary-700 hover:file:bg-gray-100 file:cursor-pointer"
              />
            )}

            <textarea
              value={shaclContent}
              onChange={(e) => setShaclContent(e.target.value)}
              placeholder="Edit Shape Graph..."
              className="w-full h-64 p-3 text-gray-900 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-400 outline-none"
            />
          </div>

          <div className="flex items-start">
            <button
              onClick={() => downloadFile(shaclContent, 'example_shacl.ttl')}
              disabled={!shaclContent}
              className="btn-secondary w-full"
            >
              📥 Download Example Shape Graph
            </button>
          </div>
        </div>
      </div>

      {/* Validate Button */}
      <div className="card bg-gradient-to-r from-accent-green to-emerald-500 text-white text-center shadow-medium hover:shadow-hard transition-all mb-8">
        <button
          onClick={handleValidate}
          disabled={loading || !rdfContent || !shaclContent}
          className="btn-primary w-full max-w-md mx-auto text-xl py-4"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Validating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>✔️</span> Validate Data Against SHACL
            </span>
          )}
        </button>
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className="space-y-6 animate-slide-up">
          <div className={`card ${
            validationResult.conforms 
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400' 
              : 'bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-400'
          }`}>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-5xl">{validationResult.conforms ? '✅' : '⚠️'}</span>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Validation Result</h3>
                <p className="text-xl font-semibold">
                  <strong>Conforms:</strong> 
                  <span className={validationResult.conforms ? 'text-green-700' : 'text-yellow-700'}>
                    {validationResult.conforms ? ' Yes ✓' : ' No ✗'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
              <span>📝</span> SHACL Report:
            </h3>
            <textarea
              value={validationResult.report_text}
              readOnly
              className="w-full h-64 p-3 border-2 border-gray-300 rounded-lg font-mono text-sm bg-gray-50"
            />
          </div>

          {validationResult.json_ld && (
            <div className="card bg-gradient-to-br from-blue-50 to-indigo-50">
              <button
                onClick={() => downloadFile(validationResult.json_ld, 'dataGraph.jsonld')}
                className="btn-primary"
              >
                📥 Download JSON-LD
              </button>
            </div>
          )}

          {validationResult.report_details && validationResult.report_details.length > 0 && (
            <div className="card">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Detailed SHACL Report</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validationResult.report_details.map((item: any, index: number) => (
                  <div key={index} className="bg-blue-50 border-l-4 border-primary-500 p-4 rounded-r-lg hover:bg-blue-100 transition-colors">
                    <p className="mb-2"><strong className="text-gray-700">Subject:</strong> <code className="bg-white px-2 py-1 rounded text-sm">{item.subject}</code></p>
                    <p className="mb-2"><strong className="text-gray-700">Predicate:</strong> <code className="bg-white px-2 py-1 rounded text-sm">{item.predicate}</code></p>
                    <p><strong className="text-gray-700">Object:</strong> <code className="bg-white px-2 py-1 rounded text-sm">{item.object}</code></p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
