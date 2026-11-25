import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed, CheckCircle2, Clock3 } from 'lucide-react'

type MenuItem={id:string;name:string;description:string|null;category:string;price:number;image:string|null;available:boolean}
type Props={token:string;items:MenuItem[];initialPin?:string}
const rupees=(paise:number)=>'₹'+(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})
const progress=[{key:'pending',label:'Order placed',hint:'Your order has reached the café.'},{key:'accepted',label:'Confirmed',hint:'The café has confirmed your order.'},{key:'preparing',label:'Preparing',hint:'The kitchen is preparing your food.'},{key:'ready',label:'Ready',hint:'Your order is ready to be served.'},{key:'served',label:'Served',hint:'Your order has been served.'},{key:'completed',label:'Completed',hint:'Thank you for visiting us!'}]

export function CustomerOrdering({token,items,initialPin=''}:Props){
 const [cart,setCart]=useState<Record<string,number>>({}),[notes,setNotes]=useState('')
 const [customerName,setCustomerName]=useState(''),[customerPhone,setCustomerPhone]=useState('')
 const [loyaltySummary,setLoyaltySummary]=useState<{earned:number;balance:number}|null>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[orderId,setOrderId]=useState(''),[orderNumber,setOrderNumber]=useState<number|null>(null),[orderStatus,setOrderStatus]=useState('pending')
 const [orderBill,setOrderBill]=useState<{subtotal_paise:number;discount_paise:number;tax_paise:number;total_paise:number;restaurant_name:string;upi_id:string|null;items:Array<{name:string;quantity:number;unit_price_paise:number;line_total_paise:number}>}|null>(null)
 const [paymentMode,setPaymentMode]=useState<'upi'|'cash'>('upi')
 const [category,setCategory]=useState('All'),[search,setSearch]=useState('')
 const cartItems=useMemo(()=>items.filter(x=>(cart[x.id]||0)>0),[items,cart])
 const categories=useMemo(()=>['All',...Array.from(new Set(items.map(x=>x.category)))],[items])
 const visible=useMemo(()=>items.filter(x=>(category==='All'||x.category===category)&&(x.name+' '+(x.description||'')).toLowerCase().includes(search.toLowerCase().trim())),[items,category,search])
 const total=cartItems.reduce((sum,x)=>sum+x.price*cart[x.id],0)
 const count=cartItems.reduce((sum,x)=>sum+cart[x.id],0)
 function change(id:string,delta:number){setCart(old=>{const next={...old},qty=(next[id]||0)+delta;if(qty<=0)delete next[id];else next[id]=Math.min(20,qty);return next})}
 useEffect(()=>{
  const client=supabase
  if(!orderId||!client)return
  let active=true
  const refresh=async()=>{
   const {data,error}=await client.rpc('get_guest_order_status',{p_token:token,p_order_id:orderId})
   if(!active||error||!data)return
   const result=data as {status?:string;order_number?:number;subtotal_paise?:number;discount_paise?:number;tax_paise?:number;total_paise?:number;restaurant_name?:string;upi_id?:string|null;loyalty_points_earned?:number;loyalty_points_balance?:number;items?:Array<{name:string;quantity:number;unit_price_paise:number;line_total_paise:number}>}
   if(result.status){setOrderStatus(result.status);if(result.status==='completed')setLoyaltySummary({earned:Number(result.loyalty_points_earned||0),balance:Number(result.loyalty_points_balance||0)})}
   if(typeof result.order_number==='number')setOrderNumber(result.order_number)
   if(typeof result.total_paise==='number')setOrderBill({subtotal_paise:result.subtotal_paise||0,discount_paise:result.discount_paise||0,tax_paise:result.tax_paise||0,total_paise:result.total_paise,restaurant_name:result.restaurant_name||'Restaurant',upi_id:result.upi_id||null,items:result.items||[]})
  }
  void refresh()
  const timer=window.setInterval(()=>void refresh(),7000)
  return()=>{active=false;window.clearInterval(timer)}
 },[orderId,token])
 async function placeOrder(){
  if(!supabase){setMessage('Ordering is temporarily unavailable. Please ask café staff for help.');return}
  if(!initialPin){setMessage('This table is not open for ordering yet. Please wait for café staff to activate it.');return}
  if(!cartItems.length){setMessage('Please add at least one dish to your order.');return}
  setBusy(true);setMessage('')
  try{
   const {data,error}=await supabase.rpc('submit_guest_order',{p_token:token,p_pin:initialPin,p_items:cartItems.map(x=>({menu_item_id:x.id,quantity:cart[x.id]})),p_notes:notes.trim()||null,p_customer_name:customerName.trim()||null,p_customer_phone:customerPhone.trim()||null})
   if(error){setMessage(error.message||'We could not send your order. Please try again.');return}
   const result=data as {order_id?:string;error?:string;status?:string}|null
   if(result?.error){setMessage(result.error);return}
   if(!result?.order_id){setMessage('The café did not confirm this order. Please ask staff to check and try again.');return}
   setOrderId(result.order_id);setOrderStatus(result.status||'pending');setCart({});setNotes('');setLoyaltySummary(null)
  }catch{setMessage('Connection problem. Please check your internet and try again.')}
  finally{setBusy(false)}
 }
 if(orderId){
  const currentIndex=progress.findIndex(x=>x.key===orderStatus)
  const cancelled=orderStatus==='cancelled'
  return <section className="guest-order-tracking" aria-live="polite">
   <div className="guest-success-icon"><CheckCircle2 size={28}/></div>
   <span className="guest-eyebrow">Rivantoq ORDER TRACKING</span>
   <h2>{cancelled?'Order cancelled':orderStatus==='completed'?'Your order is complete':'Your order is on its way!'}</h2>
   <p>Order {orderNumber?('#'+orderNumber):('#'+orderId.slice(0,8))} · Status updates automatically</p>
   {cancelled?<div className="guest-status-current">The café has cancelled this order. Please speak to the café team.</div>:<div className="guest-status-timeline">{progress.map((step,index)=><div className={'guest-status-step '+(index<currentIndex?'done':index===currentIndex?'current':'')} key={step.key}><span className="guest-status-dot">{index<currentIndex?<CheckCircle2 size={15}/>:index===currentIndex?<Clock3 size={15}/>:null}</span><div><b>{step.label}</b>{index===currentIndex&&<small>{step.hint}</small>}</div></div>)}</div>}
   {orderStatus==='completed'&&loyaltySummary&&customerPhone.trim()&&<div style={{marginTop:12,padding:13,borderRadius:12,background:'#ecfdf5',color:'#065f46',textAlign:'left'}}><b>Thanks for being a Rivantoq rewards member!</b><p style={{fontSize:12,margin:'5px 0 0'}}>You earned {loyaltySummary.earned} points. Your new balance is {loyaltySummary.balance} points.</p></div>}
    {orderStatus==='completed'&&orderBill&&<div style={{marginTop:18,padding:16,border:'1px solid #a7f3d0',borderRadius:14,background:'#fff',color:'#292524',textAlign:'left'}}><b style={{fontSize:16}}>Your digital bill</b><p style={{fontSize:12,color:'#78716c',margin:'4px 0 12px'}}>{orderBill.restaurant_name} · Bill #{orderNumber||orderId.slice(0,8)}</p><div style={{display:'grid',gap:7}}>{orderBill.items.map((item,index)=><div key={index} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:12}}><span>{item.name} × {item.quantity}</span><b>{rupees(item.line_total_paise)}</b></div>)}</div><div style={{borderTop:'1px solid #e7e5e4',marginTop:10,paddingTop:10,display:'grid',gap:5,fontSize:12}}><div style={{display:'flex',justifyContent:'space-between'}}><span>Subtotal</span><b>{rupees(orderBill.subtotal_paise)}</b></div>{orderBill.discount_paise>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span>Discount</span><b>−{rupees(orderBill.discount_paise)}</b></div>}<div style={{display:'flex',justifyContent:'space-between',fontSize:15}}><b>Total to pay</b><b>{rupees(orderBill.total_paise)}</b></div></div><label style={{display:'grid',gap:5,fontSize:12,marginTop:13}}>Choose payment mode<select value={paymentMode} onChange={e=>setPaymentMode(e.target.value as 'upi'|'cash')} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8,background:'#fff'}}><option value="upi">UPI · Scan QR</option><option value="cash">Cash · Pay at counter</option></select></label>{paymentMode==='upi'&&orderBill.upi_id?<div style={{display:'grid',justifyItems:'center',gap:8,marginTop:12,padding:12,background:'#f0fdf4',borderRadius:12}}><b>Scan to pay {rupees(orderBill.total_paise)}</b><QRCodeSVG value={'upi://pay?pa='+encodeURIComponent(orderBill.upi_id)+'&pn='+encodeURIComponent(orderBill.restaurant_name)+'&am='+(orderBill.total_paise/100).toFixed(2)+'&cu=INR&tn='+encodeURIComponent('Order '+(orderNumber||''))} size={190}/><small>UPI ID: {orderBill.upi_id}</small></div>:paymentMode==='upi'?<p style={{fontSize:12,color:'#b45309',marginTop:10}}>This restaurant has not added its UPI ID yet. Please pay at the counter.</p>:<p style={{fontSize:12,color:'#57534e',marginTop:10}}>Please pay cash at the counter. The restaurant team will confirm your payment.</p>}<p style={{fontSize:10,color:'#78716c',marginBottom:0}}>Keep this bill for your records. Your payment is not confirmed until the restaurant verifies it.</p></div>}
   <p className="guest-tracking-footnote">Keep this page open to see the latest updates. It refreshes automatically.</p>
  </section>
 }
 return <section className="guest-ordering">
  <div className="guest-menu-heading"><div><span className="guest-eyebrow"><Sparkles size={13}/> FRESH FROM OUR KITCHEN</span><h2>Explore the menu</h2><p>Find your favourites and build your order.</p></div><div className="guest-cart-count"><ShoppingBag size={16}/><b>{count}</b><span>in cart</span></div></div>
  {!initialPin&&<div className="guest-session-closed" role="status"><Clock3 size={18}/><div><b>This table is not open yet</b><span>Your café team will activate the table. The ordering code will appear here automatically.</span></div></div>}
  {initialPin&&<div className="guest-session-code"><span>TABLE SESSION ACTIVE</span><b>{initialPin}</b><small>Your table is ready for ordering. No need to ask for a new code.</small></div>}
  <label className="guest-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search dishes or ingredients…"/></label>
  <div className="guest-categories">{categories.map(x=><button type="button" key={x} className={category===x?'active':''} onClick={()=>setCategory(x)}>{x}</button>)}</div>
  {!visible.length&&<div className="guest-no-items"><UtensilsCrossed size={24}/><b>No dishes found</b><span>Try another category or search.</span></div>}
  <div className="guest-menu-grid">{visible.map(item=><article className="guest-dish-card" key={item.id}>
   <div className="guest-dish-image">{item.image?<img src={item.image} alt={item.name}/>:<div className="guest-image-placeholder"><UtensilsCrossed size={26}/><span>Made with care</span></div>}<span className="guest-dish-category">{item.category}</span></div>
   <div className="guest-dish-info"><h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}<div className="guest-dish-bottom"><strong>{rupees(item.price)}</strong><div className="guest-qty-control"><button type="button" aria-label={'Remove one '+item.name} disabled={!cart[item.id]} onClick={()=>change(item.id,-1)}><Minus size={14}/></button><b>{cart[item.id]||0}</b><button type="button" aria-label={'Add one '+item.name} disabled={(cart[item.id]||0)>=20||!initialPin} onClick={()=>change(item.id,1)}><Plus size={14}/></button></div></div></div>
  </article>)}</div>
  {cartItems.length>0&&<div className="guest-checkout">
   <div className="guest-checkout-head"><div><span>YOUR SELECTION</span><h3>Your order</h3></div><b>{count} items</b></div>
   {cartItems.map(x=><div className="guest-cart-row" key={x.id}><span>{x.name} × {cart[x.id]}</span><b>{rupees(x.price*cart[x.id])}</b></div>)}
   <div className="guest-total"><span>Subtotal</span><strong>{rupees(total)}</strong></div>
   <label className="guest-field">Your name <span>Optional</span><input value={customerName} onChange={e=>setCustomerName(e.target.value.slice(0,100))} maxLength={100} placeholder="Name for your order"/></label>
    <label className="guest-field">Mobile number <span>Optional · Add it to earn reward points</span><input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value.slice(0,20))} maxLength={20} placeholder="e.g. +91 98765 43210"/></label>
    <label className="guest-field">Special instructions <span>Optional</span><textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} placeholder="Allergies or preparation preferences?"/></label>
   <div className="guest-code-confirm"><span>Table activation code</span><b>{initialPin||'Waiting for activation'}</b></div>
   <button type="button" className="guest-place-order" onClick={()=>void placeOrder()} disabled={busy||!cartItems.length||!initialPin||!supabase}>{busy?'Sending your order…':'Place order · '+rupees(total)}</button>
   <p className="guest-payment-note">No payment is collected here. Your server will help with payment.</p>
  </div>}
  {message&&<p role="status" className="guest-message">{message}</p>}
 </section>
}

export function TablePinIssuer({tableId}:{tableId:string}){
 const [active,setActive]=useState(false),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{
  let alive=true
  async function load(){if(!supabase)return;const {data,error}=await supabase.rpc('get_table_session_status',{p_table_id:tableId});if(!alive)return;if(error){setMessage(error.message);return}const result=data as {active?:boolean;pin?:string|null}|null;setActive(Boolean(result?.active));setPin(result?.pin||'')}
  void load()
  return()=>{alive=false}
 },[tableId])
 async function toggleSession(){
  if(!supabase)return
  setBusy(true);setMessage('')
  const {data,error}=await supabase.rpc(active?'end_table_session':'start_table_session',{p_table_id:tableId})
  setBusy(false)
  if(error){setMessage(error.message);return}
  if(active){setActive(false);setPin('');setMessage('Table session ended. The customer code is now invalid.')}
  else{const result=data as {pin?:string}|null;setActive(true);setPin(result?.pin||'');setMessage('Table activated. Customers scanning its QR will now see this code automatically.')}
 }
 return <div style={{marginTop:10,padding:12,borderRadius:10,background:active?'#ecfdf5':'#f5f5f4',border:'1px solid '+(active?'#a7f3d0':'#e7e5e4')}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><b>{active?'Ordering session active':'Ordering session closed'}</b><button type="button" onClick={()=>void toggleSession()} disabled={busy} style={{padding:'8px 11px',border:0,borderRadius:8,background:active?'#fee2e2':'#047857',color:active?'#991b1b':'#fff',fontSize:12,fontWeight:700}}>{busy?'Please wait…':active?'End table session':'Activate table & show code'}</button></div>
  {active&&pin&&<div style={{marginTop:10}}><small style={{display:'block',color:'#047857',fontWeight:700}}>CUSTOMER ACTIVATION CODE</small><b style={{fontSize:25,letterSpacing:5,color:'#065f46'}}>{pin}</b><p style={{fontSize:11,margin:'4px 0 0',color:'#475569'}}>Customers see this automatically on the QR ordering page. It stays valid until you end the session.</p></div>}
  {message&&<p role="status" style={{fontSize:11,margin:'8px 0 0',color:'#475569'}}>{message}</p>}
 </div>
}
