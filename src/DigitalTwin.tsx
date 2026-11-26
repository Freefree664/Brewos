import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { Activity, Armchair, ChefHat, Clock3, RefreshCw, Users, Utensils, X } from 'lucide-react'

type Cafe = { id:string; name:string }
type Branch = { id:string; name:string }
type TableRow = { id:string; table_name:string; floor_position:number; assigned_waiter_id:string|null }
type OrderRow = { id:string; order_number:number; table_id:string|null; status:string; created_at:string; total_paise:number; order_items:Array<{id:string;item_name_snapshot:string;quantity:number}> }
type StaffRow = { id:string; full_name:string }

const money=(paise:number)=>'₹'+(Number(paise||0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})
const activeStatus=(status:string)=>!['completed','cancelled'].includes(status)
const statusLabel=(status:string)=>({pending:'New order',accepted:'Accepted',preparing:'Preparing',ready:'Ready to serve',served:'Served'} as Record<string,string>)[status]||status

export default function DigitalTwin({cafes}:{cafes:Cafe[]}) {
 const [cafeId,setCafeId]=useState('')
 const [branches,setBranches]=useState<Branch[]>([])
 const [branchId,setBranchId]=useState('')
 const [tables,setTables]=useState<TableRow[]>([])
 const [orders,setOrders]=useState<OrderRow[]>([])
 const [staff,setStaff]=useState<StaffRow[]>([])
 const [selected,setSelected]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [lastUpdated,setLastUpdated]=useState<Date|null>(null)
 useEffect(()=>{if(!cafeId&&cafes.length)setCafeId(cafes[0].id)},[cafes,cafeId])
 useEffect(()=>{
  if(!supabase||!cafeId){setBranches([]);setBranchId('');return}
  let live=true
  void supabase.from('branches').select('id,name').eq('cafe_id',cafeId).eq('active',true).order('created_at')
   .then(({data,error})=>{if(!live)return;if(error){setError(error.message);return}const rows=(data||[]) as Branch[];setBranches(rows);setBranchId(old=>rows.some(x=>x.id===old)?old:(rows[0]?.id||''))})
  return()=>{live=false}
 },[cafeId])
 async function refresh(){
  if(!supabase||!cafeId||!branchId)return
  setLoading(true);setError('')
  const [tableResult,orderResult,staffResult]=await Promise.all([
   supabase.from('dining_tables').select('id,table_name,floor_position,assigned_waiter_id').eq('cafe_id',cafeId).eq('branch_id',branchId).eq('active',true).order('floor_position').order('created_at'),
   supabase.from('orders').select('id,order_number,table_id,status,created_at,total_paise,order_items(id,item_name_snapshot,quantity)').eq('cafe_id',cafeId).eq('branch_id',branchId).order('created_at',{ascending:false}).limit(500),
   supabase.from('staff_members').select('id,full_name').eq('cafe_id',cafeId).eq('active',true)
  ])
  setLoading(false)
  const problem=tableResult.error||orderResult.error||staffResult.error
  if(problem){setError(problem.message);return}
  setTables((tableResult.data||[]) as TableRow[])
  setOrders((orderResult.data||[]) as unknown as OrderRow[])
  setStaff((staffResult.data||[]) as StaffRow[])
  setLastUpdated(new Date())
 }
 useEffect(()=>{void refresh()},[cafeId,branchId])
 useEffect(()=>{
  if(!supabase||!cafeId||!branchId)return
  const channel=supabase.channel('rivantoq-digital-twin-'+cafeId+'-'+branchId)
   .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:'cafe_id=eq.'+cafeId},()=>void refresh())
   .on('postgres_changes',{event:'*',schema:'public',table:'dining_tables',filter:'cafe_id=eq.'+cafeId},()=>void refresh())
   .subscribe()
  const timer=window.setInterval(()=>void refresh(),12000)
  return()=>{window.clearInterval(timer);void supabase?.removeChannel(channel)}
 },[cafeId,branchId])
 const latestByTable=useMemo(()=>{
  const map=new Map<string,OrderRow>()
  for(const order of orders){if(order.table_id&&activeStatus(order.status)&&!map.has(order.table_id))map.set(order.table_id,order)}
  return map
 },[orders])
 const occupied=tables.filter(table=>latestByTable.has(table.id)).length
 const activeOrders=orders.filter(order=>activeStatus(order.status))
 const selectedTable=tables.find(table=>table.id===selected)
 const selectedOrder=selectedTable?latestByTable.get(selectedTable.id):undefined
 const waiterName=(id:string|null)=>id?staff.find(person=>person.id===id)?.full_name||'Assigned staff':'Not assigned'
 const stateOf=(table:TableRow)=>latestByTable.get(table.id)?.status||'available'
 const statusTone=(status:string)=>status==='available'?'available':status==='ready'||status==='served'?'ready':status==='preparing'?'preparing':'occupied'
 return <section className="rtwin-shell">
  <header className="rtwin-head"><div><span className="rtwin-kicker"><Activity size={13}/> RIVANTOQ INTELLIGENCE</span><h2>Digital Twin</h2><p>A live operational view of your restaurant floor.</p></div><div className="rtwin-live"><i/> LIVE SYSTEM <button type="button" onClick={()=>void refresh()} disabled={loading} aria-label="Refresh digital twin"><RefreshCw size={15}/></button></div></header>
  <div className="rtwin-controls"><label>Restaurant<select value={cafeId} onChange={e=>{setCafeId(e.target.value);setSelected('')}}><option value="">Choose restaurant</option>{cafes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Branch<select value={branchId} onChange={e=>{setBranchId(e.target.value);setSelected('')}}><option value="">Choose branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><span className="rtwin-updated">{lastUpdated?'Updated '+lastUpdated.toLocaleTimeString():'Waiting for data'} · refreshes every 12 sec</span></div>
  <div className="rtwin-metrics"><div><span>TABLES</span><b>{tables.length}</b><small><Armchair size={13}/> Active floor capacity</small></div><div><span>OCCUPIED</span><b>{occupied}</b><small><i className="rtwin-dot occupied"/> {tables.length?Math.round(occupied/tables.length*100):0}% floor occupancy</small></div><div><span>AVAILABLE</span><b>{Math.max(0,tables.length-occupied)}</b><small><i className="rtwin-dot available"/> Ready for guests</small></div><div><span>ACTIVE ORDERS</span><b>{activeOrders.length}</b><small><ChefHat size={13}/> Across this branch</small></div></div>
  {error&&<p className="rtwin-error" role="alert">{error}</p>}
  {!cafeId||!branchId?<div className="rtwin-empty">Select a restaurant and branch to open its live floor.</div>:loading&&!lastUpdated?<div className="rtwin-empty">Connecting to restaurant systems…</div>:tables.length===0?<div className="rtwin-empty">No active tables are configured for this branch yet. Create tables in Tables & QR setup to populate the Digital Twin.</div>:<>
   <div className="rtwin-stage"><div className="rtwin-stage-label"><span>FLOOR OVERVIEW</span><small>Tap a table to inspect its live service</small></div><div className="rtwin-floor"><div className="rtwin-zone rtwin-zone-kitchen"><ChefHat size={17}/> KITCHEN</div><div className="rtwin-tables">{tables.map(table=>{const status=stateOf(table),order=latestByTable.get(table.id),tone=statusTone(status);return <button key={table.id} type="button" className={'rtwin-table '+tone+(selected===table.id?' selected':'')} onClick={()=>setSelected(table.id)} aria-pressed={selected===table.id}><span className="rtwin-table-top"><Utensils size={17}/></span><b>{table.table_name}</b><small>{order?'#'+order.order_number:'Available'}</small><i/></button>})}</div><div className="rtwin-zone rtwin-zone-counter"><Users size={16}/> SERVICE COUNTER</div></div><div className="rtwin-legend"><span><i className="available"/> Available</span><span><i className="occupied"/> Occupied / in service</span><span><i className="preparing"/> Preparing</span><span><i className="ready"/> Ready / served</span></div></div>
   {selectedTable&&<aside className="rtwin-detail"><div className="rtwin-detail-head"><div><span>SELECTED TABLE</span><h3>{selectedTable.table_name}</h3></div><button type="button" onClick={()=>setSelected('')} aria-label="Close table details"><X size={17}/></button></div><div className="rtwin-detail-grid"><div><small>TABLE STATUS</small><b>{statusLabel(stateOf(selectedTable))}</b></div><div><small>WAITER ASSIGNMENT</small><b>{waiterName(selectedTable.assigned_waiter_id)}</b></div></div>{selectedOrder?<div className="rtwin-order"><div><b>Order #{selectedOrder.order_number}</b><span>{money(selectedOrder.total_paise)}</span></div><small><Clock3 size={12}/> {new Date(selectedOrder.created_at).toLocaleTimeString()} · {statusLabel(selectedOrder.status)}</small><ul>{(selectedOrder.order_items||[]).map(item=><li key={item.id}>{item.quantity} × {item.item_name_snapshot}</li>)}</ul></div>:<p className="rtwin-no-order">No active order is linked to this table.</p>}</aside>}
  </>}
  <footer className="rtwin-footnote">Live operational data from this restaurant's existing tables and orders. Table placement is an interactive overview, not a measured architectural floor plan.</footer>
  <style>{`
   .rtwin-shell{margin:24px 0;padding:clamp(15px,2.5vw,26px);border:1px solid #1d3b2c;border-radius:22px;background:radial-gradient(ellipse at 50% 0%,#153b2b 0,#09130f 52%,#060a08 100%);color:#e7f7eb;box-shadow:0 20px 55px #06140d30;overflow:hidden}
   .rtwin-head,.rtwin-live,.rtwin-controls,.rtwin-stage-label,.rtwin-detail-head,.rtwin-order>div{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
   .rtwin-kicker{display:flex;align-items:center;gap:7px;color:#61e49a;font-size:10px;font-weight:900;letter-spacing:1.7px}.rtwin-head h2{margin:8px 0 3px;font:800 clamp(24px,3vw,32px) Manrope,sans-serif;letter-spacing:-1px}.rtwin-head p{margin:0;color:#8ba99a;font-size:12px}
   .rtwin-live{color:#8ff5b6;font-size:10px;font-weight:900;letter-spacing:1px}.rtwin-live i,.rtwin-dot{width:8px;height:8px;border-radius:50%;background:#4bea91;box-shadow:0 0 12px #4bea91}.rtwin-live button,.rtwin-detail-head button{display:grid;place-items:center;width:34px;height:34px;border:1px solid #28543d;border-radius:10px;background:#10271b;color:#9cebb8}
   .rtwin-controls{justify-content:flex-start;margin:18px 0;padding:12px;border:1px solid #1c3a2b;border-radius:13px;background:#0b1711}.rtwin-controls label{display:grid;gap:5px;min-width:min(190px,100%);color:#88a795;font-size:10px;font-weight:800}.rtwin-controls select{min-width:190px;max-width:100%;padding:10px;border:1px solid #28543d;border-radius:9px;background:#10271b;color:#e7f7eb}.rtwin-updated{margin-left:auto;color:#769786;font-size:10px}
   .rtwin-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:15px 0}.rtwin-metrics>div{padding:13px;border:1px solid #1e4531;border-radius:13px;background:linear-gradient(145deg,#10271b,#0b1711)}.rtwin-metrics span{display:block;color:#7da38b;font-size:9px;font-weight:900;letter-spacing:1px}.rtwin-metrics b{display:block;margin:5px 0;color:#83f0ac;font:800 26px Manrope}.rtwin-metrics small{display:flex;align-items:center;gap:6px;color:#91ad9b;font-size:9px}.rtwin-dot{display:inline-block}.rtwin-dot.occupied,.rtwin-legend i.occupied{background:#e8a34e;box-shadow:0 0 10px #e8a34e}.rtwin-dot.available,.rtwin-legend i.available{background:#42df8c;box-shadow:0 0 10px #42df8c}
   .rtwin-stage{margin-top:14px;padding:15px;border:1px solid #1e4531;border-radius:17px;background:linear-gradient(145deg,#0d1e15,#08100c)}.rtwin-stage-label{color:#8feab0;font-size:10px;font-weight:900;letter-spacing:1px}.rtwin-stage-label small{color:#769786;font-size:10px;font-weight:500;letter-spacing:0}
   .rtwin-floor{position:relative;min-height:330px;margin:14px 0 5px;padding:34px 20px;overflow:hidden;border:1px solid #254a35;border-radius:15px;background:linear-gradient(30deg,#0c2117 12%,#10291d 12.5%,#0d2118 13%,#0d2118 87%,#10291d 87.5%,#0c2117 88%),linear-gradient(150deg,#10291d 12%,#0c2117 12.5%,#0d2118 13%,#0d2118 87%,#10291d 87.5%,#10291d 88%);background-size:46px 80px;perspective:900px}
   .rtwin-zone{position:absolute;z-index:1;display:flex;align-items:center;gap:7px;padding:10px 13px;border:1px solid #2d6845;border-radius:10px;background:#10291de8;color:#7deaa5;font-size:9px;font-weight:900;letter-spacing:1px;box-shadow:0 0 22px #3ce88c15}.rtwin-zone-kitchen{top:12px;left:14px}.rtwin-zone-counter{right:14px;bottom:12px}
   .rtwin-tables{position:relative;z-index:2;display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:24px 18px;align-items:center;justify-items:center;max-width:760px;margin:35px auto 25px;transform:rotateX(8deg);transform-style:preserve-3d}
   .rtwin-table{position:relative;display:grid;justify-items:center;gap:5px;width:100%;max-width:128px;min-height:105px;padding:12px 8px;border:1px solid #2c6242;border-radius:15px;background:linear-gradient(145deg,#153a27,#0d2418);color:#dff9e8;box-shadow:0 9px 0 #06140d,0 13px 22px #0008,0 0 17px #42df8c16;transform:translateZ(8px);transition:transform .18s,border-color .18s,box-shadow .18s}.rtwin-table:hover,.rtwin-table.selected{transform:translateY(-5px) translateZ(15px);border-color:#79efa5;box-shadow:0 12px 0 #06140d,0 18px 25px #0009,0 0 23px #42df8c35}.rtwin-table-top{display:grid;place-items:center;width:32px;height:32px;border:1px solid #3c8055;border-radius:50%;color:#8ff5b6}.rtwin-table b{font-size:11px}.rtwin-table small{color:#8eb29a;font-size:9px}.rtwin-table>i{position:absolute;right:10px;top:10px;width:7px;height:7px;border-radius:50%;background:#42df8c;box-shadow:0 0 10px #42df8c}
   .rtwin-table.occupied{border-color:#9a6633;background:linear-gradient(145deg,#4b321c,#241a10)}.rtwin-table.occupied .rtwin-table-top{border-color:#b67b3e;color:#ffc27c}.rtwin-table.occupied>i{background:#e8a34e;box-shadow:0 0 10px #e8a34e}.rtwin-table.preparing{border-color:#9b7730;background:linear-gradient(145deg,#473917,#211c0d)}.rtwin-table.preparing .rtwin-table-top{border-color:#c2a04b;color:#ffe08a}.rtwin-table.preparing>i{background:#f3cf68;box-shadow:0 0 10px #f3cf68}.rtwin-table.ready{border-color:#2f8a6c;background:linear-gradient(145deg,#154b3a,#0d281e)}.rtwin-table.ready .rtwin-table-top{border-color:#52c79c;color:#8af0c8}.rtwin-table.ready>i{background:#4be4b0;box-shadow:0 0 10px #4be4b0}
   .rtwin-legend{display:flex;gap:15px;flex-wrap:wrap;margin-top:15px;color:#8ba99a;font-size:9px}.rtwin-legend span{display:flex;align-items:center;gap:6px}.rtwin-legend i{width:7px;height:7px;border-radius:50%;background:#e8a34e}.rtwin-legend i.preparing{background:#f3cf68;box-shadow:0 0 10px #f3cf68}.rtwin-legend i.ready{background:#4be4b0;box-shadow:0 0 10px #4be4b0}
   .rtwin-detail{margin-top:12px;padding:16px;border:1px solid #28543d;border-radius:15px;background:#0b1711}.rtwin-detail-head>div>span,.rtwin-detail-grid small{color:#7da38b;font-size:9px;font-weight:900;letter-spacing:1px}.rtwin-detail-head h3{margin:4px 0 0;color:#9af0b6;font:800 19px Manrope}.rtwin-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.rtwin-detail-grid>div{padding:11px;border:1px solid #1e4531;border-radius:10px}.rtwin-detail-grid b{display:block;margin-top:5px;color:#e2f8e8;font-size:12px}.rtwin-order{margin-top:12px;padding:13px;border:1px solid #24553a;border-radius:11px;background:#10271b}.rtwin-order>div{color:#dff9e8;font-size:12px}.rtwin-order>div span{color:#8ff5b6;font-weight:800}.rtwin-order>small{display:flex;align-items:center;gap:6px;margin-top:7px;color:#8ba99a;font-size:10px}.rtwin-order ul{display:grid;gap:6px;margin:12px 0 0;padding-left:18px;color:#c4e5cf;font-size:11px}.rtwin-no-order,.rtwin-empty{padding:18px;border:1px dashed #28543d;border-radius:13px;color:#8ba99a;font-size:12px;line-height:1.7}.rtwin-error{padding:11px;border:1px solid #85443e;border-radius:10px;background:#321c19;color:#ffc1b8;font-size:11px}.rtwin-footnote{margin-top:13px;color:#658674;font-size:9px;line-height:1.6}
   @media(max-width:650px){.rtwin-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.rtwin-floor{padding:34px 10px;min-height:300px}.rtwin-tables{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px}.rtwin-table{min-height:92px}.rtwin-updated{width:100%;margin-left:0}.rtwin-detail-grid{grid-template-columns:1fr}}
   @media(prefers-reduced-motion:reduce){.rtwin-table{transition:none}}
  `}</style>
 </section>
}
