import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react'
type MenuItem={id:string;name:string;description:string|null;category:string;price:number;image:string|null;available:boolean}
type Props={token:string;items:MenuItem[]}
const rupees=(paise:number)=>'₹'+(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})

export function CustomerOrdering({token,items}:Props){
 const [cart,setCart]=useState<Record<string,number>>({}),[pin,setPin]=useState(''),[notes,setNotes]=useState('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState(false)
 const [category,setCategory]=useState('All'),[search,setSearch]=useState('')
 const cartItems=useMemo(()=>items.filter(x=>(cart[x.id]||0)>0),[items,cart])
 const categories=useMemo(()=>['All',...Array.from(new Set(items.map(x=>x.category)))],[items])
 const visible=useMemo(()=>items.filter(x=>(category==='All'||x.category===category)&&(x.name+' '+(x.description||'')).toLowerCase().includes(search.toLowerCase().trim())),[items,category,search])
 const total=cartItems.reduce((sum,x)=>sum+x.price*cart[x.id],0)
 const count=cartItems.reduce((sum,x)=>sum+cart[x.id],0)
 function change(id:string,delta:number){setCart(old=>{const next={...old},qty=(next[id]||0)+delta;if(qty<=0)delete next[id];else next[id]=Math.min(20,qty);return next})}
 async function placeOrder(){
  if(!supabase){setMessage('Ordering is temporarily unavailable. Please ask café staff for help.');return}
  if(!cartItems.length){setMessage('Please add at least one dish to your order.');return}
  if(pin.length!==6){setMessage('Enter the 6-digit order PIN from café staff.');return}
  setBusy(true);setMessage('')
  try{
   const {data,error}=await supabase.rpc('submit_guest_order',{p_token:token,p_pin:pin,p_items:cartItems.map(x=>({menu_item_id:x.id,quantity:cart[x.id]})),p_notes:notes.trim()||null})
   if(error){setMessage(error.message||'We could not send your order. Please try again.');return}
   const result=data as {order_id?:string;error?:string}|null
   if(result?.error){setMessage(result.error);return}
   if(!result?.order_id){setMessage('The café did not confirm this order. Please ask staff to check and try again.');return}
   setSuccess(true);setMessage('Order #'+result.order_id.slice(0,8)+' has been sent to the café.')
   setCart({});setPin('');setNotes('')
  }catch{
   setMessage('Connection problem. Please check your internet and try again.')
  }finally{setBusy(false)}
 }
 if(success)return <div className="guest-success"><div className="guest-success-icon"><Sparkles size={28}/></div><h2>Order sent to the kitchen!</h2><p>{message}</p><span>Thank you for dining with us.</span></div>
 return <section className="guest-ordering">
  <div className="guest-menu-heading"><div><span className="guest-eyebrow"><Sparkles size={13}/> FRESH FROM OUR KITCHEN</span><h2>Explore the menu</h2><p>Find your favourites and build your order.</p></div><div className="guest-cart-count"><ShoppingBag size={16}/><b>{count}</b><span>in cart</span></div></div>
  <label className="guest-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search dishes or ingredients…"/></label>
  <div className="guest-categories">{categories.map(x=><button type="button" key={x} className={category===x?'active':''} onClick={()=>setCategory(x)}>{x}</button>)}</div>
  {!visible.length&&<div className="guest-no-items"><UtensilsCrossed size={24}/><b>No dishes found</b><span>Try another category or search.</span></div>}
  <div className="guest-menu-grid">{visible.map(item=><article className="guest-dish-card" key={item.id}>
   <div className="guest-dish-image">{item.image?<img src={item.image} alt={item.name}/>:<div className="guest-image-placeholder"><UtensilsCrossed size={26}/><span>Made with care</span></div>}<span className="guest-dish-category">{item.category}</span></div>
   <div className="guest-dish-info"><h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}<div className="guest-dish-bottom"><strong>{rupees(item.price)}</strong><div className="guest-qty-control"><button type="button" aria-label={'Remove one '+item.name} disabled={!cart[item.id]} onClick={()=>change(item.id,-1)}><Minus size={14}/></button><b>{cart[item.id]||0}</b><button type="button" aria-label={'Add one '+item.name} disabled={(cart[item.id]||0)>=20} onClick={()=>change(item.id,1)}><Plus size={14}/></button></div></div></div>
  </article>)}</div>
  {cartItems.length>0&&<div className="guest-checkout">
   <div className="guest-checkout-head"><div><span>YOUR SELECTION</span><h3>Your order</h3></div><b>{count} items</b></div>
   {cartItems.map(x=><div className="guest-cart-row" key={x.id}><span>{x.name} × {cart[x.id]}</span><b>{rupees(x.price*cart[x.id])}</b></div>)}
   <div className="guest-total"><span>Subtotal</span><strong>{rupees(total)}</strong></div>
   <label className="guest-field">Special instructions <span>Optional</span><textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} placeholder="Allergies or preparation preferences?"/></label>
   <label className="guest-field">6-digit order PIN <span>Ask your server</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter PIN"/></label>
   <button type="button" className="guest-place-order" onClick={()=>void placeOrder()} disabled={busy||!cartItems.length||pin.length!==6||!supabase}>{busy?'Sending your order…':'Place order · '+rupees(total)}</button>
   <p className="guest-payment-note">No payment is collected here. Your server will help with payment.</p>
  </div>}
  {message&&<p role="status" className="guest-message">{message}</p>}
 </section>
}

export function TablePinIssuer({tableId}:{tableId:string}){
 const [pin,setPin]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function issuePin(){
  if(!supabase)return
  setBusy(true);setMessage('')
  const {data,error}=await supabase.rpc('issue_table_order_pin',{p_table_id:tableId})
  setBusy(false);if(error){setMessage(error.message);return}
  const result=data as {pin?:string;expires_in_seconds?:number}|null
  if(!result?.pin){setMessage('Could not issue a PIN.');return}
  setPin(result.pin);setMessage('Share this PIN with the guest. It expires in 10 minutes and works for one order.')
 }
 return <div style={{marginTop:10}}><button type="button" onClick={()=>void issuePin()} disabled={busy} style={{padding:'8px 11px',border:'1px solid #d6d3d1',borderRadius:8,background:'#fff',fontSize:12,fontWeight:700}}>{busy?'Creating PIN…':'Issue guest order PIN'}</button>
  {pin&&<div style={{marginTop:8,padding:10,borderRadius:8,background:'#ecfdf5',color:'#065f46'}}><b style={{fontSize:20,letterSpacing:4}}>{pin}</b><button type="button" onClick={()=>void navigator.clipboard?.writeText(pin)} style={{marginLeft:10,padding:'5px 8px',border:0,borderRadius:6}}>Copy</button></div>}
  {message&&<p role="status" style={{fontSize:11,color:'#78716c',lineHeight:1.4}}>{message}</p>}
 </div>
}
