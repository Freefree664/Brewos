import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Cafe = { id: string; name: string }

export default function OwnerPaymentSettings({ cafes }: { cafes: Cafe[] }) {
  const [cafeId, setCafeId] = useState(cafes[0]?.id || '')
  const [upiId, setUpiId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!cafeId || !supabase) {
      setUpiId('')
      return
    }
    let active = true
    void supabase.from('cafes').select('upi_id').eq('id', cafeId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setMessage('Could not load payment settings: ' + error.message)
          return
        }
        setUpiId(data?.upi_id || '')
      })
    return () => { active = false }
  }, [cafeId])

  async function save() {
    if (busy) return
    if (!supabase) {
      setMessage('Database connection is unavailable. Please reload and sign in again.')
      return
    }
    if (!cafeId) {
      setMessage('Please select a restaurant first.')
      return
    }
    const value = upiId.trim()
    if (value && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(value)) {
      setMessage('Enter a valid UPI ID, for example name@bank.')
      return
    }

    setBusy(true)
    setMessage('Saving UPI ID…')
    try {
      const { data, error } = await supabase.from('cafes')
        .update({ upi_id: value || null })
        .eq('id', cafeId)
        .select('id')
      if (error) throw error
      if (!data?.length) {
        setMessage('Nothing was updated. Check that this account has owner access to the selected restaurant.')
      } else {
        setMessage('UPI details saved successfully. Customer payment QR codes can now use this café account.')
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setMessage('Save failed: ' + detail)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ border: '1px solid #e7e5e4', borderRadius: 14, padding: 16, marginTop: 20, background: '#fff' }}>
      <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>Restaurant payment settings</h3>
      <p style={{ fontSize: 12, color: '#78716c', margin: '0 0 12px' }}>Add the UPI ID where this restaurant should receive customer payments. Each restaurant has its own UPI ID.</p>
      <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>
        Restaurant
        <select value={cafeId} onChange={e => { setCafeId(e.target.value); setMessage('') }} style={{ padding: 11, border: '1px solid #d6d3d1', borderRadius: 9, background: '#fff' }}>
          {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 5, fontSize: 12, marginTop: 10 }}>
        UPI ID
        <input value={upiId} onChange={e => setUpiId(e.target.value)} maxLength={100} placeholder="yourname@bank" autoComplete="off" style={{ padding: 11, border: '1px solid #d6d3d1', borderRadius: 9 }} />
      </label>
      <button type="button" disabled={!cafeId || busy} onClick={save} style={{ display: 'flex', width: '100%', minHeight: 46, marginTop: 12, alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 10, background: busy ? '#64748b' : '#047857', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
        {busy ? 'Saving…' : 'Save UPI ID'}
      </button>
      {message && <p role="status" aria-live="polite" style={{ fontSize: 12, margin: '9px 0 0', overflowWrap: 'anywhere', color: message.includes('successfully') ? '#047857' : message.startsWith('Saving') ? '#475569' : '#b91c1c' }}>{message}</p>}
    </section>
  )
}
