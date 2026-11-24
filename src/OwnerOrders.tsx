import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type Cafe = { id: string; name: string }
type Branch = { id: string; name: string }
type OrderItem = {
  id: string
  item_name_snapshot: string
  quantity: number
  unit_price_paise: number
  line_total_paise: number
}
type Order = {
  id: string
  order_number: number
  order_type: string
  status: string
  notes: string | null
  subtotal_paise: number
  tax_paise: number
  total_paise: number
  created_at: string
  table_id: string | null
  order_items: OrderItem[]
}
const statuses = ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled']
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function OwnerOrders({ cafes }: { cafes: Cafe[] }) {
  const [cafeId, setCafeId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [liveMessage, setLiveMessage] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => typeof Notification === 'undefined' ? 'denied' : Notification.permission)
  const knownOrderIds = useRef<Set<string>>(new Set())
  const hasInitialOrders = useRef(false)

  useEffect(() => {
    if (!cafeId || !supabase) {
      setBranches([])
      setBranchId('')
      setOrders([])
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await supabase.from('branches')
        .select('id,name').eq('cafe_id', cafeId).eq('active', true).order('created_at')
      if (!active) return
      if (error) { setMessage(error.message); setBranches([]); setBranchId(''); return }
      const rows = (data || []) as Branch[]
      setBranches(rows)
      setBranchId(current => rows.some(row => row.id === current) ? current : (rows[0]?.id || ''))
    })()
    return () => { active = false }
  }, [cafeId])

  useEffect(() => {
    if (!cafeId || !branchId || !supabase) {
      setOrders([])
      knownOrderIds.current = new Set()
      hasInitialOrders.current = false
      return
    }
    hasInitialOrders.current = false
    knownOrderIds.current = new Set()
    void loadOrders(false)
    const channel = supabase.channel(`owner-orders-${cafeId}-${branchId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `cafe_id=eq.${cafeId}`
      }, payload => {
        const incoming = payload.new as { id?: string; branch_id?: string; order_number?: number }
        if (incoming.branch_id !== branchId || !incoming.id || knownOrderIds.current.has(incoming.id)) return
        knownOrderIds.current.add(incoming.id)
        const notice = `New order #${incoming.order_number ?? ''} received`
        setLiveMessage(notice)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('BrewOS — New order', { body: notice })
        }
        void loadOrders(false)
      })
      .subscribe()
    const poll = window.setInterval(() => void loadOrders(true), 15000)
    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [cafeId, branchId])

  async function loadOrders(notifyNew = false) {
    if (!supabase || !cafeId || !branchId) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.from('orders')
      .select('id,order_number,order_type,status,notes,subtotal_paise,tax_paise,total_paise,created_at,table_id,order_items(id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)')
      .eq('cafe_id', cafeId).eq('branch_id', branchId)
      .order('created_at', { ascending: false }).limit(50)
    setLoading(false)
    if (error) { setMessage(error.message); return }
    const rows = (data || []) as unknown as Order[]
    const currentIds = new Set(rows.map(row => row.id))
    if (hasInitialOrders.current && notifyNew) {
      const newOrders = rows.filter(row => !knownOrderIds.current.has(row.id))
      if (newOrders.length) {
        const newest = newOrders[0]
        const notice = `New order #${newest.order_number} received`
        setLiveMessage(notice)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('BrewOS — New order', { body: notice })
        }
      }
    }
    knownOrderIds.current = currentIds
    hasInitialOrders.current = true
    setOrders(rows)
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setMessage('Browser notifications are not supported on this device.')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') setLiveMessage('Notifications are enabled on this device.')
    else setMessage('Notifications were not enabled. New orders will still appear in this dashboard.')
  }

  async function updateStatus(order: Order, status: string) {
    if (!supabase) return
    setBusyId(order.id)
    setMessage('')
    const { error } = await supabase.from('orders').update({ status })
      .eq('id', order.id).eq('cafe_id', cafeId)
    setBusyId('')
    if (error) { setMessage(error.message); return }
    setOrders(current => current.map(row => row.id === order.id ? { ...row, status } : row))
  }

  return <section style={{ borderTop: '1px solid #eee9df', paddingTop: 18, marginTop: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div><h3 style={{ fontSize: 16, margin: 0 }}>Incoming orders</h3><p style={{ fontSize: 12, color: '#78716c', margin: '5px 0 12px' }}>Review guest orders and update their progress.</p></div>
      <button type="button" className="outline-btn" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => void loadOrders(false)} disabled={loading || !branchId}>Refresh</button>
    </div>
    <label style={{ display: 'block', fontSize: 12 }}>Restaurant
      <select value={cafeId} onChange={event => setCafeId(event.target.value)} style={{ display: 'block', width: '100%', padding: 11, border: '1px solid #d6d3d1', borderRadius: 9, marginTop: 5, background: '#fff' }}>
        <option value="">Choose restaurant</option>{cafes.map(cafe => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}
      </select>
    </label>
    {cafeId && <label style={{ display: 'block', fontSize: 12, marginTop: 10 }}>Branch
      <select value={branchId} onChange={event => setBranchId(event.target.value)} style={{ display: 'block', width: '100%', padding: 11, border: '1px solid #d6d3d1', borderRadius: 9, marginTop: 5, background: '#fff' }}>
        {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
    </label>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <button type="button" className="outline-btn" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => void enableNotifications()} disabled={notificationPermission === 'granted' || typeof Notification === 'undefined'}>
        {notificationPermission === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
      </button>
      <span style={{ fontSize: 11, color: '#78716c' }}>
        {typeof Notification === 'undefined' ? 'Browser notifications unavailable' : notificationPermission === 'granted' ? 'This device can show new-order alerts' : 'Optional browser alerts'}
      </span>
    </div>
    {liveMessage && <p role="status" style={{ fontSize: 12, color: '#047857', background: '#ecfdf5', borderRadius: 8, padding: 10, marginTop: 10 }}>{liveMessage}</p>}
    {loading && <p role="status" style={{ fontSize: 12, color: '#78716c' }}>Loading orders…</p>}
    {!loading && cafeId && branchId && orders.length === 0 && <p style={{ fontSize: 12, color: '#78716c' }}>No orders yet for this branch. New guest orders will appear here after refresh.</p>}
    <div style={{ display: 'grid', gap: 11, marginTop: 12 }}>
      {orders.map(order => <article key={order.id} style={{ border: '1px solid #e7e5e4', borderRadius: 12, padding: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <b>Order #{order.order_number}</b>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: order.status === 'cancelled' ? '#b91c1c' : order.status === 'completed' ? '#047857' : '#a16207' }}>{order.status}</span>
        </div>
        <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>{new Date(order.created_at).toLocaleString('en-IN')} · {order.order_type.replace('_', ' ')}</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 11 }}>
          {(order.order_items || []).map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span>{item.item_name_snapshot} × {item.quantity}</span><b>{money(item.line_total_paise)}</b>
          </div>)}
        </div>
        {order.notes && <p style={{ fontSize: 12, background: '#fafaf9', borderRadius: 8, padding: 9, margin: '10px 0' }}>Note: {order.notes}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee9df', paddingTop: 9, marginTop: 9, fontSize: 13 }}>
          <b>Total</b><b>{money(order.total_paise)}</b>
        </div>
        <label style={{ display: 'block', fontSize: 11, marginTop: 10 }}>Update status
          <select value={order.status} onChange={event => void updateStatus(order, event.target.value)} disabled={busyId === order.id} style={{ display: 'block', width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8, marginTop: 5, background: '#fff' }}>
            {statuses.map(status => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
          </select>
        </label>
        {busyId === order.id && <small role="status">Saving status…</small>}
      </article>)}
    </div>
    {message && <p role="alert" style={{ fontSize: 12, color: '#b91c1c', overflowWrap: 'anywhere' }}>{message}</p>}
  </section>
}
