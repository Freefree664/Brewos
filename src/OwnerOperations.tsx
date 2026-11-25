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
type Shift = { id:string; staff_id:string; starts_at:string; ends_at:string }
type Attendance = { id:string; staff_id:string; check_in_at:string; check_out_at:string|null }
type LeaveRequest = { id:string; staff_id:string; starts_on:string; ends_on:string; reason:string; status:string }

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
 const [shifts,setShifts]=useState<Shift[]>([])
 const [attendanceRows,setAttendanceRows]=useState<Attendance[]>([])
 const [leaveRequests,setLeaveRequests]=useState<LeaveRequest[]>([])
 const [leaveStaff,setLeaveStaff]=useState('')
 const [leaveStart,setLeaveStart]=useState('')
 const [leaveEnd,setLeaveEnd]=useState('')
 const [leaveReason,setLeaveReason]=useState('')
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
 const [analyticsRange,setAnalyticsRange]=useState<'today'|'7days'|'30days'|'year'>('7days')

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
   supabase.from('orders').select('id,order_number,status,order_type,total_paise,created_at,customer_name,customer_phone,table_id,order_items(id,item_name_snapshot,quantity)').eq('cafe_id',cafeId).eq('branch_id',branchId).order('created_at',{ascending:false}).limit(1000),
   supabase.from('dining_tables').select('id,table_name,assigned_waiter_id').eq('cafe_id',cafeId).eq('branch_id',branchId).eq('active',true).order('created_at'),
   supabase.from('customer_loyalty_accounts').select('id,customer_name,customer_phone,points_balance,total_orders,total_spend_paise').eq('cafe_id',cafeId).order('updated_at',{ascending:false}).limit(250),
   supabase.from('staff_shifts').select('id,staff_id,starts_at,ends_at').eq('cafe_id',cafeId).eq('branch_id',branchId).gte('ends_at',new Date().toISOString()).order('starts_at').limit(30),
   supabase.from('staff_attendance').select('id,staff_id,check_in_at,check_out_at').eq('cafe_id',cafeId).order('check_in_at',{ascending:false}).limit(30),
   supabase.from('staff_leave_requests').select('id,staff_id,starts_on,ends_on,reason,status').eq('cafe_id',cafeId).order('created_at',{ascending:false}).limit(50)
  ])
  setLoading(false)
  const err=results.find(x=>x.error)?.error
  if(err){setMessage(err.message);return}
  setStaff((results[0].data||[]) as Staff[])
  setOrders((results[1].data||[]) as unknown as Order[])
  setTables((results[2].data||[]) as DiningTable[])
  setLoyalty((results[3].data||[]) as Loyalty[])
  setShifts((results[4].data||[]) as Shift[])
  setAttendanceRows((results[5].data||[]) as Attendance[])
  setLeaveRequests((results[6].data||[]) as LeaveRequest[])
 }
 const activeOrders=useMemo(()=>orders.filter(o=>!['completed','cancelled'].includes(o.status)),[orders])
 const kitchenOrders=useMemo(()=>activeOrders.filter(o=>['pending','accepted','preparing','ready'].includes(o.status)),[activeOrders])
 const filteredLoyalty=useMemo(()=>loyalty.filter(x=>(x.customer_name+' '+x.customer_phone).toLowerCase().includes(loyaltySearch.toLowerCase().trim())),[loyalty,loyaltySearch])
 const rangeStart=new Date()
 if(analyticsRange==='today')rangeStart.setHours(0,0,0,0)
 else if(analyticsRange==='7days')rangeStart.setDate(rangeStart.getDate()-7)
 else if(analyticsRange==='30days')rangeStart.setDate(rangeStart.getDate()-30)
 else rangeStart.setFullYear(rangeStart.getFullYear()-1)
 const rangeOrders=orders.filter(o=>new Date(o.created_at)>=rangeStart)
 const completed=rangeOrders.filter(o=>o.status==='completed')
 const totalValue=completed.reduce((s,o)=>s+Number(o.total_paise||0),0)
 const topItems=useMemo(()=>{
  const counts=new Map<string,number>()
  for(const order of rangeOrders)for(const item of order.order_items||[])counts.set(item.item_name_snapshot,(counts.get(item.item_name_snapshot)||0)+item.quantity)
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
 },[rangeOrders])
 const hourCounts=useMemo(()=>{
  const counts=Array.from({length:24},()=>0)
  for(const o of rangeOrders)counts[new Date(o.created_at).getHours()]++
  return counts
 },[rangeOrders])
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
 async function createLeave(e:React.FormEvent){
  e.preventDefault()
  if(!supabase||!leaveStaff||!leaveStart||!leaveEnd||!leaveReason.trim())return
  setBusy(true);const {error}=await supabase.from('staff_leave_requests').insert({cafe_id:cafeId,staff_id:leaveStaff,starts_on:leaveStart,ends_on:leaveEnd,reason:leaveReason.trim()})
  setBusy(false);if(error)setMessage(error.message);else{setMessage('Leave request added for review.');setLeaveReason('');await refresh()}
 }
 async function reviewLeave(request:LeaveRequest,status:'approved'|'rejected'){
  if(!supabase)return
  setBusy(true);const {error}=await supabase.from('staff_leave_requests').update({status,reviewed_at:new Date().toISOString()}).eq('id',request.id).eq('cafe_id',cafeId)
  setBusy(false);if(error)setMessage(error.message);else await refresh()
 }
 function exportAttendance(){
  const rows=[['Staff','Check in','Check out','Minutes'],...attendanceRows.map(row=>{const start=new Date(row.check_in_at),end=row.check_out_at?new Date(row.check_out_at):new Date();return [staff.find(s=>s.id===row.staff_id)?.full_name||'Staff',start.toISOString(),row.check_out_at?end.toISOString():'Open',String(Math.max(0,Math.round((end.getTime()-start.getTime())/60000)))]})]
  const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='brewos-attendance-report.csv';link.click();URL.revokeObjectURL(url)
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
 function exportAnalytics(){
  const rows=[['Order number','Status','Order type','Created at','Total rupees'],...rangeOrders.map(o=>[String(o.order_number),o.status,o.order_type,new Date(o.created_at).toISOString(),(o.total_paise/100).toFixed(2)])]
  const csv=rows.map(row=>row.map(value=>'\"'+String(value).replace(/\"/g,'\"\"')+'\"').join(',')).join('\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='brewos-analytics.csv';link.click();URL.revokeObjectURL(url)
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
  {tab==='kitchen'&&<div id='brewos-kitchen-display' style={{marginTop:18,background:'#fff',padding:4}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><h3 style={{margin:0,fontSize:17}}>Kitchen display · {kitchenOrders.length} active</h3><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:11,color:'#78716c'}}>Auto-refreshes every 12 seconds</span><button type='button' className='outline-btn' style={{width:'auto',padding:'7px 9px'}} onClick={()=>{const el=document.getElementById('brewos-kitchen-display');if(el?.requestFullscreen)void el.requestFullscreen().catch(()=>setMessage('Full-screen mode was blocked by this browser.'))}}>Full screen</button></div></div>
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
   <h4 style={{fontSize:14,marginTop:18}}>Upcoming shifts</h4>
   <div style={{display:'grid',gap:7}}>{shifts.map(shift=>{const person=staff.find(s=>s.id===shift.staff_id);return <div key={shift.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:10,border:'1px solid #e7e5e4',borderRadius:9,fontSize:11}}><b>{person?.full_name||'Staff member'}</b><span>{new Date(shift.starts_at).toLocaleString()} – {new Date(shift.ends_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>})}{!shifts.length&&<p style={{fontSize:11,color:'#78716c'}}>No upcoming shifts scheduled.</p>}</div>
   <h4 style={{fontSize:14,marginTop:18}}>Leave management</h4>
   <form onSubmit={createLeave} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,padding:12,border:'1px solid #e7e5e4',borderRadius:11}}><select required value={leaveStaff} onChange={e=>setLeaveStaff(e.target.value)} style={{padding:9,border:'1px solid #d6d3d1',borderRadius:8}}><option value=''>Select staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select><input required type='date' value={leaveStart} onChange={e=>setLeaveStart(e.target.value)} style={{padding:9,border:'1px solid #d6d3d1',borderRadius:8}}/><input required type='date' min={leaveStart||undefined} value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)} style={{padding:9,border:'1px solid #d6d3d1',borderRadius:8}}/><input required maxLength={500} value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} placeholder='Reason for leave' style={{padding:9,border:'1px solid #d6d3d1',borderRadius:8}}/><button className='btn' disabled={busy}>Add leave request</button></form>
   <div style={{display:'grid',gap:7,marginTop:10}}>{leaveRequests.map(request=><div key={request.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:10,border:'1px solid #e7e5e4',borderRadius:9,fontSize:11}}><div style={{flex:1,minWidth:150}}><b>{staff.find(s=>s.id===request.staff_id)?.full_name||'Staff member'}</b><div>{request.starts_on} – {request.ends_on} · {request.reason}</div></div><b style={{textTransform:'capitalize'}}>{request.status}</b>{request.status==='pending'&&<><button type='button' className='btn' style={{width:'auto',padding:'7px 9px'}} disabled={busy} onClick={()=>void reviewLeave(request,'approved')}>Approve</button><button type='button' className='outline-btn' style={{width:'auto',padding:'7px 9px'}} disabled={busy} onClick={()=>void reviewLeave(request,'rejected')}>Reject</button></>}</div>)}</div>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:18}}><h4 style={{fontSize:14,margin:0}}>Attendance report · latest 30 records</h4><button type='button' className='outline-btn' style={{width:'auto',padding:'7px 9px'}} onClick={exportAttendance}>Export CSV</button></div>
   <div style={{display:'grid',gap:6,marginTop:8}}>{attendanceRows.map(row=>{const start=new Date(row.check_in_at),end=row.check_out_at?new Date(row.check_out_at):new Date();const mins=Math.max(0,Math.round((end.getTime()-start.getTime())/60000));return <div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',padding:9,background:'#f8faf9',borderRadius:8,fontSize:10}}><b>{staff.find(s=>s.id===row.staff_id)?.full_name||'Staff member'}</b><span>{start.toLocaleString()} · {row.check_out_at?Math.floor(mins/60)+'h '+mins%60+'m':'Currently checked in'}</span></div>})}{!attendanceRows.length&&<p style={{fontSize:11,color:'#78716c'}}>No attendance records yet.</p>}</div>
   <p style={{fontSize:10,color:'#78716c',marginTop:10}}>Staff profiles, role labels, shifts, attendance, leave and reports are managed here. Individual staff sign-in accounts and role-restricted app sessions are not yet configured.</p>
  </div>}
  {tab==='analytics'&&<div style={{marginTop:18}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><h3 style={{margin:0,fontSize:17}}>Sales & service analytics</h3><div style={{display:'flex',gap:7}}><select value={analyticsRange} onChange={e=>setAnalyticsRange(e.target.value as typeof analyticsRange)} style={{padding:8,border:'1px solid #d6d3d1',borderRadius:8}}><option value='today'>Today</option><option value='7days'>Last 7 days</option><option value='30days'>Last 30 days</option><option value='year'>Last year</option></select><button type='button' className='outline-btn' style={{width:'auto',padding:'8px 10px'}} onClick={exportAnalytics}>Export CSV</button></div></div><p style={{fontSize:11,color:'#78716c'}}>Based on up to the latest 1,000 orders for this branch. Revenue shown is completed order value, not independently verified payment settlement.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginTop:12}}>
    {[['Orders in range',rangeOrders.length],['Completed orders',completed.length],['Completed value',money(totalValue)],['Average completed bill',completed.length?money(Math.round(totalValue/completed.length)):'₹0']].map(([label,value])=><div key={String(label)} style={{padding:14,border:'1px solid #e7e5e4',borderRadius:12}}><small style={{color:'#78716c'}}>{label}</small><b style={{display:'block',fontSize:20,marginTop:7}}>{value}</b></div>)}
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
