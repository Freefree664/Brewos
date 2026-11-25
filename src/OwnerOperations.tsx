import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { ChefHat, ClipboardList, Users, BarChart3, Gift, RefreshCw, Clock3, Search } from 'lucide-react'

type Cafe = { id:string; name:string }
type Branch = { id:string; name:string }
type Staff = { id:string; full_name:string; phone:string|null; role:string; active:boolean; branch_id:string|null }
type OrderItem = { id:string; item_name_snapshot:string; quantity:number }
type Order = { id:string; order_number:number; status:string; order_type:string; total_paise:number; created_at:string; customer_name:string|null; customer_phone:string|null; table_id:string|null; order_items:OrderItem[] }
type DiningTable = { id:string; table_name:string; assigned_waiter_id:string|null }
type Loyalty = { id:string; customer_name:string; customer_phone:string; points_balance:number; total_orders:number; total_spend_paise:number }

const money=(paise:number)=>'₹'+(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})
const roleNames=['waiter','kitchen','manager','cashier']
const tabs=[['kitchen','Kitchen display',ChefHat],['waiter','Waiter floor',ClipboardList],['staff','Staff & shifts',Users],['analytics','Analytics',BarChart3],['loyalty','Customer loyalty',Gift]] as const

export default function OwnerOperations({cafes}:{cafes:Cafe[]}) {
 const [tab,setTab]=useState<(typeof tabs)[number][0]>('kitchen')
 const [cafeId,setCafeId]=useState('')
 const [branches,setBranches]=useState<Branch[]>([])
 const [branchId,setBranchId]=useState('')
 const [staff,setStaff]=useState<Staff[]>([])
 const [orders,setOrders]=useState<Order[]>([])
 const [tables,setTables]=useState<DiningTable[]>([])
 const [loyalty,setLoyalty]=useState<Loyalty[]>([])
 const [loading,setLoading]=useState(false)
 const [message,setMessage]=useState('')
 const [staffName,setStaffName]=useState('')
 const [staffPhone,setStaffPhone]=useState('')
 const [staffRole,setStaffRole]=useState('waiter')
 const [staffBranch,setStaffBranch]=useState('')
 const [busy,setBusy]=useState(false)
 const [shiftStaff,setShiftStaff]=useState('')
 const [shiftStart,setShiftStart]=useState('')
 const [shiftEnd,setShiftEnd]=useState('')
 const [loyaltySearch,setLoyaltySearch]=useState('')
 const [redeemAccount,setRedeemAccount]=useState('')
 const [redeemPoints,setRedeemPoints]=useState('')

 useEffect(()=>{if(!cafeId&&cafes.length)setCafeId(cafes[0].id)},[cafes,cafeId])
 useEffect(()=>{
  if(!supabase||!cafeId){setBranches([]);setBranchId('');return}
  let live=true
  void supabase.from('branches').select('id,name').eq('cafe_id',cafeId).eq('active',true).order('created_at').then(({data,error})=>{
   if(!live)return
   if(error){setMessage(error.message);return}
   const rows=(data||[]) as Branch[]
   setBranches(rows);setBranchId(old=>rows.some(x=>x.id===old)?old:(rows[0]?.id||''))
  })
  return()=>{live=false}
 },[cafeId])
 useEffect(()=>{void refresh()},[cafeId,branchId])
 useEffect(()=>{
  if(!supabase||!cafeId||!branchId)return
  const channel=supabase.channel('brewos-operations-'+cafeId+'-'+branchId)
   .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:'cafe_id=eq.'+cafeId},()=>void refresh())
   .subscribe()
  const timer=window.setInterval(()=>void refresh(),12000)
  return()=>{window.clearInterval(timer);void supabase?.removeChannel(channel)}
 },[cafeId,branchId])

 async function refresh(){
  if(!supabase||!cafeId||!branchId)return
  setLoading(true);setMessage('')
  const results=await Promise.all([
   supabase.from('staff_members').select('id,full_name,phone,role,active,branch_id').eq('cafe_id',cafeId).order('full_name'),
   supabase.from('orders').select('id,order_number,status,order_type,total_paise,created_at,customer_name,customer_phone,table_id,order_items(id,item_name_snapshot,quantity)').eq('cafe_id',cafeId).eq('branch_id',branchId).order('created_at',{ascending:false}).limit(300),
   supabase.from('dining_tables').select('id,table_name,assigned_waiter_id').eq('cafe_id',cafeId).eq('branch_id',branchId).eq('active',true).order('created_at'),
   supabase.from('customer_loyalty_accounts').select('id,customer_name,customer_phone,points_balance,total_orders,total_spend_paise').eq('cafe_id',cafeId).order('updated_at',{ascending:false}).limit(250)
  ])
  setLoading(false)
  const err=results.find(x=>x.error)?.error
  if(err){setMessage(err.message);return}
  setStaff((results[0].data||[]) as Staff[])
  setOrders((results[1].data||[]) as unknown as Order[])
  setTables((results[2].data||[]) as DiningTable[])
  setLoyalty((results[3].data||[]) as Loyalty[])
 }
 const activeOrders=useMemo(()=>orders.filter(o=>!['completed','cancelled'].includes(o.status)),[orders])
 const kitchenOrders=useMemo(()=>activeOrders.filter(o=>['pending','accepted','preparing','ready'].includes(o.status)),[activeOrders])
 const filteredLoyalty=useMemo(()=>loyalty.filter(x=>(x.customer_name+' '+x.customer_phone).toLowerCase().includes(loyaltySearch.toLowerCase().trim())),[loyalty,loyaltySearch])
 const todayOrders=orders.filter(o=>new Date(o.created_at).toDateString()===new Date().toDateString())
 const completed=todayOrders.filter(o=>o.status==='completed')
 const totalValue=completed.reduce((s,o)=>s+Number(o.total_paise||0),0)
 const topItems=useMemo(()=>{
  const counts=new Map<string,number>()
  for(const order of orders)for(const item of order.order_items||[])counts.set(item.item_name_snapshot,(counts.get(item.item_name_snapshot)||0)+item.quantity)
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
 },[orders])
 const hourCounts=useMemo(()=>{
  const counts=Array.from({length:24},()=>0)
  for(const o of orders)counts[new Date(o.created_at).getHours()]++
  return counts
 },[orders])
 const maxHour=Math.max(1,...hourCounts)

 async function addStaff(e:React.FormEvent){
  e.preventDefault()
  if(!supabase||!cafeId||!staffName.trim())return
  setBusy(true);setMessage('')
  const {error}=await supabase.from('staff_members').insert({cafe_id:cafeId,branch_id:staffBranch||branchId,full_name:staffName.trim(),phone:staffPhone.trim()||null,role:staffRole})
  setBusy(false)
  if(error){setMessage(error.message);return}
  setStaffName('');setStaffPhone('');setMessage('Staff member added.');await refresh()
 }
 async function toggleStaff(person:Staff){
  if(!supabase)return
  setBusy(true);const {error}=await supabase.from('staff_members').update({active:!person.active}).eq('id',person.id).eq('cafe_id',cafeId)
  setBusy(false);if(error)setMessage(error.message);else await refresh()
 }
 async function createShift(e:React.FormEvent){
  e.preventDefault()
  if(!supabase||!shiftStaff||!shiftStart||!shiftEnd)return
  setBusy(true);const {error}=await supabase.from('staff_shifts').insert({cafe_id:cafeId,branch_id:branchId,staff_id:shiftStaff,starts_at:new Date(shiftStart).toISOString(),ends_at:new Date(shiftEnd).toISOString()})
  setBusy(false);if(error)setMessage(error.message);else{setMessage('Shift saved.');setShiftStart('');setShiftEnd('')}
 }
 async function attendance(person:Staff,kind:'in'|'out'){
  if(!supabase)return
  setBusy(true);setMessage('')
  if(kind==='in'){
   const {error}=await supabase.from('staff_attendance').insert({cafe_id:cafeId,staff_id:person.id,check_in_at:new Date().toISOString()})
   if(error)setMessage(error.message);else setMessage(person.full_name+' checked in.')
  }else{
   const {data,error}=await supabase.from('staff_attendance').select('id').eq('cafe_id',cafeId).eq('staff_id',person.id).is('check_out_at',null).order('check_in_at',{ascending:false}).limit(1).maybeSingle()
   if(error)setMessage(error.message)
   else if(!data)setMessage('No open attendance session found.')
   else{const result=await supabase.from('staff_attendance').update({check_out_at:new Date().toISOString()}).eq('id',data.id);setMessage(result.error?.message||person.full_name+' checked out.')}
  }
  setBusy(false)
 }
 async function setOrderStatus(order:Order,status:string){
  if(!supabase)return
  setBusy(true);const {error}=await supabase.from('orders').update({status}).eq('id',order.id).eq('cafe_id',cafeId)
  setBusy(false);if(error)setMessage(error.message);else await refresh()
 }
 async function assignWaiter(table:DiningTable,staffId:string){
  if(!supabase)return
  setBusy(true);const {error}=await supabase.from('dining_tables').update({assigned_waiter_id:staffId||null}).eq('id',table.id).eq('cafe_id',cafeId)
  setBusy(false);if(error)setMessage(error.message);else await refresh()
 }
 async function redeem(){
  if(!supabase||!redeemAccount)return
  const points=Math.floor(Number(redeemPoints))
  if(!Number.isFinite(points)||points<=0){setMessage('Enter a valid number of points.');return}
  setBusy(true);const {error}=await supabase.rpc('redeem_customer_loyalty_points',{p_account_id:redeemAccount,p_points:points})
  setBusy(false);if(error)setMessage(error.message);else{setMessage('Reward redemption recorded.');setRedeemPoints('');await refresh()}
 }

 return <section style={{marginTop:24,border:'1px solid #e7e5e4',borderRadius:18,background:'#fff',padding:18}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
   <div><span style={{fontSize:10,fontWeight:800,letterSpacing:1.4,color:'#047857'}}>BREWOS OPERATIONS SUITE</span><h2 style={{fontSize:21,margin:'5px 0'}}>Service & growth workspace</h2><p style={{fontSize:12,color:'#78716c',margin:0}}>Kitchen, floor, team, performance and returning guests.</p></div>
   <button type="button" className="outline-btn" style={{width:'auto',padding:'9px 12px'}} onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14}/>{loading?'Refreshing':'Refresh'}</button>
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginTop:15}}>
   <label style={{fontSize:11}}>Restaurant<select value={cafeId} onChange={e=>setCafeId(e.target.value)} style={{display:'block',width:'100%',padding:10,border:'1px solid #d6d3d1',borderRadius:8,marginTop:5,background:'#fff'}}><option value="">Choose restaurant</option>{cafes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label style={{fontSize:11}}>Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)} style={{display:'block',width:'100%',padding:10,border:'1px solid #d6d3d1',borderRadius:8,marginTop:5,background:'#fff'}}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  </div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:16}}>
   {tabs.map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id)} className={tab===id?'btn':'outline-btn'} style={{width:'auto',padding:'9px 12px',fontSize:11}}><Icon size={14}/>{label}</button>)}
  </div>
  {message&&<p role="status" style={{padding:10,borderRadius:9,background:'#f0fdf4',color:'#166534',fontSize:12,overflowWrap:'anywhere'}}>{message}</p>}
  {!cafeId||!branchId?<p style={{fontSize:12,color:'#78716c',padding:18}}>Select an approved restaurant and branch to load operations.</p>:<>
  {tab==='kitchen'&&<div style={{marginTop:18}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><h3 style={{margin:0,fontSize:17}}>Kitchen display · {kitchenOrders.length} active</h3><span style={{fontSize:11,color:'#78716c'}}>Auto-refreshes every 12 seconds</span></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:12,marginTop:12}}>
    {kitchenOrders.map(order=>{const age=Math.max(0,Math.floor((Date.now()-new Date(order.created_at).getTime())/60000));return <article key={order.id} style={{border:'1px solid #e7e5e4',borderRadius:14,padding:14,borderTop:'4px solid '+(age>=15?'#dc2626':order.status==='ready'?'#059669':'#d97706')}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b style={{fontSize:16}}>Order #{order.order_number}</b><span style={{fontSize:10,fontWeight:800,color:age>=15?'#b91c1c':'#78716c'}}><Clock3 size={12} style={{display:'inline',verticalAlign:'middle'}}/> {age} min</span></div>
     <p style={{fontSize:11,color:'#78716c',margin:'5px 0 10px'}}>{order.order_type.replace('_',' ')} · {new Date(order.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} {age>=15?'· DELAYED':''}</p>
     <div style={{display:'grid',gap:7}}>{(order.order_items||[]).map(item=><div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:13}}><b>{item.quantity} ×</b><span style={{flex:1}}>{item.item_name_snapshot}</span></div>)}</div>
     <div style={{display:'flex',gap:7,marginTop:13}}>{order.status==='pending'&&<button className="btn" style={{flex:1,justifyContent:'center'}} disabled={busy} onClick={()=>void setOrderStatus(order,'accepted')}>Accept</button>}{['pending','accepted'].includes(order.status)&&<button className="btn" style={{flex:1,justifyContent:'center'}} disabled={busy} onClick={()=>void setOrderStatus(order,'preparing')}>Start prep</button>}{order.status==='preparing'&&<button className="btn" style={{flex:1,justifyContent:'center'}} disabled={busy} onClick={()=>void setOrderStatus(order,'ready')}>Mark ready</button>}{order.status==='ready'&&<span style={{fontSize:12,color:'#047857',fontWeight:800,alignSelf:'center'}}>Ready for service</span>}</div>
    </article>})}
    {!kitchenOrders.length&&<p style={{fontSize:12,color:'#78716c',padding:20}}>No active kitchen orders right now.</p>}
   </div>
  </div>}
  {tab==='waiter'&&<div style={{marginTop:18}}>
   <h3 style={{margin:'0 0 5px',fontSize:17}}>Waiter floor · table overview</h3><p style={{fontSize:11,color:'#78716c'}}>Table status is derived from its latest active order. Assign a waiter to each table.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:11,marginTop:12}}>
    {tables.map(table=>{const order=orders.filter(o=>o.table_id===table.id&&!['completed','cancelled'].includes(o.status)).sort((a,b)=>+new Date(b.created_at)-+new Date(a.created_at))[0];const assigned=staff.find(s=>s.id===table.assigned_waiter_id);return <article key={table.id} style={{border:'1px solid #e7e5e4',borderRadius:13,padding:13,background:order?'#fffbeb':'#f0fdf4'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{table.table_name}</b><span style={{fontSize:10,fontWeight:800,color:order?'#92400e':'#166534'}}>{order?order.status.toUpperCase():'AVAILABLE'}</span></div>
     {order&&<p style={{fontSize:11,margin:'7px 0'}}>Order #{order.order_number} · {money(order.total_paise)}</p>}
     <label style={{display:'grid',gap:5,fontSize:10,marginTop:9}}>Assigned waiter<select value={table.assigned_waiter_id||''} onChange={e=>void assignWaiter(table,e.target.value)} style={{padding:9,border:'1px solid #d6d3d1',borderRadius:8,background:'#fff'}}><option value="">Unassigned</option>{staff.filter(s=>s.active&&s.role==='waiter').map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
     {assigned&&<small style={{color:'#78716c',display:'block',marginTop:6}}>Assigned to {assigned.full_name}</small>}
    </article>})}
    {!tables.length&&<p style={{fontSize:12,color:'#78716c'}}>No active tables in this branch. Create tables in Tables & QR setup.</p>}
   </div>
   <h4 style={{fontSize:14,marginTop:20}}>Unassigned active orders</h4>
   {activeOrders.filter(o=>!o.table_id).slice(0,10).map(o=><p key={o.id} style={{fontSize:12,borderBottom:'1px solid #eee',padding:'7px 0'}}>#{o.order_number} · {o.order_type} · {o.status}</p>)}
  </div>}
  {tab==='staff'&&<div style={{marginTop:18}}>
   <h3 style={{margin:'0 0 10px',fontSize:17}}>Staff directory & attendance</h3>
   <form onSubmit={addStaff} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:9,padding:13,background:'#f8faf9',borderRadius:12}}>
    <input required value={staffName} onChange={e=>setStaffName(e.target.value)} maxLength={100} placeholder="Staff full name" style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/>
    <input value={staffPhone} onChange={e=>setStaffPhone(e.target.value)} maxLength={20} placeholder="Phone (optional)" style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/>
    <select value={staffRole} onChange={e=>setStaffRole(e.target.value)} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}>{roleNames.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</select>
    <select value={staffBranch||branchId} onChange={e=>setStaffBranch(e.target.value)} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
    <button className="btn" disabled={busy}>Add staff member</button>
   </form>
   <div style={{display:'grid',gap:8,marginTop:12}}>{staff.map(person=><article key={person.id} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:11,border:'1px solid #e7e5e4',borderRadius:10}}>
    <div style={{flex:1,minWidth:130}}><b style={{fontSize:13}}>{person.full_name}</b><div style={{fontSize:10,color:'#78716c'}}>{person.role} · {person.phone||'No phone'} · {person.active?'Active':'Inactive'}</div></div>
    <button type="button" className="outline-btn" style={{width:'auto',padding:'7px 10px'}} disabled={busy||!person.active} onClick={()=>void attendance(person,'in')}>Check in</button>
    <button type="button" className="outline-btn" style={{width:'auto',padding:'7px 10px'}} disabled={busy} onClick={()=>void attendance(person,'out')}>Check out</button>
    <button type="button" className="outline-btn" style={{width:'auto',padding:'7px 10px'}} disabled={busy} onClick={()=>void toggleStaff(person)}>{person.active?'Deactivate':'Reactivate'}</button>
   </article>)}</div>
   <form onSubmit={createShift} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:9,marginTop:16,padding:13,border:'1px solid #e7e5e4',borderRadius:12}}>
    <b style={{gridColumn:'1/-1',fontSize:13}}>Schedule a shift</b>
    <select required value={shiftStaff} onChange={e=>setShiftStaff(e.target.value)} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}><option value="">Select staff</option>{staff.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
    <input required type="datetime-local" value={shiftStart} onChange={e=>setShiftStart(e.target.value)} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/>
    <input required type="datetime-local" value={shiftEnd} onChange={e=>setShiftEnd(e.target.value)} style={{padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/>
    <button className="btn" disabled={busy}>Save shift</button>
   </form>
   <p style={{fontSize:10,color:'#78716c',marginTop:10}}>Staff profiles, roles, shifts and attendance are managed here. Staff login accounts and per-user permission enforcement require separate invitations/authentication.</p>
  </div>}
  {tab==='analytics'&&<div style={{marginTop:18}}>
   <h3 style={{margin:'0 0 5px',fontSize:17}}>Sales & service analytics</h3><p style={{fontSize:11,color:'#78716c'}}>Based on the latest 300 orders for this branch. Revenue shown is completed order value, not independently verified payment settlement.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginTop:12}}>
    {[['Orders today',todayOrders.length],['Completed today',completed.length],['Completed value today',money(totalValue)],['Average completed bill',completed.length?money(Math.round(totalValue/completed.length)):'₹0']].map(([label,value])=><div key={String(label)} style={{padding:14,border:'1px solid #e7e5e4',borderRadius:12}}><small style={{color:'#78716c'}}>{label}</small><b style={{display:'block',fontSize:20,marginTop:7}}>{value}</b></div>)}
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:15,marginTop:16}}>
    <div style={{padding:14,border:'1px solid #e7e5e4',borderRadius:12}}><b style={{fontSize:13}}>Popular menu items</b>{topItems.map(([name,count])=><div key={name} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,padding:'9px 0',borderBottom:'1px solid #f1f5f9'}}><span>{name}</span><b>{count} sold</b></div>)}{!topItems.length&&<p style={{fontSize:11,color:'#78716c'}}>No order items yet.</p>}</div>
    <div style={{padding:14,border:'1px solid #e7e5e4',borderRadius:12}}><b style={{fontSize:13}}>Orders by hour</b><div style={{display:'flex',alignItems:'end',gap:3,height:120,marginTop:15}}>{hourCounts.map((n,h)=><div key={h} title={h+':00 · '+n+' orders'} style={{flex:1,minWidth:3,height:(n/maxHour*100)+'%',background:'#059669',borderRadius:'3px 3px 0 0',opacity:n?1:.16}}/>)}</div><div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#78716c',marginTop:6}}><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div></div>
   </div>
  </div>}
  {tab==='loyalty'&&<div style={{marginTop:18}}>
   <h3 style={{margin:'0 0 5px',fontSize:17}}>Customer loyalty</h3><p style={{fontSize:11,color:'#78716c'}}>Customers earn 1 point per ₹10 on completed orders when a phone number is attached. Redeem points at the counter.</p>
   <label style={{display:'flex',gap:8,alignItems:'center',margin:'12px 0'}}><Search size={16}/><input value={loyaltySearch} onChange={e=>setLoyaltySearch(e.target.value)} placeholder="Search customer name or phone" style={{flex:1,padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/></label>
   <div style={{display:'grid',gap:8}}>{filteredLoyalty.map(customer=><article key={customer.id} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:12,border:'1px solid #e7e5e4',borderRadius:11}}>
    <div style={{flex:1,minWidth:150}}><b style={{fontSize:13}}>{customer.customer_name}</b><div style={{fontSize:10,color:'#78716c'}}>{customer.customer_phone} · {customer.total_orders} orders · {money(customer.total_spend_paise)} spend</div></div><b style={{color:'#047857'}}>{customer.points_balance} pts</b><button type="button" className="outline-btn" style={{width:'auto',padding:'7px 10px'}} onClick={()=>setRedeemAccount(customer.id)}>Redeem</button>
   </article>)}</div>
   {redeemAccount&&<form onSubmit={e=>{e.preventDefault();void redeem()}} style={{display:'flex',gap:8,flexWrap:'wrap',padding:13,background:'#f0fdf4',borderRadius:11,marginTop:12}}><input type="number" min="1" value={redeemPoints} onChange={e=>setRedeemPoints(e.target.value)} placeholder="Points to redeem" style={{flex:1,minWidth:120,padding:10,border:'1px solid #d6d3d1',borderRadius:8}}/><button className="btn" disabled={busy}>Confirm redemption</button><button type="button" className="outline-btn" style={{width:'auto'}} onClick={()=>setRedeemAccount('')}>Cancel</button></form>}
   {!filteredLoyalty.length&&<p style={{fontSize:12,color:'#78716c'}}>No loyalty customers yet. Customers are added after a completed order with a phone number.</p>}
  </div>}
  </>}
 </section>
}
