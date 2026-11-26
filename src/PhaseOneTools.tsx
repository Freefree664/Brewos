import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from './lib/supabase'

type Item={id:string;name:string}
type Group={id:string;menu_item_id:string;name:string;required:boolean;min_select:number;max_select:number;active:boolean}
type Option={id:string;group_id:string;name:string;extra_price_paise:number;active:boolean}
type Feedback={id:string;order_id:string;rating:number;comment:string|null;created_at:string}

const field:CSSProperties={padding:9,border:'1px solid #d6d3d1',borderRadius:8,width:'100%',boxSizing:'border-box'}
const money=(p:number)=>(p/100).toLocaleString('en-IN',{style:'currency',currency:'INR'})

export function MenuCustomizationManager({cafeId,items}:{cafeId:string;items:Item[]}){
 const [groups,setGroups]=useState<Group[]>([])
 const [options,setOptions]=useState<Option[]>([])
 const [selectedItem,setSelectedItem]=useState('')
 const [groupName,setGroupName]=useState('')
 const [required,setRequired]=useState(false)
 const [maxSelect,setMaxSelect]=useState(1)
 const [optionNames,setOptionNames]=useState<Record<string,string>>({})
 const [optionPrices,setOptionPrices]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 async function load(){if(!supabase||!cafeId)return;const {data,error}=await supabase.from('menu_item_option_groups').select('id,menu_item_id,name,required,min_select,max_select,active').eq('cafe_id',cafeId).order('created_at');if(error){setMessage(error.message);return;}const rows=(data||[]) as Group[];setGroups(rows);if(rows.length){const {data:opts,error:optError}=await supabase.from('menu_item_options').select('id,group_id,name,extra_price_paise,active').eq('cafe_id',cafeId).order('created_at');if(optError){setMessage(optError.message);return;}setOptions((opts||[]) as Option[]);}else setOptions([])}
 useEffect(()=>{setGroups([]);setOptions([]);setMessage('');void load()},[cafeId])
 async function addGroup(itemId:string){if(!supabase||!groupName.trim())return;setBusy(true);const {error}=await supabase.from('menu_item_option_groups').insert({cafe_id:cafeId,menu_item_id:itemId,name:groupName.trim(),required,min_select:required?1:0,max_select:maxSelect});setBusy(false);if(error){setMessage(error.message);return;}setGroupName('');setRequired(false);setMaxSelect(1);setMessage('Customization group added.');await load()}
 async function addOption(groupId:string){if(!supabase)return;const name=(optionNames[groupId]||'').trim(),price=Math.round(Number(optionPrices[groupId]||0)*100);if(!name||!Number.isFinite(price)||price<0){setMessage('Enter a valid option name and extra price.');return;}setBusy(true);const {error}=await supabase.from('menu_item_options').insert({cafe_id:cafeId,group_id:groupId,name,extra_price_paise:price});setBusy(false);if(error){setMessage(error.message);return;}setOptionNames(v=>({...v,[groupId]:''}));setOptionPrices(v=>({...v,[groupId]:''}));setMessage('Option added.');await load()}
 async function toggleGroup(group:Group){if(!supabase)return;const {error}=await supabase.from('menu_item_option_groups').update({active:!group.active}).eq('id',group.id).eq('cafe_id',cafeId);if(error){setMessage(error.message);return;}await load()}
 async function toggleOption(option:Option){if(!supabase)return;const {error}=await supabase.from('menu_item_options').update({active:!option.active}).eq('id',option.id).eq('cafe_id',cafeId);if(error){setMessage(error.message);return;}await load()}
 if(!cafeId)return null
 return <section style={{marginTop:20,borderTop:'1px solid #e7e5e4',paddingTop:16}}>
  <h3 style={{fontSize:15,margin:'0 0 6px'}}>Smart food customization</h3>
  <p style={{fontSize:12,color:'#78716c'}}>Add choices such as size, toppings or spice level. Extra prices are calculated by the ordering system.</p>
  {items.map(item=><article key={item.id} style={{border:'1px solid #e7e5e4',borderRadius:10,padding:12,marginTop:9}}>
   <b style={{fontSize:13}}>{item.name}</b>
   <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:7,marginTop:9}}>
    <input aria-label={'New option group for '+item.name} value={selectedItem===item.id?groupName:''} onChange={e=>{setSelectedItem(item.id);setGroupName(e.target.value)}} placeholder='New group (e.g. Size)' style={field}/>
    <button type='button' className='outline-btn' style={{width:'auto',padding:'8px 10px'}} disabled={busy||selectedItem!==item.id||!groupName.trim()} onClick={()=>void addGroup(item.id)}>Add group</button>
   </div>
   {selectedItem===item.id&&<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8,fontSize:12}}><label><input type='checkbox' checked={required} onChange={e=>setRequired(e.target.checked)}/> Required</label><label>Max choices <select value={maxSelect} onChange={e=>setMaxSelect(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></select></label></div>}
   {groups.filter(g=>g.menu_item_id===item.id).map(group=><div key={group.id} style={{background:'#fafaf9',borderRadius:9,padding:10,marginTop:10,opacity:group.active?1:.6}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b style={{fontSize:12}}>{group.name} · choose {group.min_select}–{group.max_select}</b><button type='button' className='outline-btn' style={{width:'auto',padding:'5px 8px'}} onClick={()=>void toggleGroup(group)}>{group.active?'Disable':'Enable'}</button></div>
    {options.filter(o=>o.group_id===group.id).map(option=><div key={option.id} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:12,padding:'5px 0'}}><span>{option.name} · +{money(option.extra_price_paise)}</span><button type='button' className='outline-btn' style={{width:'auto',padding:'3px 7px'}} onClick={()=>void toggleOption(option)}>{option.active?'Disable':'Enable'}</button></div>)}
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 95px auto',gap:6,marginTop:8}}><input value={optionNames[group.id]||''} onChange={e=>setOptionNames(v=>({...v,[group.id]:e.target.value}))} placeholder='Option name' style={field}/><input type='number' min='0' step='.01' value={optionPrices[group.id]||''} onChange={e=>setOptionPrices(v=>({...v,[group.id]:e.target.value}))} placeholder='Extra ₹' style={field}/><button type='button' className='outline-btn' style={{width:'auto',padding:'7px 9px'}} disabled={busy} onClick={()=>void addOption(group.id)}>Add</button></div>
   </div>)}
  </article>)}
  {message&&<p role='status' style={{fontSize:12,overflowWrap:'anywhere'}}>{message}</p>}
 </section>
}

export function OwnerFeedbackManager({cafeId}:{cafeId:string}){
 const [rows,setRows]=useState<Feedback[]>([])
 const [message,setMessage]=useState('')
 useEffect(()=>{let alive=true;async function load(){if(!supabase||!cafeId){setRows([]);return;}const {data,error}=await supabase.from('order_feedback').select('id,order_id,rating,comment,created_at').eq('cafe_id',cafeId).order('created_at',{ascending:false}).limit(100);if(!alive)return;if(error){setMessage(error.message);return;}setRows((data||[]) as Feedback[])}void load();return()=>{alive=false}},[cafeId])
 if(!cafeId)return null
 return <section style={{marginTop:20,borderTop:'1px solid #e7e5e4',paddingTop:16}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3 style={{fontSize:15,margin:0}}>Guest feedback</h3><span style={{fontSize:11,color:'#78716c'}}>{rows.length} reviews</span></div>
  {!rows.length?<p style={{fontSize:12,color:'#78716c'}}>No guest feedback yet. Reviews from completed QR orders will appear here.</p>:rows.map(row=><article key={row.id} style={{padding:'10px 0',borderBottom:'1px solid #f0ede8'}}><b style={{color:'#047857'}}>{'★'.repeat(row.rating)}{'☆'.repeat(5-row.rating)}</b><p style={{fontSize:12,margin:'4px 0',whiteSpace:'pre-wrap'}}>{row.comment||'Rating only — no comment.'}</p><small style={{color:'#78716c'}}>Order {row.order_id.slice(0,8)} · {new Date(row.created_at).toLocaleString()}</small></article>)}
  {message&&<p role='status' style={{fontSize:12}}>{message}</p>}
 </section>
}
