'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

const SETTING_DEFS = [
  { key: 'delivery_fee', label: 'Default Delivery Fee (₹)', type: 'number', default: '60' },
  { key: 'free_delivery_threshold', label: 'Free Delivery Above (₹)', type: 'number', default: '500' },
  { key: 'platform_commission_pct', label: 'Platform Commission (%)', type: 'number', default: '5' },
  { key: 'return_window_hours', label: 'Return Window (hours)', type: 'number', default: '24' },
  { key: 'low_stock_threshold', label: 'Low Stock Alert Threshold', type: 'number', default: '5' },
]

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(SETTING_DEFS.map(s => [s.key, s.default]))
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/admin/settings`)
        const json = await res.json()
        if (json.success && json.data) {
          setValues(prev => {
            const merged = { ...prev }
            for (const key of Object.keys(json.data)) {
              if (merged[key] !== undefined) merged[key] = String(json.data[key])
            }
            return merged
          })
        }
      } catch {
        // Service unavailable — use defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const body: Record<string, number | string> = {}
      for (const def of SETTING_DEFS) {
        body[def.key] = def.type === 'number' ? parseFloat(values[def.key]) : values[def.key]
      }

      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Platform Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 bg-orange-500 text-white font-bold rounded-full hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-600">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {SETTING_DEFS.map(s => (
          <div key={s.key} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="font-semibold text-gray-900 text-sm">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.key}</p>
            </div>
            {loading ? (
              <div className="w-28 h-8 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <input
                type={s.type}
                value={values[s.key]}
                onChange={e => setValues(prev => ({ ...prev, [s.key]: e.target.value }))}
                className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right font-semibold focus:outline-none focus:border-orange-400"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-red-600 text-sm">Maintenance Mode</p>
            <p className="text-xs text-gray-400 mt-0.5">Disable all buyer-facing features</p>
          </div>
          <button
            onClick={() => {
              if (confirm('Enable maintenance mode? All buyer traffic will be blocked.')) {
                // TODO: POST /api/admin/settings with maintenance_mode: true
                alert('Maintenance mode toggle — connect to admin-service when deployed.')
              }
            }}
            className="px-4 py-2 border border-red-300 text-red-600 font-semibold rounded-lg text-sm hover:bg-red-50"
          >
            Enable Maintenance
          </button>
        </div>
      </div>
    </div>
  )
}
