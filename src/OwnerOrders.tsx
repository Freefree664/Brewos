import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { Bell, CheckCircle2, ChefHat, Clock3, RefreshCw, Search, ShoppingBag, Utensils, XCircle } from 'lucide-react'

type Cafe = { id: string; name: string }
type Branch = { id: string; name: string }
type OrderItem = { id: string; item_name_snapshot: string; quantity: number; unit_price_paise: number; line_total_paise: number }
type Order = { id: string; order_number: number; order_type: string; status: string; notes: string | null; subtotal_paise: number; tax_paise: number; total_paise: number; created_at: string; table_id: string | null; order_items: OrderItem[] }
const statuses = ['pending','accepted','preparing','ready','served','completed','cancelled']
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
const tone: Record<string,string> = {pending:'amber',accepted:'blue',preparing:'violet',ready:'teal',served:'green',completed:'green',cancelled:'rose'}
const label = (s:string) => s.charAt(0).toUpperCase()+s.slice(1)

export default function OwnerOrders({cafes}:{cafes:Cafe[]}) {
 const [cafeId,setCafeId]=useState(''),[branches,setBranches]=useState<Branch[]>([]),[branchId,setBranchId]=useState('')
 const [orders,setOrders]=useState<Order[]>([]),[loading,setLoading]=useState(false),[busyId,setBusyId]=useState('')
 const [message,setMessage]=useState(''),[liveMessage,setLiveMessage]=useState(''),[filter,setFilter]=useState('active'),[search,setSearch]=useState('')
 const [notificationPermission,setNotificationPermission]=useState<NotificationPermission>(()=>typeof Notification==='undefined'?'denied':Notification.permission)
 const known=useRef<Set<string>>(new Set()),initial=useRef(false)

 useEffect(()=>{
  if(!cafeId||!supabase){setBranches([]);setBranchId('');setOrders([]);return}
  let active=true
  void (async()=>{const {data,error}=await supabase.from('branches').select('id,name').eq('cafe_id',cafeId).eq('active',true).order('created_at')
   if(!active)return
   if(error){setMessage(error.message);return}
   const rows=(data||[]) as Branch[];setBranches(rows);setBranchId(old=>rows.some(x=>x.id===old)?old:(rows[0]?.id||''))
  })()
  return()=>{active=false}
 },[cafeId])

 useEffect(()=>{
  const client=supabase
  if(!cafeId||!branchId||!client){setOrders([]);known.current=new Set();initial.current=false;return}
  initial.current=false;known.current=new Set();void loadOrders(false)
  const channel=client.channel('owner-orders-'+cafeId+'-'+branchId).on('postgres_changes',{event:'INSERT',schema:'public',table:'orders',filter:'cafe_id=eq.'+cafeId},payload=>{
   const row=payload.new as {id?:string;branch_id?:string;order_number?:number}
   if(row.branch_id!==branchId||!row.id||known.current.has(row.id))return
   known.current.add(row.id);const notice='New order #'+(row.order_number||'')+' received';setLiveMessage(notice)
   if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('BrewOS · New order',{body:notice})
   void loadOrders(false)
  }).subscribe()
  const timer=window.setInterval(()=>void loadOrders(true),15000)
  return()=>{window.clearInterval(timer);void client.removeChannel(channel)}
 },[cafeId,branchId])

 async function loadOrders(notifyNew=false){
  if(!supabase||!cafeId||!branchId)return
  setLoading(true);setMessage('')
  const {data,error}=await supabase.from('orders').select('id,order_number,order_type,status,notes,subtotal_paise,tax_paise,total_paise,created_at,table_id,order_items(id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)').eq('cafe_id',cafeId).eq('branch_id',branchId).order('created_at',{ascending:false}).limit(100)
  setLoading(false);if(error){setMessage(error.message);return}
  const rows=(data||[]) as unknown as Order[]
  if(initial.current&&notifyNew){const fresh=rows.filter(x=>!known.current.has(x.id));if(fresh.length){const notice='New order #'+fresh[0].order_number+' received';setLiveMessage(notice);if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('BrewOS · New order',{body:notice})}}
  known.current=new Set(rows.map(x=>x.id));initial.current=true;setOrders(rows)
 }
 async function enableNotifications(){
  if(typeof Notification==='undefined'){setMessage('Browser notifications are not supported on this device.');return}
  const permission=await Notification.requestPermission();setNotificationPermission(permission)
  if(permission==='granted')setLiveMessage('New-order alerts are enabled on this device.')
  else setMessage('Notifications were not enabled. Orders will still appear here.')
 }
 async function updateStatus(order:Order,status:string){
  if(!supabase)return
  setBusyId(order.id);setMessage('')
  const {error}=await supabase.from('orders').update({status}).eq('id',order.id).eq('cafe_id',cafeId)
  setBusyId('');if(error){setMessage(error.message);return}
  setOrders(rows=>rows.map(x=>x.id===order.id?{...x,status}:x));setLiveMessage('Order #'+order.order_number+' moved to '+label(status))
 }
 const counts=useMemo(()=>({all:orders.length,new:orders.filter(x=>x.status==='pending').length,preparing:orders.filter(x=>['accepted','preparing'].includes(x.status)).length,ready:orders.filter(x=>['ready','served'].includes(x.status)).length}),[orders])
 const visible=useMemo(()=>orders.filter(order=>{
  const matches=filter==='all'||(filter==='active'?!['completed','cancelled'].includes(order.status):filter==='history'?['completed','cancelled'].includes(order.status):order.status===filter)
  const hay=[String(order.order_number),order.order_type,order.status,...(order.order_items||[]).map(x=>x.item_name_snapshot)].join(' ').toLowerCase()
  return matches&&hay.includes(search.toLowerCase().trim())
 }),[orders,filter,search])

 return <section className="orders-workspace">
  <header className="orders-heading"><div><span className="workspace-kicker">LIVE SERVICE</span><h2>Order command centre</h2><p>Every guest order, organised from arrival to completion.</p></div><div className="orders-heading-actions">
   <button type="button" className="orders-notify" onClick={()=>void enableNotifications()} disabled={notificationPermission==='granted'||typeof Notification==='undefined'}><Bell size={15}/>{notificationPermission==='granted'?'Alerts on':'Enable alerts'}</button>
   <button type="button" className="orders-refresh" onClick={()=>void loadOrders(false)} disabled={loading||!branchId}><RefreshCw size={15} className={loading?'spin':''}/>{loading?'Refreshing':'Refresh'}</button>
  </div></header>
  <div className="orders-selectors"><label>Restaurant<select value={cafeId} onChange={e=>setCafeId(e.target.value)}><option value="">Choose restaurant</option>{cafes.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   {cafeId&&<label>Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   <div className="orders-sync"><span className="sync-dot"/>Live updates · backup refresh every 15 sec</div>
  </div>
  {liveMessage&&<div className="orders-live-message" role="status"><CheckCircle2 size={16}/>{liveMessage}<button type="button" aria-label="Dismiss" onClick={()=>setLiveMessage('')}><XCircle size={15}/></button></div>}
  {cafeId&&branchId&&<>
   <div className="orders-metrics">
    <div className="metric-card metric-purple"><span>Total orders</span><b>{counts.all}</b><ShoppingBag size={21}/></div>
    <div className="metric-card metric-orange"><span>New orders</span><b>{counts.new}</b><Clock3 size={21}/></div>
    <div className="metric-card metric-blue"><span>In preparation</span><b>{counts.preparing}</b><ChefHat size={21}/></div>
    <div className="metric-card metric-green"><span>Ready to serve</span><b>{counts.ready}</b><Utensils size={21}/></div>
   </div>
   <div className="orders-toolbar"><div className="orders-tabs">{[['active','Active'],['pending','New'],['preparing','Preparing'],['ready','Ready'],['history','History'],['all','All']].map(([value,text])=><button type="button" key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{text}</button>)}</div>
    <label className="orders-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order or item…"/></label>
   </div>
   {loading&&orders.length===0&&<div className="orders-empty">Loading orders…</div>}
   {!loading&&visible.length===0&&<div className="orders-empty"><div className="orders-empty-icon"><ShoppingBag size={25}/></div><b>{orders.length?'No orders match this view':'Your order inbox is clear'}</b><p>{orders.length?'Try another filter or search term.':'New customer orders will appear here automatically.'}</p></div>}
   <div className="orders-grid">{visible.map(order=><article className="order-card" key={order.id}>
    <div className="order-card-top"><div><span className="order-number">ORDER #{order.order_number}</span><div className="order-time">{new Date(order.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</div></div><span className={'status-pill tone-'+(tone[order.status]||'blue')}>{label(order.status)}</span></div>
    <div className="order-type-line"><span className="order-type-icon"><Utensils size={15}/></span>{order.order_type.replace('_',' ')}{order.table_id?' · Table order':''}</div>
    <div className="order-items-list">{(order.order_items||[]).map(item=><div className="order-item-row" key={item.id}><span><b>{item.quantity}×</b> {item.item_name_snapshot}</span><strong>{money(item.line_total_paise)}</strong></div>)}</div>
    {order.notes&&<div className="order-note"><b>Kitchen note</b><span>{order.notes}</span></div>}
    <div className="order-total-row"><span>Order total</span><b>{money(order.total_paise)}</b></div>
    <div className="order-card-footer"><label>Update order status<select value={order.status} onChange={e=>void updateStatus(order,e.target.value)} disabled={busyId===order.id}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>{busyId===order.id&&<span className="saving-label">Saving…</span>}</div>
   </article>)}</div>
  </>}
  {!cafeId&&<div className="orders-empty"><div className="orders-empty-icon"><ShoppingBag size={25}/></div><b>Select your restaurant to see orders</b><p>Choose a restaurant above to load its latest orders.</p></div>}
  {message&&<p role="alert" className="orders-error">{message}</p>}
 </section>
}
