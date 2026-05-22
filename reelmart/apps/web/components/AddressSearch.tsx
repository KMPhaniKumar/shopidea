'use client'

// Google Places autocomplete box. On selecting a result it calls `onPick`
// with the resolved area/city/state/pincode so the parent can fill its own
// address fields. Reuses the same Places helpers the buyer checkout uses.
import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { searchPlaces, fetchPlaceDetails, type PlacePrediction, type PlaceDetails } from '@/lib/saved-addresses'

export function AddressSearch({
  onPick,
  placeholder = 'Search your shop location',
}: {
  onPick: (details: PlaceDetails) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setPredictions([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      setPredictions(await searchPlaces(query))
      setSearching(false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function pick(p: PlacePrediction) {
    const details = await fetchPlaceDetails(p.place_id)
    onPick(details)
    setQuery('')
    setPredictions([])
  }

  return (
    <div className="relative">
      <div className="flex items-center border border-[#E5E5E5] rounded-xl overflow-hidden focus-within:border-[#FF6B2B] transition-colors">
        <Search size={14} className="text-[#AAAAAA] ml-3 shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-2.5 py-3 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
        />
        {searching && <Loader2 className="animate-spin text-[#AAAAAA] mr-3 shrink-0" size={14} />}
      </div>
      {predictions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E5E5E5] rounded-xl shadow-lg max-h-60 overflow-auto">
          {predictions.map(p => (
            <li key={p.place_id}>
              <button type="button" onClick={() => pick(p)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-[#F0F0F0] last:border-0">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{p.main_text}</p>
                <p className="text-xs text-[#888888] truncate">{p.secondary_text}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[#AAAAAA] mt-1">Pick a result to auto-fill area, city, state and pincode.</p>
    </div>
  )
}
