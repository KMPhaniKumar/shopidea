import Image from 'next/image'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <Image src="/logo.png" alt="ReelMart" width={280} height={100} className="object-contain" />
    </main>
  )
}
