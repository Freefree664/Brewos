import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type MenuItem = {
  id: string
  name: string
  description: string | null
  category: string
  price: number
  image: string | null
  available: boolean
}

type Props = { token: string; items: MenuItem[] }

export function CustomerOrdering({ token, items }: Props) {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [pin, setPin] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const cartItems = useMemo(() => items.filter(item => (cart[item.id] || 0) > 0), [items, cart])
  const total = cartItems.reduce((sum, item) => sum + item.price * cart[item.id], 0)
  const updateQty = (id: string, change: number) => {
    setCart(current => {
      const next = { ...current }
      const quantity = (next[id] || 0) + change
      if (quantity <= 0) delete next[id]
      else next[id] = Math.min(20, quantity)
      return next
    })
  }

  async function placeOrder() {
    if (!supabase || !cartItems.length || !/^\d{6}$/.test(pin)) return
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.rpc('submit_guest_order', {
      p_token: token,
      p_pin: pin,
      p_items: cartItems.map(item => ({ menu_item_id: item.id, quantity: cart[item.id] })),
      p_notes: notes.trim() || null
    })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    const result = data as { order_id?: string; status?: string; total_paise?: number; error?: string } | null
    if (result?.error) {
      setMessage(result.error)
      return
    }
    if (!result?.order_id) {
      setMessage('We could not confirm the order. Please ask café staff.')
      return
    }
    setSuccess(true)
    setMessage(`Order #${result.order_id.slice(0, 8)} placed successfully. Please wait for the café team to confirm it.`)
    setCart({})
    setPin('')
    setNotes('')
  }

  if (success) return <div style={{marginTop:20,padding:18,borderRadius:14,background:'#ecfdf5',color:'#065f46',textAlign:'center'}}>
    <b style={{fontSize:16}}>Order sent to the café!</b>
    <p style={{fontSize:13,lineHeight:1.5,marginBottom:0}}>{message}</p>
  </div>

  return <section style={{textAlign:'left',marginTop:22,borderTop:'1px solid #eee9df',paddingTop:18}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
      <h2 style={{fontSize:20,margin:'0 0 12px',color:'#292524'}}>Our menu</h2>
      <span style={{fontSize:12,color:'#78716c'}}>{cartItems.reduce((n,item)=>n+cart[item.id],0)} in cart</span>
    </div>
    {items.length === 0 && <p style={{fontSize:13,color:'#78716c'}}>No available menu items right now.</p>}
    <div style={{display:'grid',gap:12}}>
      {items.map(item => <article key={item.id} style={{display:'flex',gap:12,alignItems:'center',border:'1px solid #e7e5e4',borderRadius:12,padding:10}}>
        {item.image ? <img src={item.image} alt={item.name} style={{width:84,height:80,objectFit:'cover',borderRadius:9,background:'#f5f5f4'}}/> : <div style={{width:84,height:80,display:'grid',placeItems:'center',borderRadius:9,background:'#f5f5f4',color:'#78716c',fontSize:11}}>No photo</div>}
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'#292524'}}>{item.name}</div>
          <div style={{fontSize:11,color:'#78716c',marginTop:3}}>{item.category}</div>
          {item.description && <p style={{fontSize:12,lineHeight:1.4,color:'#78716c',margin:'5px 0'}}>{item.description}</p>}
          <div style={{fontSize:14,fontWeight:800,color:'#047857'}}>₹{(item.price/100).toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <button type="button" aria-label={`Remove one ${item.name}`} onClick={()=>updateQty(item.id,-1)} disabled={!cart[item.id]} style={{width:30,height:30,border:'1px solid #d6d3d1',borderRadius:8,background:'#fff'}}>−</button>
          <b style={{minWidth:14,textAlign:'center',fontSize:13}}>{cart[item.id] || 0}</b>
          <button type="button" aria-label={`Add one ${item.name}`} onClick={()=>updateQty(item.id,1)} disabled={(cart[item.id] || 0)>=20} style={{width:30,height:30,border:0,borderRadius:8,background:'#047857',color:'#fff'}}>+</button>
        </div>
      </article>)}
    </div>
    {cartItems.length > 0 && <div style={{marginTop:18,padding:14,border:'1px solid #e7e5e4',borderRadius:12}}>
      <h3 style={{fontSize:16,margin:'0 0 10px'}}>Your order</h3>
      {cartItems.map(item=><div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13,margin:'7px 0'}}>
        <span>{item.name} × {cart[item.id]}</span><b>₹{(item.price*cart[item.id]/100).toLocaleString('en-IN',{maximumFractionDigits:2})}</b>
      </div>)}
      <div style={{borderTop:'1px solid #eee9df',paddingTop:10,marginTop:10,display:'flex',justifyContent:'space-between',fontWeight:800}}>
        <span>Subtotal</span><span>₹{(total/100).toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
      </div>
      <label style={{display:'block',fontSize:12,marginTop:12}}>Special instructions (optional)
        <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} placeholder="Any preferences for the kitchen?" style={{display:'block',width:'100%',boxSizing:'border-box',padding:10,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,minHeight:64}}/>
      </label>
      <label style={{display:'block',fontSize:12,marginTop:12}}>6-digit order PIN from café staff
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter staff PIN" style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,letterSpacing:4}}/>
      </label>
      <button type="button" onClick={()=>void placeOrder()} disabled={busy || cartItems.length===0 || pin.length!==6 || !supabase} style={{width:'100%',padding:13,marginTop:12,border:0,borderRadius:10,background:'#047857',color:'#fff',fontWeight:800,opacity:busy?0.65:1}}>
        {busy ? 'Sending order…' : 'Place order · ₹'+(total/100).toLocaleString('en-IN',{maximumFractionDigits:2})}
      </button>
      <p style={{fontSize:11,color:'#78716c',lineHeight:1.5,marginBottom:0}}>The café will confirm your order. Payment is not collected on this page.</p>
    </div>}
    {message && <p role="status" style={{fontSize:12,lineHeight:1.5,color:'#a16207',overflowWrap:'anywhere'}}>{message}</p>}
  </section>
}

export function TablePinIssuer({ tableId }: { tableId: string }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function issuePin() {
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.rpc('issue_table_order_pin', { p_table_id: tableId })
    setBusy(false)
    if (error) { setMessage(error.message); return }
    const result = data as { pin?: string; expires_in_seconds?: number } | null
    if (!result?.pin) { setMessage('Could not issue a PIN.'); return }
    setPin(result.pin)
    setMessage('Share this PIN with the guest. It expires in 10 minutes and works for one order.')
  }
  return <div style={{marginTop:10}}>
    <button type="button" onClick={()=>void issuePin()} disabled={busy} style={{padding:'8px 11px',border:'1px solid #d6d3d1',borderRadius:8,background:'#fff',fontSize:12,fontWeight:700}}>{busy?'Creating PIN…':'Issue guest order PIN'}</button>
    {pin && <div style={{marginTop:8,padding:10,borderRadius:8,background:'#ecfdf5',color:'#065f46'}}>
      <b style={{fontSize:20,letterSpacing:4}}>{pin}</b>
      <button type="button" onClick={()=>void navigator.clipboard?.writeText(pin)} style={{marginLeft:10,padding:'5px 8px',border:0,borderRadius:6}}>Copy</button>
    </div>}
    {message && <p role="status" style={{fontSize:11,color:'#78716c',lineHeight:1.4}}>{message}</p>}
  </div>
}
