'use client'

import { useState } from 'react'

export default function WarningMessage() {
  const [isVisible, setIsVisible] = useState(false)

  if (!isVisible) return null

  return (
    <div className="warning-banner bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-l-4 border-amber-400 p-6 rounded-2xl mb-10 mt-8 flex justify-between items-center shadow-medium hover:shadow-hard transition-all duration-500 animate-slide-down">
      <div className="flex items-center">
        <span className="text-4xl mr-5 animate-pulse-subtle">💡</span>
        <p className="text-lg text-gray-800">
          <strong className="text-amber-700 font-bold">Pro Tip:</strong> For better visualization, it is recommended to use Light mode instead of Dark mode in Settings.
        </p>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="text-gray-500 hover:text-gray-800 hover:bg-amber-200/50 ml-6 px-4 py-2 rounded-xl transition-all duration-300 hover:scale-110 hover:rotate-90 font-bold text-xl backdrop-blur-sm"
        aria-label="Close warning"
      >
        ✕
      </button>
    </div>
  )
}
