import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

type Cafe = { id: string; name: string }
type Branch = { id: string; name: string }
type MenuItem = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  price_paise: number
  is_available: boolean
  category_id: string | null
}
type Category = { id: string; name: string }
type CostRow = { menu_item_id: string; cost_price_paise: number }

const fieldStyle: CSSProperties = {
  display: 'block', width: '100%', padding: 11, border: '1px solid #d6d3d1',
  borderRadius: 9, marginTop: 5, boxSizing: 'border-box', background: '#fff'
}
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, color: '#57534e' }
const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
const toPaise = (value: string) => Math.round(Number(value) * 100)

export default function MenuManager({ cafes }: { cafes: Cafe[] }) {
  const [cafeId, setCafeId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [currentImage, setCurrentImage] = useState('')
  const [available, setAvailable] = useState(true)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const previewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : currentImage, [imageFile, currentImage])
  useEffect(() => () => { if (imageFile && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl) }, [imageFile, previewUrl])

  useEffect(() => {
    if (!supabase || !cafeId) { setBranches([]); setBranchId(''); return }
    let active = true
    void (async () => {
      const { data, error } = await supabase.from('branches').select('id,name')
        .eq('cafe_id', cafeId).eq('active', true).order('created_at')
      if (!active) return
      if (error) { setMessage(error.message); return }
      const rows = (data || []) as Branch[]
      setBranches(rows)
      setBranchId(rows[0]?.id || '')
    })()
    return () => { active = false }
  }, [cafeId])

  useEffect(() => {
    if (!supabase || !cafeId || !branchId) {
      setItems([]); setCategories([]); setCosts({})
      return
    }
    void loadMenu()
  }, [cafeId, branchId])

  async function loadMenu() {
    if (!supabase || !cafeId || !branchId) return
    setLoading(true)
    setMessage('')
    const [itemResult, categoryResult, costResult] = await Promise.all([
      supabase.from('menu_items')
        .select('id,name,description,image_url,price_paise,is_available,category_id')
        .eq('cafe_id', cafeId).eq('branch_id', branchId).order('created_at', { ascending: false }),
      supabase.from('menu_categories').select('id,name')
        .eq('cafe_id', cafeId).eq('active', true).or('branch_id.is.null,branch_id.eq.' + branchId).order('sort_order'),
      supabase.from('menu_item_costs').select('menu_item_id,cost_price_paise').eq('cafe_id', cafeId)
    ])
    setLoading(false)
    if (itemResult.error || categoryResult.error || costResult.error) {
      setMessage(itemResult.error?.message || categoryResult.error?.message || costResult.error?.message || 'Could not load the menu.')
      return
    }
    setItems((itemResult.data || []) as MenuItem[])
    setCategories((categoryResult.data || []) as Category[])
    const nextCosts: Record<string, number> = {}
    ;((costResult.data || []) as CostRow[]).forEach(row => { nextCosts[row.menu_item_id] = row.cost_price_paise })
    setCosts(nextCosts)
  }

  function resetForm() {
    setEditingId(''); setItemName(''); setDescription(''); setCategoryName('')
    setSellingPrice(''); setCostPrice(''); setImageFile(null); setCurrentImage(''); setAvailable(true)
  }

  function editItem(item: MenuItem) {
    setEditingId(item.id)
    setItemName(item.name)
    setDescription(item.description || '')
    setCategoryName(categories.find(category => category.id === item.category_id)?.name || '')
    setSellingPrice((item.price_paise / 100).toFixed(2))
    setCostPrice(((costs[item.id] || 0) / 100).toFixed(2))
    setCurrentImage(item.image_url || '')
    setImageFile(null)
    setAvailable(item.is_available)
    setMessage('Editing ' + item.name)
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !cafeId || !branchId) return
    const sellPaise = toPaise(sellingPrice)
    const costPaise = toPaise(costPrice)
    if (!itemName.trim() || !categoryName.trim() || !Number.isFinite(sellPaise) || !Number.isFinite(costPaise) || sellPaise <= 0 || costPaise < 0) {
      setMessage('Enter a name, category, valid selling price and valid cost price.')
      return
    }
    if (!editingId && !imageFile) {
      setMessage('Please upload an image for this menu item.')
      return
    }
    if (imageFile && (!imageFile.type.startsWith('image/') || imageFile.size > 5 * 1024 * 1024)) {
      setMessage('Choose an image file smaller than 5 MB.')
      return
    }

    setBusy(true)
    setMessage('')
    let category = categories.find(row => row.name.toLowerCase() === categoryName.trim().toLowerCase())
    if (!category) {
      const { data, error } = await supabase.from('menu_categories').insert({
        cafe_id: cafeId, branch_id: branchId, name: categoryName.trim(), sort_order: categories.length, active: true
      }).select('id,name').single()
      if (error || !data) {
        setBusy(false); setMessage(error?.message || 'Could not create the category.'); return
      }
      category = data as Category
      setCategories(previous => [...previous, category!])
    }

    const payload = {
      cafe_id: cafeId, branch_id: branchId, category_id: category.id,
      name: itemName.trim(), description: description.trim() || null,
      price_paise: sellPaise, is_available: available
    }
    let itemId = editingId
    if (editingId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editingId).eq('cafe_id', cafeId)
      if (error) { setBusy(false); setMessage(error.message); return }
    } else {
      const { data, error } = await supabase.from('menu_items').insert(payload)
        .select('id').single()
      if (error || !data) { setBusy(false); setMessage(error?.message || 'Could not save the menu item.'); return }
      itemId = data.id
    }

    let imageUrl = currentImage || null
    if (imageFile) {
      const extension = imageFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${cafeId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('menu-item-images').upload(path, imageFile, {
        upsert: false, contentType: imageFile.type, cacheControl: '3600'
      })
      if (uploadError) { setBusy(false); setMessage('Item saved, but image upload failed: ' + uploadError.message); await loadMenu(); return }
      imageUrl = supabase.storage.from('menu-item-images').getPublicUrl(path).data.publicUrl
      const { error: imageError } = await supabase.from('menu_items').update({ image_url: imageUrl }).eq('id', itemId).eq('cafe_id', cafeId)
      if (imageError) { setBusy(false); setMessage('Item saved, but image link could not be saved: ' + imageError.message); await loadMenu(); return }
    }

    const { error: costError } = await supabase.from('menu_item_costs').upsert({
      menu_item_id: itemId, cafe_id: cafeId, cost_price_paise: costPaise, updated_at: new Date().toISOString()
    }, { onConflict: 'menu_item_id' })
    setBusy(false)
    if (costError) { setMessage('Menu item saved, but cost/profit details could not be saved: ' + costError.message); await loadMenu(); return }
    setMessage(editingId ? 'Menu item updated successfully.' : 'Menu item added successfully.')
    resetForm()
    await loadMenu()
  }

  async function toggleAvailability(item: MenuItem) {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.from('menu_items').update({ is_available: !item.is_available })
      .eq('id', item.id).eq('cafe_id', cafeId)
    setBusy(false)
    setMessage(error ? error.message : (item.is_available ? 'Item marked unavailable.' : 'Item marked available.'))
    if (!error) await loadMenu()
  }

  const input = (label: string, value: string, onChange: (value: string) => void, type = 'text', required = true) => (
    <label style={labelStyle}>{label}<input required={required} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={event => onChange(event.target.value)} style={fieldStyle} /></label>
  )

  return <section style={{borderTop:'1px solid #eee9df',paddingTop:18,marginTop:18}}>
    <h3 style={{fontSize:16,margin:'0 0 8px'}}>Menu & item pricing</h3>
    <p style={{fontSize:12,color:'#78716c',lineHeight:1.6}}>Owners enter every item manually. Add your own photos, selling prices and preparation costs. Profit is calculated automatically and remains private to the restaurant team.</p>
    {!cafes.length && <p style={{fontSize:12}}>Approve your restaurant before adding menu items.</p>}
    {cafes.length > 0 && <>
      <label style={labelStyle}>Restaurant<select value={cafeId} onChange={event => {setCafeId(event.target.value);resetForm();setMessage('')}} style={fieldStyle}>
        <option value="">Choose restaurant</option>{cafes.map(cafe => <option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}
      </select></label>
      {cafeId && <label style={{...labelStyle,marginTop:10}}>Branch<select value={branchId} onChange={event => {setBranchId(event.target.value);resetForm()}} style={fieldStyle}>
        {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select></label>}
      {cafeId && branchId && <>
        <form onSubmit={saveItem} style={{display:'grid',gap:11,border:'1px solid #e7e5e4',borderRadius:12,padding:14,marginTop:14}}>
          <b style={{fontSize:14}}>{editingId ? 'Edit menu item' : 'Add a new menu item'}</b>
          {input('Food item name', itemName, setItemName)}
          <label style={labelStyle}>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} style={{...fieldStyle,resize:'vertical'}} placeholder="Ingredients, portion size or a short description" /></label>
          {input('Category', categoryName, setCategoryName)}
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
            {input('Selling price (₹)', sellingPrice, setSellingPrice, 'number')}
            {input('Preparation cost (₹)', costPrice, setCostPrice, 'number')}
          </div>
          <div style={{fontSize:12,color:'#047857',fontWeight:700}}>
            Estimated profit per item: {sellingPrice !== '' && costPrice !== '' && Number.isFinite(Number(sellingPrice)-Number(costPrice)) ? money(toPaise(String(Number(sellingPrice)-Number(costPrice)))) : 'Enter both prices'}
          </div>
          <label style={labelStyle}>Item photo (upload manually)<input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] || null)} style={{...fieldStyle,padding:8}} />{editingId && <small style={{display:'block',marginTop:4,color:'#78716c'}}>Leave empty to keep the current photo.</small>}</label>
          {previewUrl && <img src={previewUrl} alt="Menu item preview" style={{width:112,height:88,objectFit:'cover',borderRadius:9,border:'1px solid #e7e5e4'}} />}
          <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}><input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} />Available for customers</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn" type="submit" disabled={busy || loading}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}</button>
            {editingId && <button className="outline-btn" type="button" onClick={resetForm}>Cancel edit</button>}
          </div>
        </form>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:18}}>
          <b style={{fontSize:14}}>Your menu items</b><button type="button" className="outline-btn" style={{width:'auto',padding:'8px 12px'}} onClick={() => void loadMenu()} disabled={loading}>Refresh</button>
        </div>
        {loading && <p role="status" style={{fontSize:12}}>Loading menu…</p>}
        {!loading && items.length === 0 && <p style={{fontSize:12,color:'#78716c'}}>No items yet. Add your first item using the form above.</p>}
        <div style={{display:'grid',gap:10,marginTop:10}}>
          {items.map(item => {
            const cost = costs[item.id] ?? 0
            const profit = item.price_paise - cost
            return <article key={item.id} style={{display:'flex',gap:11,alignItems:'center',border:'1px solid #e7e5e4',borderRadius:11,padding:10,opacity:item.is_available?1:.65}}>
              {item.image_url ? <img src={item.image_url} alt={item.name} style={{width:76,height:76,objectFit:'cover',borderRadius:8}} /> : <div style={{width:76,height:76,display:'grid',placeItems:'center',background:'#f5f5f4',borderRadius:8,fontSize:10,color:'#78716c'}}>No image</div>}
              <div style={{flex:1,minWidth:0}}>
                <b style={{fontSize:13}}>{item.name}</b><div style={{fontSize:11,color:'#78716c',marginTop:3}}>{categories.find(category => category.id === item.category_id)?.name || 'Uncategorised'}</div>
                <div style={{fontSize:12,marginTop:4}}>Sell {money(item.price_paise)} · Cost {money(cost)}</div>
                <div style={{fontSize:11,fontWeight:700,color:profit>=0?'#047857':'#b91c1c'}}> {profit>=0?'Profit':'Loss'} {money(Math.abs(profit))} per item</div>
                <small style={{color:item.is_available?'#047857':'#78716c'}}>{item.is_available?'Available':'Unavailable'}</small>
              </div>
              <div style={{display:'grid',gap:6}}>
                <button type="button" className="outline-btn" style={{width:'auto',padding:'7px 9px'}} onClick={() => editItem(item)}>Edit</button>
                <button type="button" className="outline-btn" style={{width:'auto',padding:'7px 9px'}} onClick={() => void toggleAvailability(item)} disabled={busy}>{item.is_available?'Disable':'Enable'}</button>
              </div>
            </article>
          })}
        </div>
      </>}
    </>}
    {message && <p role="status" style={{fontSize:12,overflowWrap:'anywhere',marginTop:10}}>{message}</p>}
  </section>
}
