'use client'

import { useState } from 'react'
import Image from 'next/image'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function DataGenerationPage() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [loading, setLoading] = useState(false)

  const fileOptions: Record<string, string> = {
    'Vh5205_C-95.LIS': 'Creep Experiment Input File',
    'Vh5205_C-95_translated.json': 'Populated Metadata Schema',
    'rdfGraph_smallExample.ttl': 'Populated Data Graph',
    'shaclShape_smallExample.ttl': 'Shape Graph',
    'mapping document.json': 'Mapping Document',
    '2024-09_Schema_IUC02_v1.json': 'Metadata Schema'
  }

  const loadFile = async (filename: string) => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/files/${filename}`)
      setFileContent(response.data.content)
      setSelectedFile(filename)
    } catch (error) {
      console.error('Error loading file:', error)
      alert('Failed to load file')
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
      <h2 className="section-title mb-6">Data Generation Workflow</h2>

      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 mb-8">
        <div className="space-y-4 text-gray-700">
          <p className="text-lg">
            The <strong className="text-primary-700">Data Generation Workflow</strong> represents how you can prepare the resources needed to validate your Data Graph.
          </p>

          <div className="space-y-3 bg-white p-4 rounded-lg shadow-soft">
            <div className="flex items-start gap-3">
              <span className="bg-primary-500 text-white font-bold px-3 py-1 rounded-full text-sm">1</span>
              <p><strong>Download your data</strong> from the repository. The demonstrator shows the <em>Creep Experiment Input File</em>, downloaded from <a href="https://zenodo.org/records/13937987" target="_blank" className="text-primary-600 hover:text-primary-800 underline font-semibold">Zenodo</a>.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="bg-primary-500 text-white font-bold px-3 py-1 rounded-full text-sm">2</span>
              <div>
                <p className="mb-2"><strong>Populate the JSON Metadata Schema</strong> with data from your Input file. This step requires:</p>
                <ul className="list-disc pl-8 space-y-1 text-sm">
                  <li>A <strong>JSON Metadata Schema</strong></li>
                  <li>A <strong>Mapping Document</strong> to correctly parse the Input data.</li>
                </ul>
                <p className="mt-2 text-sm">The Metadata Schema can be accessed in the <a href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02/-/tree/main/Data%20Schema" target="_blank" className="text-primary-600 hover:text-primary-800 underline font-semibold">Git Repository</a>.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="bg-primary-500 text-white font-bold px-3 py-1 rounded-full text-sm">3</span>
              <div>
                <p className="mb-2"><strong>Generate the Populated Data Graph (RDF-Graph)</strong> from the Populated Metadata Schema using Ontology entities.</p>
                <ul className="list-disc pl-8 text-sm">
                  <li>This step requires an <strong>Ontology</strong>, which can be accessed in the same <a href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02/-/tree/main/Ontology%20Development" target="_blank" className="text-primary-600 hover:text-primary-800 underline font-semibold">Git Repository</a>.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="bg-primary-500 text-white font-bold px-3 py-1 rounded-full text-sm">4</span>
              <div>
                <p className="mb-2"><strong>Validate the Data Graph</strong> against predefined <strong>SHACL Shapes</strong> to ensure:</p>
                <ul className="list-disc pl-8 space-y-1 text-sm">
                  <li>Mandatory fields are present.</li>
                  <li>The data follows a specific datatype.</li>
                </ul>
                <p className="mt-2 text-sm">The SHACL Shapes can be accessed in the <a href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02/-/tree/main/Data%20Validation" target="_blank" className="text-primary-600 hover:text-primary-800 underline font-semibold">Git Repository</a>.</p>
              </div>
            </div>
          </div>

          <p className="text-lg font-semibold text-primary-800">
            The <strong>output of the Validation Process</strong> is the <strong>Validation Protocol</strong>.
          </p>
        </div>
      </div>

      {/* Workflow Diagram */}
      <div className="card mb-8">
        <h3 className="text-2xl font-bold mb-6 text-gray-900">Workflow Steps</h3>
        
        {/* Additional Resource Boxes */}
        <div className="flex justify-center gap-4 mb-6 flex-wrap">
          <div className="bg-gradient-to-br from-dark-600 to-dark-700 text-white p-4 rounded-xl w-64 shadow-medium hover:shadow-hard transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-2">
              <strong>Mapping</strong>
              <Image src="https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png" alt="GitLab" width={40} height={40} />
            </div>
            <ul className="text-sm text-left list-disc pl-4 space-y-1">
              <li>Metadata Schema</li>
              <li>Mapping Document</li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 rounded-xl w-48 flex items-center justify-center shadow-medium hover:shadow-hard transition-all hover:-translate-y-1">
            <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTm8U7AGVOvLM-YbLe8fGD8cfqXmXQSY7umTQ&s" alt="RDF" width={40} height={40} className="mr-2" />
            <strong>Ontology (Graph)</strong>
          </div>

          <div className="bg-gradient-to-br from-dark-600 to-dark-700 text-white p-4 rounded-xl w-48 flex items-center justify-center shadow-medium hover:shadow-hard transition-all hover:-translate-y-1">
            <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUjbiGuDUs4poajSf5Uw-ePPQFlvaPiyNX7Q&s" alt="SHACL" width={40} height={40} className="mr-2" />
            <strong>SHACL Shapes</strong>
          </div>
        </div>

        {/* Main Workflow */}
        <div className="flex justify-center items-center gap-4 flex-wrap">
          <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-4 rounded-xl w-52 text-center border-2 border-blue-300 shadow-soft hover:shadow-medium transition-all">
            <Image src="https://static.thenounproject.com/png/2952643-200.png" alt="Input" width={40} height={40} className="mx-auto mb-2" />
            <strong className="text-gray-800">Creep experiment input file (.lis file)</strong>
          </div>

          <div className="text-4xl font-bold text-primary-600 animate-bounce-subtle">→</div>

          <div className="bg-gradient-to-br from-blue-200 to-blue-300 p-4 rounded-xl w-52 text-center border-2 border-blue-400 shadow-soft hover:shadow-medium transition-all">
            <Image src="https://res.cloudinary.com/dlthn5m1i/image/upload/v1742823071/JSON_schema_xlril2.png" alt="JSON" width={80} height={30} className="mx-auto mb-2" />
            <strong className="text-gray-800">Populated metadata schema</strong>
          </div>

          <div className="text-4xl font-bold text-primary-600 animate-bounce-subtle">→</div>

          <div className="bg-gradient-to-br from-blue-300 to-blue-400 p-4 rounded-xl w-52 text-center border-2 border-blue-500 shadow-soft hover:shadow-medium transition-all">
            <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTm8U7AGVOvLM-YbLe8fGD8cfqXmXQSY7umTQ&s" alt="RDF" width={40} height={40} className="mx-auto mb-2" />
            <strong className="text-gray-800">Populated Data Graph</strong>
          </div>

          <div className="text-4xl font-bold text-primary-600 animate-bounce-subtle">→</div>

          <div className="bg-gradient-to-br from-blue-400 to-blue-500 p-4 rounded-xl w-52 text-center border-2 border-blue-600 shadow-soft hover:shadow-medium transition-all">
            <Image src="https://cdn-icons-png.freepik.com/512/5531/5531412.png" alt="Validation" width={60} height={60} className="mx-auto mb-2" />
            <strong className="text-white">Validation Protocol</strong>
          </div>
        </div>
      </div>

      {/* File Viewer/Editor */}
      <div className="card">
        <h3 className="text-2xl font-bold mb-4 text-gray-900">Show and Edit Files</h3>
        
        <div className="mb-4">
          <label className="block mb-2 font-semibold text-gray-700">Choose a file:</label>
          <select
            onChange={(e) => loadFile(e.target.value)}
            className="input-field"
            defaultValue=""
            disabled={loading}
          >
            <option value="" disabled>Select a file...</option>
            {Object.entries(fileOptions).map(([filename, label]) => (
              <option key={filename} value={filename}>
                {label}
              </option>
            ))}
          </select>
          {loading && (
            <div className="mt-3 flex items-center gap-2 text-primary-600">
              <span className="animate-spin text-xl">⏳</span>
              <span className="font-semibold">Loading file...</span>
            </div>
          )}
        </div>

        {selectedFile && fileContent && (
          <div className="space-y-4 mt-6">
            <div>
              <label className="block mb-2 font-semibold text-gray-700">Edit File Content:</label>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="input-field h-96 font-mono text-sm"
              />
            </div>

            <button
              onClick={() => downloadFile(fileContent, selectedFile)}
              className="btn-primary"
            >
              📥 Download Edited File
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-amber-400 p-6 rounded-xl shadow-soft">
        <p className="text-lg flex items-center gap-3">
          <span className="text-3xl">➡️</span>
          <span>
            <strong>Next Step:</strong> Please continue with the <a href="/data-validation" className="text-primary-700 hover:text-primary-900 underline font-bold">Data Validation Workflow</a> to see more details on the SHACL Shapes and the Protocol.
          </span>
        </p>
      </div>
    </div>
  )
}
