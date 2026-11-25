import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ChefHat, ClipboardList, Clock3, LogOut, RefreshCw, UserRound } from 'lucide-react'

type StaffProfile = { id:string; cafe_id:string; branch_id:string|null; full_name:string; role:string; active:boolean }
type StaffOrder = { id:string; order_number:number; status:string; order_type:string; total_paise:number; created_at:string; table_id:string|null; order_items:Array<{id:string;item_name_snapshot:string;quantity:number}> }
type StaffTable = { id:string; table_name:string; assigned_waiter_id:string|null }

const money=(paise:number)=>'₹'+(paise/100).toLocaleString('en-IN',{maximumFractionDigits:2})

export default function StaffPortal({staff,onSignOut}:{staff:StaffProfile;onSignOut:()=>void}) {
 const [orders,setOrders]=useState<StaffOrder[]>([])
 const [tables,setTables]=useState<StaffTable[]>([])
 const [shifts,setShifts]=useState<Array<{id:string;starts_at:string;ends_at:string}>>([])
 const [attendance,setAttendance]=useState<Array<{id:string;check_in_at:string;check_out_at:string|null}>>([])
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')

 async function refresh(){
  if(!supabase)return
  setLoading(true);setMessage('')
  const [shiftResult,attendanceResult]=await Promise.all([
   supabase.from('staff_shifts').select('id,starts_at,ends_at').eq('staff_id',staff.id).order('starts_at',{ascending:false}).limit(10),
   supabase.from('staff_attendance').select('id,check_in_at,check_out_at').eq('staff_id',staff.id).order('check_in_at',{ascending:false}).limit(10)
  ])
  let tableRows:StaffTable[]=[]
  let orderRows:StaffOrder[]=[]
  if(staff.role==='waiter'){
   const tableResult=await supabase.from('dining_tables').select('id,table_name,assigned_waiter_id').eq('assigned_waiter_id',staff.id).eq('active',true).order('floor_position')
   if(tableResult.error){setMessage(tableResult.error.message);setLoading(false);return}
   tableRows=(tableResult.data||[]) as StaffTable[]
   if(tableRows.length&&staff.branch_id){
    const orderResult=await supabase.from('orders').select('id,order_number,status,order_type,total_paise,created_at,table_id,order_items(id,item_name_snapshot,quantity)').eq('cafe_id',staff.cafe_id).eq('branch_id',staff.branch_id).in('table_id',tableRows.map(t=>t.id)).not('status','in','(completed,cancelled)').order('created_at',{ascending:false}).limit(100)
    if(orderResult.error){setMessage(orderResult.error.message);setLoading(false);return}
    orderRows=(orderResult.data||[]) as unknown as StaffOrder[]
   }
  } else if(staff.branch_id){
   const orderResult=await supabase.from('orders').select('id,order_number,status,order_type,total_paise,created_at,table_id,order_items(id,item_name_snapshot,quantity)').eq('cafe_id',staff.cafe_id).eq('branch_id',staff.branch_id).not('status','in','(completed,cancelled)').order('created_at',{ascending:false}).limit(100)
   if(orderResult.error){setMessage(orderResult.error.message);setLoading(false);return}
   orderRows=(orderResult.data||[]) as unknown as StaffOrder[]
  }
  setTables(tableRows);setOrders(orderRows)
  setShifts((shiftResult.data||[]) as typeof shifts)
  setAttendance((attendanceResult.data||[]) as typeof attendance)
  const err=shiftResult.error||attendanceResult.error
  if(err)setMessage(err.message)
  setLoading(false)
 }

 useEffect(()=>{void refresh()},[staff.id])

 async function punch(kind:'in'|'out'){
  if(!supabase||busy)return
  setBusy(true);setMessage('')
  if(kind==='in'){
   const {error}=await supabase.from('staff_attendance').insert({cafe_id:staff.cafe_id,staff_id:staff.id})
   if(error)setMessage(error.message);else setMessage('You are checked in.')
  }else{
   const open=attendance.find(row=>!row.check_out_at)
   if(!open){setMessage('There is no open check-in to close.');setBusy(false);return}
   const {error}=await supabase.from('staff_attendance').update({check_out_at:new Date().toISOString()}).eq('id',open.id).eq('staff_id',staff.id)
   if(error)setMessage(error.message);else setMessage('You are checked out.')
  }
  setBusy(false);await refresh()
 }

 const isCheckedIn=attendance.some(row=>!row.check_out_at)
 return <main style={{minHeight:'100vh',background:'#f8f7f2',padding:'22px 14px',color:'#292524'}}>
  <section style={{maxWidth:980,margin:'0 auto',background:'#fff',border:'1px solid #e7e5e4',borderRadius:18,padding:18}}>
   <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    <div><small style={{fontWeight:800,letterSpacing:1.3,color:'#047857'}}>BREWOS STAFF WORKSPACE</small><h1 style={{fontSize:24,margin:'6px 0'}}>Welcome, {staff.full_name}</h1><p style={{fontSize:12,color:'#78716c',margin:0,textTransform:'capitalize'}}>{staff.role} · Your access is limited to your assigned role and branch.</p></div>
    <div style={{display:'flex',gap:8}}><button type="button" className="outline-btn" style={{width:'auto',padding:'9px 12px'}} onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14}/>{loading?'Loading':'Refresh'}</button><button type="button" className="outline-btn" style={{width:'auto',padding:'9px 12px'}} onClick={onSignOut}><LogOut size={14}/>Sign out</button></div>
   </header>
   {message&&<p role="status" style={{padding:10,background:'#f0fdf4',borderRadius:9,fontSize:12,overflowWrap:'anywhere'}}>{message}</p>}
   <section style={{marginTop:18,padding:15,border:'1px solid #d1fae5',borderRadius:13,background:'#f0fdf4'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><b style={{fontSize:14}}>Attendance</b><p style={{fontSize:11,color:'#57534e',margin:'4px 0 0'}}>{isCheckedIn?'Your latest shift is currently open.':'You are currently checked out.'}</p></div><div style={{display:'flex',gap:8}}><button type="button" className="btn" disabled={busy||isCheckedIn} onClick={()=>void punch('in')}>Check in</button><button type="button" className="outline-btn" style={{width:'auto'}} disabled={busy||!isCheckedIn} onClick={()=>void punch('out')}>Check out</button></div></div>
   </section>
   <section style={{marginTop:18}}><h2 style={{fontSize:17,display:'flex',gap:8,alignItems:'center'}}>{staff.role==='kitchen'?<ChefHat size={18}/>:<ClipboardList size={18}/>} {staff.role==='kitchen'?'Kitchen order queue':staff.role==='waiter'?'Your assigned tables':'Branch order overview'}</h2>
    {staff.role==='waiter'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:14}}>{tables.map(table=><div key={table.id} style={{border:'1px solid #86efac',background:'#f0fdf4',borderRadius:12,padding:13}}><b>{table.table_name}</b><small style={{display:'block',marginTop:5,color:'#166534'}}>Assigned to you</small></div>)}{!tables.length&&<p style={{fontSize:12,color:'#78716c'}}>No tables are currently assigned to you.</p>}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>{orders.map(order=><article key={order.id} style={{border:'1px solid #e7e5e4',borderRadius:12,padding:13}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>Order #{order.order_number}</b><small style={{fontWeight:800,color:'#047857',textTransform:'uppercase'}}>{order.status}</small></div><p style={{fontSize:11,color:'#78716c',margin:'5px 0 10px'}}>{order.order_type.replace('_',' ')} · {new Date(order.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p><div style={{display:'grid',gap:5}}>{order.order_items.map(item=><div key={item.id} style={{fontSize:12}}>{item.quantity} × {item.item_name_snapshot}</div>)}</div><b style={{display:'block',marginTop:10,fontSize:12}}>{money(order.total_paise)}</b></article>)}{!orders.length&&<p style={{fontSize:12,color:'#78716c'}}>No active orders right now.</p>}</div>
    <p style={{fontSize:10,color:'#78716c',marginTop:10}}>This staff workspace currently provides scoped viewing and attendance. Order status changes, cash handling and manager actions remain in the owner workspace until their role-specific controls are enabled and tested.</p>
   </section>
   <section style={{marginTop:20,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
    <div><h3 style={{fontSize:14,display:'flex',gap:7,alignItems:'center'}}><Clock3 size={16}/> Upcoming shifts</h3>{shifts.map(shift=><p key={shift.id} style={{fontSize:11,borderBottom:'1px solid #eee',padding:'7px 0'}}>{new Date(shift.starts_at).toLocaleString()} – {new Date(shift.ends_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>)}{!shifts.length&&<small style={{color:'#78716c'}}>No shifts scheduled.</small>}</div>
    <div><h3 style={{fontSize:14,display:'flex',gap:7,alignItems:'center'}}><UserRound size={16}/> Recent attendance</h3>{attendance.map(row=><p key={row.id} style={{fontSize:11,borderBottom:'1px solid #eee',padding:'7px 0'}}>{new Date(row.check_in_at).toLocaleString()} · {row.check_out_at?new Date(row.check_out_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Checked in'}</p>)}{!attendance.length&&<small style={{color:'#78716c'}}>No attendance records yet.</small>}</div>
   </section>
  </section>
 </main>
}
