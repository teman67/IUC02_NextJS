'use client'

import Image from 'next/image'

export default function BackgroundLogo() {
  return (
    <div 
      className="fixed bottom-8 right-8 pointer-events-none z-0"
      style={{ opacity: 0.3 }}
    >
      <Image
        src="/images/Nfdi_Matwer_logo.png"
        alt="NFDI MatWerk Logo"
        width={200}
        height={200}
        className="object-contain"
      />
    </div>
  )
}
