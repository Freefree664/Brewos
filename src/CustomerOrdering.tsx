import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed, CheckCircle2, Clock3, PhoneCall, ArrowLeft } from 'lucide-react'

type MenuOption={id:string;name:string;extra_price_paise:number}\ntype MenuOptionGroup={id:string;name:string;required:boolean;min_select:number;max_select:number;options:MenuOption[]}\ntype MenuItem={id:string;name:string;description:string|null;category:string;price:number;image:string|null;available:boolean;option_groups?:MenuOptionGroup[]}
type Props={token:string;items:MenuItem[];sessionActive:boolean}
const rupees=(paise:number)=>'₹'+(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})
const progress=[{key:'pending',label:'Order placed',hint:'Your order has reached the café.'},{key:'accepted',label:'Confirmed',hint:'The café has confirmed your order.'},{key:'preparing',label:'Preparing',hint:'The kitchen is preparing your food.'},{key:'ready',label:'Ready',hint:'Your order is ready to be served.'},{key:'served',label:'Served',hint:'Your order has been served.'},{key:'completed',label:'Completed',hint:'Thank you for visiting us!'}]

export function CustomerOrdering({token,items,sessionActive}:Props){
 const [sessionPin,setSessionPin]=useState('')
 const [cart,setCart]=useState<Record<string,number>>({}),[notes,setNotes]=useState('')\n const [selectedOptions,setSelectedOptions]=useState<Record<string,string[]>>({})\n const [customizingItem,setCustomizingItem]=useState<MenuItem|null>(null)\n const [draftOptions,setDraftOptions]=useState<string[]>([])\n const [feedbackRating,setFeedbackRating]=useState(5),[feedbackComment,setFeedbackComment]=useState(''),[feedbackSent,setFeedbackSent]=useState(false),[feedbackBusy,setFeedbackBusy]=useState(false)
 const [customerName,setCustomerName]=useState(''),[customerPhone,setCustomerPhone]=useState('')
 const [loyaltySummary,setLoyaltySummary]=useState<{earned:number;balance:number}|null>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[orderId,setOrderId]=useState(''),[orderNumber,setOrderNumber]=useState<number|null>(null),[orderStatus,setOrderStatus]=useState('pending')
 const [orderBill,setOrderBill]=useState<{subtotal_paise:number;discount_paise:number;tax_paise:number;total_paise:number;restaurant_name:string;upi_id:string|null;items:Array<{name:string;quantity:number;unit_price_paise:number;line_total_paise:number;customizations?:Array<{id:string;name:string;extra_price_paise:number}>}>}|null>(null)
 const [paymentMode,setPaymentMode]=useState<'upi'|'cash'>('upi')
 const [callPanelOpen,setCallPanelOpen]=useState(false),[callBusy,setCallBusy]=useState(false),[callMessage,setCallMessage]=useState(''),[callSent,setCallSent]=useState(false)
 const [category,setCategory]=useState('All'),[search,setSearch]=useState('')
 const cartItems=useMemo(()=>items.filter(x=>(cart[x.id]||0)>0),[items,cart])
 const categories=useMemo(()=>['All',...Array.from(new Set(items.map(x=>x.category)))],[items])
 const visible=useMemo(()=>items.filter(x=>(category==='All'||x.category===category)&&(x.name+' '+(x.description||'')).toLowerCase().includes(search.toLowerCase().trim())),[items,category,search])
 const unitPrice=(item:MenuItem)=>item.price+(item.option_groups||[]).flatMap(g=>g.options).filter(o=>(selectedOptions[item.id]||[]).includes(o.id)).reduce((s,o)=>s+o.extra_price_paise,0)\n const total=cartItems.reduce((sum,x)=>sum+unitPrice(x)*cart[x.id],0)
 const count=cartItems.reduce((sum,x)=>sum+cart[x.id],0)
 function change(id:string,delta:number){setCart(old=>{const next={...old},qty=(next[id]||0)+delta;if(qty<=0){delete next[id];setSelectedOptions(previous=>{const copy={...previous};delete copy[id];return copy})}else next[id]=Math.min(20,qty);return next})}\n function saveCustomization(){if(!customizingItem)return;const groups=customizingItem.option_groups||[];for(const group of groups){const count=draftOptions.filter(id=>group.options.some(option=>option.id===id)).length;if(count<group.min_select||count>group.max_select){setMessage('Please choose '+group.min_select+' to '+group.max_select+' options for '+group.name+'.');return;}}setSelectedOptions(old=>({...old,[customizingItem.id]:draftOptions}));change(customizingItem.id,1);setCustomizingItem(null);setMessage('Customization added to your order.');}
 useEffect(()=>{
  const client=supabase
  if(!orderId||!client)return
  let active=true
  const refresh=async()=>{
   const {data,error}=await client.rpc('get_guest_order_status',{p_token:token,p_order_id:orderId})
   if(!active||error||!data)return
   const result=data as {status?:string;order_number?:number;subtotal_paise?:number;discount_paise?:number;tax_paise?:number;total_paise?:number;restaurant_name?:string;upi_id?:string|null;loyalty_points_earned?:number;loyalty_points_balance?:number;items?:Array<{name:string;quantity:number;unit_price_paise:number;line_total_paise:number;customizations?:Array<{id:string;name:string;extra_price_paise:number}>}>}
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
  if(!sessionActive){setMessage('This table is not open for ordering yet. Please wait for café staff to activate it.');return}
  if(!/^\d{6}$/.test(sessionPin)){setMessage('Enter the six-digit code provided by café staff.');return}
  if(!cartItems.length){setMessage('Please add at least one dish to your order.');return}
  setBusy(true);setMessage('')
  try{
   const {data,error}=await supabase.rpc('submit_guest_order_customized',{p_token:token,p_pin:sessionPin,p_items:cartItems.map(x=>({menu_item_id:x.id,quantity:cart[x.id],option_ids:selectedOptions[x.id]||[]})),p_notes:notes.trim()||null,p_customer_name:customerName.trim()||null,p_customer_phone:customerPhone.trim()||null})
   if(error){setMessage(error.message||'We could not send your order. Please try again.');return}
   const result=data as {order_id?:string;error?:string;status?:string}|null
   if(result?.error){setMessage(result.error);return}
   if(!result?.order_id){setMessage('The café did not confirm this order. Please ask staff to check and try again.');return}
   setOrderId(result.order_id);setOrderStatus(result.status||'pending');setCart({});setSelectedOptions({});setNotes('');setLoyaltySummary(null);setFeedbackSent(false)
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
   {orderStatus==='completed'&&!feedbackSent&&<div style={{marginTop:16,padding:14,border:'1px solid #e7e5e4',borderRadius:12,textAlign:'left'}}><b>How was your experience?</b><p style={{fontSize:12,color:'#78716c',margin:'5px 0 10px'}}>Share a rating with the café team.</p><label style={{display:'grid',gap:6,fontSize:12}}>Your rating<select value={feedbackRating} onChange={e=>setFeedbackRating(Number(e.target.value))} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8,background:'#fff'}}><option value={5}>★★★★★ · Excellent</option><option value={4}>★★★★ · Good</option><option value={3}>★★★ · Average</option><option value={2}>★★ · Poor</option><option value={1}>★ · Very poor</option></select></label><label style={{display:'grid',gap:6,fontSize:12,marginTop:9}}>Comment (optional)<textarea value={feedbackComment} onChange={e=>setFeedbackComment(e.target.value.slice(0,1000))} maxLength={1000} rows={3} placeholder='Tell us about your visit' style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/></label><button type='button' className='guest-place-order' disabled={feedbackBusy} style={{marginTop:10}} onClick={async()=>{if(!supabase)return;setFeedbackBusy(true);const {data,error}=await supabase.rpc('submit_order_feedback',{p_token:token,p_order_id:orderId,p_rating:feedbackRating,p_comment:feedbackComment.trim()||null});setFeedbackBusy(false);if(error){setMessage(error.message);return;}const result=data as {success?:boolean;error?:string};if(result?.error){setMessage(result.error);return;}setFeedbackSent(true);setMessage('Thank you for your feedback!');}}>{feedbackBusy?'Sending…':'Submit feedback'}</button></div>}{orderStatus==='completed'&&feedbackSent&&<p role='status' style={{marginTop:12,color:'#047857',fontSize:13}}>Thank you! Your feedback has been sent to the café.</p>}{orderStatus==='completed'&&loyaltySummary&&customerPhone.trim()&&<div style={{marginTop:12,padding:13,borderRadius:12,background:'#ecfdf5',color:'#065f46',textAlign:'left'}}><b>Thanks for being a Rivantoq rewards member!</b><p style={{fontSize:12,margin:'5px 0 0'}}>You earned {loyaltySummary.earned} points. Your new balance is {loyaltySummary.balance} points.</p></div>}
    {orderStatus==='completed'&&orderBill&&<div style={{marginTop:18,padding:16,border:'1px solid #a7f3d0',borderRadius:14,background:'#fff',color:'#292524',textAlign:'left'}}><b style={{fontSize:16}}>Your digital bill</b><p style={{fontSize:12,color:'#78716c',margin:'4px 0 12px'}}>{orderBill.restaurant_name} · Bill #{orderNumber||orderId.slice(0,8)}</p><div style={{display:'grid',gap:7}}>{orderBill.items.map((item,index)=><div key={index} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:12}}><span>{item.name} × {item.quantity}{item.customizations?.length ? <small style={{display:'block',color:'#78716c'}}>{item.customizations.map(option=>option.name).join(', ')}</small> : null}</span><b>{rupees(item.line_total_paise)}</b></div>)}</div><div style={{borderTop:'1px solid #e7e5e4',marginTop:10,paddingTop:10,display:'grid',gap:5,fontSize:12}}><div style={{display:'flex',justifyContent:'space-between'}}><span>Subtotal</span><b>{rupees(orderBill.subtotal_paise)}</b></div>{orderBill.discount_paise>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span>Discount</span><b>−{rupees(orderBill.discount_paise)}</b></div>}<div style={{display:'flex',justifyContent:'space-between',fontSize:15}}><b>Total to pay</b><b>{rupees(orderBill.total_paise)}</b></div></div><label style={{display:'grid',gap:5,fontSize:12,marginTop:13}}>Choose payment mode<select value={paymentMode} onChange={e=>setPaymentMode(e.target.value as 'upi'|'cash')} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8,background:'#fff'}}><option value="upi">UPI · Scan QR</option><option value="cash">Cash · Pay at counter</option></select></label>{paymentMode==='upi'&&orderBill.upi_id?<div style={{display:'grid',justifyItems:'center',gap:8,marginTop:12,padding:12,background:'#f0fdf4',borderRadius:12}}><b>Scan to pay {rupees(orderBill.total_paise)}</b><QRCodeSVG value={'upi://pay?pa='+encodeURIComponent(orderBill.upi_id)+'&pn='+encodeURIComponent(orderBill.restaurant_name)+'&am='+(orderBill.total_paise/100).toFixed(2)+'&cu=INR&tn='+encodeURIComponent('Order '+(orderNumber||''))} size={190}/><small>UPI ID: {orderBill.upi_id}</small></div>:paymentMode==='upi'?<p style={{fontSize:12,color:'#b45309',marginTop:10}}>This restaurant has not added its UPI ID yet. Please pay at the counter.</p>:<p style={{fontSize:12,color:'#57534e',marginTop:10}}>Please pay cash at the counter. The restaurant team will confirm your payment.</p>}<p style={{fontSize:10,color:'#78716c',marginBottom:0}}>Keep this bill for your records. Your payment is not confirmed until the restaurant verifies it.</p></div>}
   <p className="guest-tracking-footnote">Keep this page open to see the latest updates. It refreshes automatically.</p>
  </section>
 }
 if(callPanelOpen&&!orderId){
  return <section style={{maxWidth:620,margin:'0 auto',padding:'24px 16px',color:'#292524'}}>
   <button type="button" className="outline-btn" style={{width:'auto',marginBottom:20}} onClick={()=>{setCallPanelOpen(false);setCallMessage('')}}><ArrowLeft size={15}/> Back to menu</button>
   <div style={{background:'#fff',border:'1px solid #e7e5e4',borderRadius:18,padding:22,textAlign:'center'}}>
    <div style={{width:58,height:58,borderRadius:18,background:'#ecfdf5',color:'#047857',display:'grid',placeItems:'center',margin:'0 auto 14px'}}><PhoneCall size={27}/></div>
    <span className="guest-eyebrow">RIVANTOQ GUEST SERVICE</span>
    <h2 style={{margin:'8px 0',fontSize:24}}>Call a waiter</h2>
    <p style={{fontSize:13,color:'#78716c',lineHeight:1.6}}>Need help, a menu question, or assistance at your table? Send a request and a waiter will be notified.</p>
    {!sessionActive?<p role="status" style={{padding:12,borderRadius:10,background:'#fffbeb',color:'#92400e',fontSize:12}}>This table is not active yet. Please ask café staff to open your table.</p>:<>
     <button type="button" className="guest-place-order" disabled={callBusy||callSent||!supabase||!sessionActive} onClick={async()=>{
      if(!supabase)return;
      setCallBusy(true);setCallMessage('');
      try{
       const {data,error}=await supabase.rpc('call_waiter_for_table',{p_token:token});
       if(error){setCallMessage(error.message||'Could not send your request. Please ask café staff.');return;}
       const result=data as {request_id?:string;status?:string;error?:string;already_requested?:boolean}|null;
       if(result?.error){setCallMessage(result.error);return;}
       if(!result?.request_id){setCallMessage('The café did not confirm your request. Please try again or ask staff.');return;}
       setCallSent(true);setCallMessage(result.already_requested?'A waiter has already been called for this table.':'Your request has been sent. A waiter has been notified.');
      }catch{setCallMessage('Connection problem. Please check your internet and try again.');}
      finally{setCallBusy(false);}
     }}>{callBusy?'Sending request…':callSent?'Waiter requested':'Call waiter now'}</button>
    </>}
    {callMessage&&<p role="status" style={{marginTop:12,padding:11,borderRadius:9,background:callSent?'#ecfdf5':'#f5f5f4',color:callSent?'#065f46':'#57534e',fontSize:12}}>{callMessage}</p>}
    {callSent&&<p style={{fontSize:11,color:'#78716c'}}>Please keep this page open. The waiter will come to your table.</p>}
   </div>
  </section>
 }
 return <section className="guest-ordering">
  <div className="guest-menu-heading"><div><span className="guest-eyebrow"><Sparkles size={13}/> FRESH FROM OUR KITCHEN</span><h2>Explore the menu</h2><p>Find your favourites and build your order.</p><button type="button" className="outline-btn" style={{width:'auto',marginTop:10}} onClick={()=>{setCallPanelOpen(true);setCallMessage('');setCallSent(false)}}><PhoneCall size={15}/> Call waiter</button></div><div className="guest-cart-count"><ShoppingBag size={16}/><b>{count}</b><span>in cart</span></div></div>
  {!sessionActive&&<div className="guest-session-closed" role="status"><Clock3 size={18}/><div><b>This table is not open yet</b><span>Your café team must activate this table before you can order.</span></div></div>}
  {sessionActive&&<div className="guest-session-code"><span>TABLE SESSION ACTIVE</span><b>Ready for ordering</b><small>Ask café staff for the six-digit code.</small></div>}
  <label className="guest-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search dishes or ingredients…"/></label>
  <div className="guest-categories">{categories.map(x=><button type="button" key={x} className={category===x?'active':''} onClick={()=>setCategory(x)}>{x}</button>)}</div>
  {!visible.length&&<div className="guest-no-items"><UtensilsCrossed size={24}/><b>No dishes found</b><span>Try another category or search.</span></div>}
  <div className="guest-menu-grid">{visible.map(item=><article className="guest-dish-card" key={item.id}>
   <div className="guest-dish-image">{item.image?<img src={item.image} alt={item.name}/>:<div className="guest-image-placeholder"><UtensilsCrossed size={26}/><span>Made with care</span></div>}<span className="guest-dish-category">{item.category}</span></div>
   <div className="guest-dish-info"><h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}<div className="guest-dish-bottom"><strong>{rupees(item.price)}</strong><div className="guest-qty-control">{(item.option_groups||[]).length>0?<button type="button" disabled={!sessionActive} onClick={()=>{setCustomizingItem(item);setDraftOptions(selectedOptions[item.id]||[])}}>Customize</button>:<><button type="button" aria-label={'Remove one '+item.name} disabled={!cart[item.id]} onClick={()=>change(item.id,-1)}><Minus size={14}/></button><b>{cart[item.id]||0}</b><button type="button" aria-label={'Add one '+item.name} disabled={(cart[item.id]||0)>=20||!sessionActive} onClick={()=>change(item.id,1)}><Plus size={14}/></button></>}</div></div></div>
  </article>)}</div>
  {cartItems.length>0&&<div className="guest-checkout">
   <div className="guest-checkout-head"><div><span>YOUR SELECTION</span><h3>Your order</h3></div><b>{count} items</b></div>
   {cartItems.map(x=><div className="guest-cart-row" key={x.id}><span>{x.name}{(selectedOptions[x.id]||[]).length>0&&<small style={{display:'block',color:'#78716c'}}>{(x.option_groups||[]).flatMap(g=>g.options).filter(o=>(selectedOptions[x.id]||[]).includes(o.id)).map(o=>o.name).join(', ')}</small>} × {cart[x.id]}</span><b>{rupees(unitPrice(x)*cart[x.id])}</b></div>)}
   <div className="guest-total"><span>Subtotal</span><strong>{rupees(total)}</strong></div>
   <label className="guest-field">Your name <span>Optional</span><input value={customerName} onChange={e=>setCustomerName(e.target.value.slice(0,100))} maxLength={100} placeholder="Name for your order"/></label>
    <label className="guest-field">Mobile number <span>Optional · Add it to earn reward points</span><input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value.slice(0,20))} maxLength={20} placeholder="e.g. +91 98765 43210"/></label>
    <label className="guest-field">Special instructions <span>Optional</span><textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} placeholder="Allergies or preparation preferences?"/></label>
   <label className="guest-field">Six-digit code from café staff<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={sessionPin} onChange={e=>setSessionPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter table code" /></label>
   <button type="button" className="guest-place-order" onClick={()=>void placeOrder()} disabled={busy||!cartItems.length||!sessionActive||!/^\d{6}$/.test(sessionPin)||!supabase}>{busy?'Sending your order…':'Place order · '+rupees(total)}</button>
   <p className="guest-payment-note">No payment is collected here. Your server will help with payment.</p>
  </div>}
  {customizingItem&&<div role='dialog' aria-modal='true' style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(20,20,20,.55)',display:'grid',placeItems:'center',padding:16}}><div style={{width:'min(100%,460px)',maxHeight:'85vh',overflow:'auto',background:'#fff',borderRadius:16,padding:18,color:'#292524'}}><h3 style={{marginTop:0}}>Customize {customizingItem.name}</h3>{(customizingItem.option_groups||[]).map(group=><fieldset key={group.id} style={{border:'1px solid #e7e5e4',borderRadius:10,padding:12,margin:'12px 0'}}><legend style={{fontSize:13,fontWeight:700}}>{group.name} {group.required?'· Required':'· Optional'} <small style={{fontWeight:400}}>Choose {group.min_select}–{group.max_select}</small></legend>{group.options.map(option=><label key={option.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:13}}><input type='checkbox' checked={draftOptions.includes(option.id)} onChange={e=>setDraftOptions(old=>{if(!e.target.checked)return old.filter(id=>id!==option.id);const selectedInGroup=old.filter(id=>group.options.some(candidate=>candidate.id===id)).length;if(selectedInGroup>=group.max_select){setMessage('Choose up to '+group.max_select+' option(s) for '+group.name+'.');return old;}return [...old,option.id]})} />{option.name}<span style={{marginLeft:'auto'}}>+{rupees(option.extra_price_paise)}</span></label>)}</fieldset>)}<div style={{display:'flex',gap:8}}><button type='button' className='guest-place-order' onClick={saveCustomization}>Add to order</button><button type='button' className='outline-btn' onClick={()=>setCustomizingItem(null)}>Cancel</button></div></div></div>}{message&&<p role="status" className="guest-message">{message}</p>}
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
  else{const result=data as {pin?:string}|null;setActive(true);setPin(result?.pin||'');setMessage('Table activated. Share the six-digit code with the customer.')}
 }
 return <div style={{marginTop:10,padding:12,borderRadius:10,background:active?'#ecfdf5':'#f5f5f4',border:'1px solid '+(active?'#a7f3d0':'#e7e5e4')}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><b>{active?'Ordering session active':'Ordering session closed'}</b><button type="button" onClick={()=>void toggleSession()} disabled={busy} style={{padding:'8px 11px',border:0,borderRadius:8,background:active?'#fee2e2':'#047857',color:active?'#991b1b':'#fff',fontSize:12,fontWeight:700}}>{busy?'Please wait…':active?'End table session':'Activate table & show code'}</button></div>
  {active&&pin&&<div style={{marginTop:10}}><small style={{display:'block',color:'#047857',fontWeight:700}}>CUSTOMER ACTIVATION CODE</small><b style={{fontSize:25,letterSpacing:5,color:'#065f46'}}>{pin}</b><p style={{fontSize:11,margin:'4px 0 0',color:'#475569'}}>Share this code with the customer. It stays valid until you end the session.</p></div>}
  {message&&<p role="status" style={{fontSize:11,margin:'8px 0 0',color:'#475569'}}>{message}</p>}
 </div>
}
