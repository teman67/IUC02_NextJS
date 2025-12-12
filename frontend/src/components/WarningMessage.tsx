'use client'

import { useState } from 'react'

export default function WarningMessage() {
  const [isVisible, setIsVisible] = useState(false)

  if (!isVisible) return null

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-400 p-5 rounded-xl mb-8 mt-8 flex justify-between items-center shadow-soft animate-slide-up">
      <div className="flex items-center">
        <span className="text-3xl mr-4">💡</span>
        <p className="text-base text-gray-800">
          <strong>Pro Tip:</strong> For better visualization, it is recommended to use Light mode instead of Dark mode in Settings.
        </p>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="text-gray-500 hover:text-gray-800 hover:bg-gray-200 ml-4 px-3 py-1 rounded-lg transition-all duration-200 hover:scale-110"
        aria-label="Close warning"
      >
        ✕
      </button>
    </div>
  )
}
