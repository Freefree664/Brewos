import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, RefreshCw, Search, ShoppingCart, Trash2, ReceiptText } from 'lucide-react'
import { supabase } from './lib/supabase'
import { QRCodeSVG } from 'qrcode.react'

type Cafe = { id: string; name: string }
type Branch = { id: string; name: string }
type MenuItem = {
  id: string
  name: string
  description: string | null
  price_paise: number
  category_id: string | null
  branch_id: string | null
}
type CartLine = { item: MenuItem; quantity: number }
type CreatedBill = { order_id: string; order_number: number; subtotal_paise: number; discount_paise: number; total_paise: number; lines: CartLine[] }

const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function createBillImage(options: { restaurant: string; orderNumber: number; lines: CartLine[]; subtotal: number; discount: number; total: number; paid: number; due: number }) {
  const width = 900
  const rowHeight = 62
  const height = 720 + options.lines.length * rowHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the bill image.')
  ctx.fillStyle = '#f5f3ed'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#064e3b'; ctx.fillRect(0, 0, width, 190)
  ctx.fillStyle = '#a7f3d0'; ctx.font = '700 25px Arial'; ctx.fillText('RIVANTOQ  ·  EVERY SERVICE. ONE SYSTEM.', 58, 58)
  ctx.fillStyle = '#ffffff'; ctx.font = '700 46px Arial'; ctx.fillText(options.restaurant.slice(0, 30), 58, 119)
  ctx.font = '24px Arial'; ctx.fillStyle = '#d1fae5'; ctx.fillText('RECEIPT  #' + options.orderNumber, 58, 160)
  let y = 245
  ctx.fillStyle = '#292524'; ctx.font = '700 22px Arial'; ctx.fillText('ITEM', 58, y); ctx.textAlign = 'right'; ctx.fillText('AMOUNT', 840, y); ctx.textAlign = 'left'
  y += 22; ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(58,y); ctx.lineTo(842,y); ctx.stroke()
  y += 48
  for (const line of options.lines) {
    ctx.fillStyle = '#292524'; ctx.font = '600 22px Arial'; ctx.fillText(line.item.name.slice(0, 42), 58, y)
    ctx.fillStyle = '#78716c'; ctx.font = '18px Arial'; ctx.fillText('Qty ' + line.quantity + '  ×  ' + money(line.item.price_paise), 58, y + 27)
    ctx.textAlign = 'right'; ctx.fillStyle = '#292524'; ctx.font = '700 22px Arial'; ctx.fillText(money(line.item.price_paise * line.quantity), 840, y + 8); ctx.textAlign = 'left'
    y += rowHeight
  }
  y += 8; ctx.strokeStyle = '#d6d3d1'; ctx.beginPath(); ctx.moveTo(58,y); ctx.lineTo(842,y); ctx.stroke(); y += 45
  const totalRow = (label: string, value: string, bold = false) => { ctx.fillStyle = '#57534e'; ctx.font = (bold ? '700 27px Arial' : '21px Arial'); ctx.fillText(label, 58, y); ctx.textAlign = 'right'; ctx.fillStyle = bold ? '#047857' : '#292524'; ctx.fillText(value, 840, y); ctx.textAlign = 'left'; y += bold ? 48 : 38 }
  totalRow('Subtotal', money(options.subtotal)); totalRow('Discount', '−' + money(options.discount)); totalRow('TOTAL', money(options.total), true)
  totalRow('Paid', money(options.paid)); totalRow('Balance due', money(options.due), true)
  y += 10; ctx.fillStyle = '#064e3b'; ctx.fillRect(0, y, width, height-y)
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 25px Arial'; ctx.fillText(options.due === 0 ? 'PAID IN FULL' : 'THANK YOU FOR VISITING!', width/2, y+48)
  ctx.font = '18px Arial'; ctx.fillStyle = '#d1fae5'; ctx.fillText('Please keep this receipt for your records.', width/2, y+82)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the bill image.')), 'image/png'))
}

export default function OwnerPOS({ cafes }: { cafes: Cafe[] }) {
  const [cafeId, setCafeId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [items, setItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('takeaway')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [upiId, setUpiId] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paidPaise, setPaidPaise] = useState(0)
  const [duePaise, setDuePaise] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [bill, setBill] = useState<CreatedBill | null>(null)

  useEffect(() => {
    if (!cafeId && cafes.length) setCafeId(cafes[0].id)
  }, [cafes, cafeId])

  useEffect(() => {
    if (!supabase || !cafeId) { setUpiId(''); return }
    let active = true
    void supabase.from('cafes').select('upi_id').eq('id', cafeId).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) { setMessage(error.message); return }
      setUpiId(data?.upi_id || '')
    })
    return () => { active = false }
  }, [cafeId])

  useEffect(() => {
    if (!cafeId || !supabase) {
      setBranches([])
      setBranchId('')
      setItems([])
      setCart([])
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await supabase!.from('branches')
        .select('id,name').eq('cafe_id', cafeId).eq('active', true).order('created_at')
      if (!active) return
      if (error) { setMessage(error.message); return }
      const rows = (data || []) as Branch[]
      setBranches(rows)
      setBranchId(rows[0]?.id || '')
      setCart([])
    })()
    return () => { active = false }
  }, [cafeId])

  useEffect(() => {
    if (!supabase || !cafeId || !branchId) {
      setItems([])
      return
    }
    void loadMenu()
  }, [cafeId, branchId])

  async function loadMenu() {
    if (!supabase || !cafeId || !branchId) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.from('menu_items')
      .select('id,name,description,price_paise,category_id,branch_id')
      .eq('cafe_id', cafeId).eq('is_available', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .order('sort_order').order('name')
    setLoading(false)
    if (error) { setMessage(error.message); return }
    setItems((data || []) as MenuItem[])
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? items.filter(item => item.name.toLowerCase().includes(term) || (item.description || '').toLowerCase().includes(term)) : items
  }, [items, search])
  const subtotal = cart.reduce((sum, line) => sum + line.item.price_paise * line.quantity, 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const discountPaise = Math.max(0, Math.round(Number(discount || 0) * 100))
  const total = Math.max(0, subtotal - discountPaise)

  function addItem(item: MenuItem) {
    setBill(null)
    setCart(current => {
      const existing = current.find(line => line.item.id === item.id)
      if (existing) return current.map(line => line.item.id === item.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line)
      return [...current, { item, quantity: 1 }]
    })
  }
  function changeQuantity(itemId: string, delta: number) {
    setBill(null)
    setCart(current => current.flatMap(line => {
      if (line.item.id !== itemId) return [line]
      const quantity = line.quantity + delta
      return quantity > 0 ? [{ ...line, quantity }] : []
    }))
  }

  async function createBill() {
    if (!supabase || !cafeId || !branchId || !cart.length || saving) return
    setSaving(true)
    setMessage('')
    setBill(null)
    const { data, error } = await supabase.rpc('create_pos_order_v2', {
      p_cafe_id: cafeId,
      p_branch_id: branchId,
      p_order_type: orderType,
      p_customer_name: customerName.trim() || null,
      p_notes: notes.trim() || null,
      p_items: cart.map(line => ({ menu_item_id: line.item.id, quantity: line.quantity })),
      p_discount_paise: discountPaise,
      p_customer_phone: customerPhone.trim() || null
    })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    const created = Array.isArray(data) ? data[0] : data
    if (!created?.order_number) { setMessage('The bill was not confirmed. Refresh incoming orders before retrying.'); return }
    setBill({ order_id: created.order_id, order_number: Number(created.order_number), subtotal_paise: Number(created.subtotal_paise), discount_paise: Number(created.discount_paise), total_paise: Number(created.total_paise), lines: cart.map(line => ({ item: line.item, quantity: line.quantity })) })
    setPaidPaise(0)
    setDuePaise(Number(created.total_paise))
    setPaymentAmount((Number(created.total_paise) / 100).toFixed(2))
    setCart([])
    setCustomerName('')
    setNotes('')
    setDiscount('0')
  }

  async function recordPayment() {
    if (!supabase || !bill || paymentSaving) return
    const amount = Math.round(Number(paymentAmount) * 100)
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Enter a valid payment amount.'); return }
    setPaymentSaving(true)
    setMessage('')
    const { data, error } = await supabase.rpc('record_pos_payment', { p_order_id: bill.order_id, p_method: paymentMethod, p_amount_paise: amount, p_reference: paymentReference.trim() || null })
    setPaymentSaving(false)
    if (error) { setMessage(error.message); return }
    const result = Array.isArray(data) ? data[0] : data
    setPaidPaise(Number(result.paid_paise))
    setDuePaise(Number(result.due_paise))
    setPaymentAmount((Number(result.due_paise) / 100).toFixed(2))
    setPaymentReference('')
  }

  return <section style={{ borderTop: '1px solid #eee9df', paddingTop: 20, marginTop: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div><h3 style={{ fontSize: 16, margin: 0 }}>POS · Counter billing</h3><p style={{ fontSize: 12, color: '#78716c', margin: '5px 0 12px' }}>Build a cashier order from your live menu. Saved bills appear in Incoming orders.</p></div>
      <button type="button" className="outline-btn" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => void loadMenu()} disabled={loading || !branchId}><RefreshCw size={14}/> Refresh menu</button>
    </div>
    {!cafes.length && <p style={{ fontSize: 12, color: '#78716c' }}>An approved restaurant is required to use POS.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Restaurant
        <select value={cafeId} onChange={e => { setCafeId(e.target.value); setCart([]); setBill(null) }} style={{ width: '100%', padding: 11, border: '1px solid #d6d3d1', borderRadius: 9, background: '#fff' }}>
          {cafes.map(cafe => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 5, fontSize: 12 }}>Branch
        <select value={branchId} onChange={e => { setBranchId(e.target.value); setCart([]); setBill(null) }} style={{ width: '100%', padding: 11, border: '1px solid #d6d3d1', borderRadius: 9, background: '#fff' }}>
          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16, marginTop: 15, alignItems: 'start' }}>
      <div>
        <label style={{ position: 'relative', display: 'block', marginBottom: 10 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: '#78716c' }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items…" style={{ width: '100%', padding: '10px 10px 10px 34px', border: '1px solid #d6d3d1', borderRadius: 9 }}/>
        </label>
        {loading && <p role="status" style={{ fontSize: 12, color: '#78716c' }}>Loading menu…</p>}
        {!loading && branchId && !filteredItems.length && <p style={{ fontSize: 12, color: '#78716c' }}>No available menu items found for this branch.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 8 }}>
          {filteredItems.map(item => <button type="button" key={item.id} onClick={() => addItem(item)} style={{ textAlign: 'left', padding: 12, border: '1px solid #e7e5e4', borderRadius: 11, background: '#fff', minHeight: 76 }}>
            <b style={{ display: 'block', fontSize: 12 }}>{item.name}</b>
            <span style={{ display: 'block', color: '#047857', fontWeight: 800, fontSize: 12, marginTop: 7 }}>{money(item.price_paise)}</span>
            <span style={{ display: 'block', color: '#78716c', fontSize: 10, marginTop: 5 }}>＋ Add to bill</span>
          </button>)}
        </div>
      </div>
      <div style={{ border: '1px solid #e7e5e4', borderRadius: 13, padding: 13, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}><ShoppingCart size={16}/> Current bill</b>
          <span style={{ fontSize: 11, color: '#78716c' }}>{itemCount} items</span>
        </div>
        {!cart.length && <p style={{ fontSize: 12, color: '#a8a29e', padding: '15px 0' }}>Choose items from the menu to start a bill.</p>}
        <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
          {cart.map(line => <div key={line.item.id} style={{ borderBottom: '1px solid #f0ece4', paddingBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><b>{line.item.name}</b><b>{money(line.item.price_paise * line.quantity)}</b></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
              <button type="button" aria-label={`Decrease ${line.item.name}`} onClick={() => changeQuantity(line.item.id, -1)} style={{ border: '1px solid #d6d3d1', background: '#fff', borderRadius: 7, width: 28, height: 28 }}><Minus size={13}/></button>
              <span style={{ fontSize: 12, minWidth: 18, textAlign: 'center' }}>{line.quantity}</span>
              <button type="button" aria-label={`Increase ${line.item.name}`} onClick={() => changeQuantity(line.item.id, 1)} style={{ border: '1px solid #d6d3d1', background: '#fff', borderRadius: 7, width: 28, height: 28 }}><Plus size={13}/></button>
              <button type="button" aria-label={`Remove ${line.item.name}`} onClick={() => changeQuantity(line.item.id, -line.quantity)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#b91c1c' }}><Trash2 size={14}/></button>
            </div>
          </div>)}
        </div>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, marginTop: 12 }}>Order type
          <select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)} style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8, background: '#fff' }}>
            <option value="takeaway">Takeaway</option><option value="dine_in">Dine in</option><option value="delivery">Delivery</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, marginTop: 9 }}>Customer name (optional)
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={100} placeholder="Customer name" style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8 }}/>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, marginTop: 9 }}>Customer WhatsApp number (optional)
          <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} maxLength={20} placeholder="+91 98765 43210" style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8 }}/>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 11, marginTop: 9 }}>Order note (optional)
          <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="Special instructions" style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8, resize: 'vertical' }}/>
        </label>
        <div style={{ borderTop: '1px solid #eee9df', marginTop: 13, paddingTop: 12, display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <label style={{ display: 'grid', gap: 5, fontSize: 11 }}>Discount (₹)
            <input type="number" min="0" max={(subtotal / 100).toFixed(2)} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} style={{ width: '100%', padding: 9, border: '1px solid #d6d3d1', borderRadius: 8 }}/>
          </label>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Discount</span><b>−{money(Math.min(discountPaise, subtotal))}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><b>Total</b><b>{money(total)}</b></div>
          <label style={{ display: 'grid', gap: 5, fontSize: 11 }}>Payment mode for this bill
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)} style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8, background: '#fff' }}><option value="cash">Cash</option><option value="upi">UPI · Scan QR</option><option value="card">Card</option></select>
          </label>
          {paymentMethod === 'upi' && <p style={{ fontSize: 10, color: upiId ? '#047857' : '#b91c1c', margin: 0 }}>{upiId ? 'A UPI QR will be added to the bill.' : 'Add this restaurant’s UPI ID in Restaurant payment settings before creating a UPI bill.'}</p>}
        </div>
        <button type="button" className="btn" disabled={!cart.length || saving || !branchId || (paymentMethod === 'upi' && !upiId)} onClick={() => void createBill()} style={{ width: '100%', justifyContent: 'center', marginTop: 13 }}>
          <ReceiptText size={15}/>{saving ? 'Saving bill…' : 'Create bill & send to orders'}
        </button>
        <button type="button" className="outline-btn" disabled={!cart.length || saving} onClick={() => { setCart([]); setBill(null) }} style={{ width: '100%', marginTop: 8 }}>Clear bill</button>
        <p style={{ fontSize: 10, lineHeight: 1.5, color: '#78716c', marginBottom: 0 }}>The selected payment mode is saved with the bill. UPI QR payments must be verified by staff before marking them paid.</p>
      </div>
    </div>
    {bill && <div className="pos-receipt" style={{ marginTop: 12, padding: 14, border: '1px solid #a7f3d0', borderRadius: 10, background: '#ecfdf5', color: '#065f46' }}>
      <b>Rivantoq · RECEIPT #{bill.order_number}</b>
      <div style={{ display: 'grid', gap: 5, margin: '12px 0', fontSize: 12 }}>{bill.lines.map(line => <div key={line.item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{line.item.name} × {line.quantity}</span><b>{money(line.item.price_paise * line.quantity)}</b></div>)}</div>
      <p style={{ fontSize: 12, margin: '5px 0 12px' }}>Subtotal {money(bill.subtotal_paise)} · Discount {money(bill.discount_paise)} · Total {money(bill.total_paise)}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Recorded payments</span><b>{money(paidPaise)}</b></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}><span>Balance due</span><b>{money(duePaise)}</b></div>
      {paymentMethod === 'upi' && upiId && <div style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: 12, marginTop: 12, border: '1px solid #a7f3d0', borderRadius: 12, background: '#fff' }}><b style={{ fontSize: 13 }}>Scan to pay {money(duePaise)}</b><QRCodeSVG value={'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=' + encodeURIComponent(cafes.find(cafe => cafe.id === cafeId)?.name || 'Restaurant') + '&am=' + (duePaise / 100).toFixed(2) + '&cu=INR&tn=' + encodeURIComponent('Bill ' + bill.order_number)} size={190} level="M"/><span style={{ fontSize: 11, color: '#57534e' }}>UPI ID: {upiId}</span><span style={{ fontSize: 10, color: '#b45309', textAlign: 'center' }}>Only record the payment after checking the successful transaction in the restaurant’s UPI app.</span></div>}
      {duePaise > 0 && <div style={{ display: 'grid', gap: 8, marginTop: 12, color: '#292524' }}>
        <b style={{ fontSize: 13 }}>Record payment (manual)</b>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)} style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8, background: '#fff' }}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option></select>
        <input type="number" min="0.01" max={(duePaise / 100).toFixed(2)} step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Amount in ₹" style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8 }}/>
        <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} maxLength={100} placeholder="Optional transaction reference" style={{ width: '100%', padding: 10, border: '1px solid #d6d3d1', borderRadius: 8 }}/>
        <button type="button" className="btn" disabled={paymentSaving} onClick={() => void recordPayment()} style={{ justifyContent: 'center' }}>{paymentSaving ? 'Recording…' : 'Record payment'}</button>
      </div>}
      {duePaise === 0 && <p style={{ fontSize: 12, fontWeight: 700, marginTop: 10 }}>Paid in full</p>}
      <button type="button" className="outline-btn" onClick={async () => {
        try {
          const blob = await createBillImage({restaurant:cafes.find(cafe=>cafe.id===cafeId)?.name||'Restaurant',orderNumber:bill.order_number,lines:bill.lines,subtotal:bill.subtotal_paise,discount:bill.discount_paise,total:bill.total_paise,paid:paidPaise,due:duePaise})
          const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='Rivantoq-bill-'+bill.order_number+'.png';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
        } catch(error) { setMessage(error instanceof Error ? error.message : 'Could not download the bill image.') }
      }} style={{width:'100%',marginTop:10}}>Download bill image (PNG)</button>
      <button type="button" className="btn" onClick={async () => {
        try {
          const blob=await createBillImage({restaurant:cafes.find(cafe=>cafe.id===cafeId)?.name||'Restaurant',orderNumber:bill.order_number,lines:bill.lines,subtotal:bill.subtotal_paise,discount:bill.discount_paise,total:bill.total_paise,paid:paidPaise,due:duePaise})
          const file=new File([blob],'Rivantoq-bill-'+bill.order_number+'.png',{type:'image/png'})
          if(navigator.share && navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:'Rivantoq bill #'+bill.order_number,text:'Thank you for visiting '+(cafes.find(cafe=>cafe.id===cafeId)?.name||'our restaurant')+'!'})
          else {const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage('Bill image downloaded. Attach the PNG in WhatsApp to send it to the customer.')}
        } catch(error) { if(error instanceof Error && error.name!=='AbortError') setMessage(error.message||'Could not share the bill image.') }
      }} style={{width:'100%',marginTop:8}}>Share bill image</button>
      {customerPhone.trim() && <button type="button" className="outline-btn" onClick={() => { const phone = customerPhone.replace(/[^0-9]/g, ''); const itemLines = bill.lines.map(line => line.item.name + ' x ' + line.quantity + ' - ' + money(line.item.price_paise * line.quantity)).join('\n'); const text = 'Rivantoq bill #' + bill.order_number + '\n' + itemLines + '\nTotal: ' + money(bill.total_paise) + '\nPaid: ' + money(paidPaise) + '\nBalance: ' + money(duePaise) + '\nThank you for visiting!'; window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer') }} style={{ width: '100%', marginTop: 10 }}>Send bill on WhatsApp</button>}
      <button type="button" className="outline-btn" onClick={() => window.print()} style={{ width: '100%', marginTop: 10 }}>Print / save digital bill</button>
      <p style={{ fontSize: 10, marginBottom: 0, color: '#57534e' }}>Bills and payment records are saved in Rivantoq. WhatsApp opens a prepared message for the owner to send; UPI payment is completed in the customer’s UPI app, not inside Rivantoq.</p>
    </div>}
    {message && <p role="alert" style={{ fontSize: 12, color: '#b91c1c', overflowWrap: 'anywhere' }}>{message}</p>}
  </section>
}
