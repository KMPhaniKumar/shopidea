'use client'

// Horizontal widget that BOTH auto-scrolls (marquee-style, seamless via a
// duplicated row) and supports manual control: native swipe/trackpad scroll +
// hover arrow buttons. Auto-scroll pauses while the user interacts and resumes
// shortly after. Respects prefers-reduced-motion (no auto-scroll).
import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Scroller<T>({
  items,
  render,
  speed = 0.4,
}: {
  items: T[]
  render: (item: T, index: number) => ReactNode
  speed?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let raf = 0
    const step = () => {
      if (!paused.current && el.scrollWidth > el.clientWidth) {
        const half = el.scrollWidth / 2
        el.scrollLeft += speed
        if (el.scrollLeft >= half) el.scrollLeft -= half
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [speed, items.length])

  const pause = () => {
    paused.current = true
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
  }
  const resumeSoon = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => { paused.current = false }, 1500)
  }

  const nudge = (dir: number) => {
    const el = ref.current
    if (!el) return
    pause()
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 400), behavior: 'smooth' })
    resumeSoon()
  }

  if (items.length === 0) return null
  // Duplicate so the auto-scroll loops seamlessly; manual scroll wraps too.
  const row = [...items, ...items]

  return (
    <div className="relative group">
      <style>{`.rm-scroll::-webkit-scrollbar{display:none}.rm-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div
        ref={ref}
        onMouseEnter={pause}
        onMouseLeave={resumeSoon}
        onTouchStart={pause}
        onTouchEnd={resumeSoon}
        onWheel={() => { pause(); resumeSoon() }}
        className="rm-scroll flex gap-4 overflow-x-auto py-1"
      >
        {row.map((it, i) => (
          <div key={i} className="shrink-0">{render(it, i)}</div>
        ))}
      </div>

      <button
        onClick={() => nudge(-1)}
        aria-label="Scroll left"
        className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-hover border border-border items-center justify-center text-text opacity-0 group-hover:opacity-100 transition hover:bg-surface"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => nudge(1)}
        aria-label="Scroll right"
        className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-hover border border-border items-center justify-center text-text opacity-0 group-hover:opacity-100 transition hover:bg-surface"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
