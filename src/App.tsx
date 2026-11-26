import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'
import { ArrowRight, BarChart3, Bell, Check, ChevronDown, Coffee, Globe2, LayoutDashboard, Menu, QrCode, ShieldCheck, ShoppingBag, Users, X, Zap, UtensilsCrossed, Sparkles } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import MenuManager from './MenuManager'
import OwnerOrders from './OwnerOrders'
import OwnerPOS from './OwnerPOS'
import OwnerPaymentSettings from './OwnerPaymentSettings'
import OwnerOperations from './OwnerOperations'
import { CustomerOrdering, TablePinIssuer } from './CustomerOrdering'
import StaffPortal from './StaffPortal'

const copy = {
  en: {
    nav: ['Platform', 'Features', 'Pricing'],
    sign: 'Sign in', start: 'Get started', pill: 'THE OPERATING SYSTEM FOR MODERN CAFÉS',
    heroA: 'Your café,', heroB: 'running beautifully.', sub: 'A focused workspace for table QR ordering, digital menus, branch setup and incoming guest orders.',
    cta: 'Explore the platform', secondary: 'See how it works', trusted: 'MADE FOR THE PEOPLE BEHIND THE COUNTER',
    platform: 'Everything in sync.', platformSub: 'From the first table QR scan to the final order update, manage your café’s essential digital workflows in one place.',
    featureTitle: 'The tools to make every day smoother', featureSub: 'Less juggling. More hospitality.',
    pricing: 'Simple, transparent plans', pricingSub: 'Every plan covers the Rivantoq tools currently available. Features marked “In development” are not active yet.',
    choose: 'Choose plan', footer: 'A better day starts here.'
  },
  hi: {
    nav: ['प्लेटफ़ॉर्म', 'फ़ीचर्स', 'कीमत'],
    sign: 'साइन इन', start: 'शुरू करें', pill: 'आधुनिक कैफ़े के लिए ऑपरेटिंग सिस्टम',
    heroA: 'आपका कैफ़े,', heroB: 'अब और बेहतर।', sub: 'टेबल QR ऑर्डर, डिजिटल मेन्यू, ब्रांच सेटअप और नए ऑर्डर संभालने के लिए एक आसान वर्कस्पेस।',
    cta: 'प्लेटफ़ॉर्म देखें', secondary: 'कैसे काम करता है', trusted: 'कैफ़े चलाने वालों के लिए बनाया गया',
    platform: 'सब कुछ एक साथ।', platformSub: 'पहले टेबल QR स्कैन से लेकर ऑर्डर अपडेट तक, कैफ़े के ज़रूरी डिजिटल काम एक जगह संभालें।',
    featureTitle: 'हर दिन को आसान बनाने वाले टूल', featureSub: 'कम भागदौड़। बेहतर मेहमाननवाज़ी।',
    pricing: 'आसान और स्पष्ट प्लान', pricingSub: 'हर प्लान में Rivantoq के अभी उपलब्ध टूल शामिल हैं। “In development” वाले फ़ीचर अभी उपलब्ध नहीं हैं.',
    choose: 'प्लान चुनें', footer: 'बेहतर दिन की शुरुआत यहीं से।'
  }
}

const plans = [{name:'1 Month',price:'₹1,099',term:'1 महीना'}, {name:'3 Months',price:'₹1,899',term:'3 महीने'}, {name:'6 Months',price:'₹2,399',term:'6 महीने',popular:true}, {name:'9 Months',price:'₹3,699',term:'9 महीने'}, {name:'1 Year',price:'₹5,999',term:'1 साल'}, {name:'2 Years',price:'₹6,999',term:'2 साल'}]
const tourSteps = [
  {icon:QrCode,label:'Guest experience',title:'A smoother visit, from the first scan.',desc:'Guests open their table menu, browse dishes, add notes and place an order after the café team activates the table.',eyebrow:'RIVANTOQ GUEST',metric:'Scan · Explore · Order',detail:'A menu designed for the table — not a trip to the admin website.'},
  {icon:ShoppingBag,label:'Owner workspace',title:'Your café, clearly in view.',desc:'Owners manage their own café spaces, menus, branches, tables and incoming orders from one private workspace.',eyebrow:'RIVANTOQ CONTROL',metric:'Menus · Tables · Teams',detail:'Each owner signs in to manage the cafés connected to their account.'},
  {icon:Coffee,label:'Counter & kitchen',title:'Keep the front and back in sync.',desc:'Create counter bills, record payments and move orders through the kitchen workflow with clear status updates.',eyebrow:'RIVANTOQ SERVICE',metric:'POS · Kitchen · Service',detail:'A practical flow for busy shifts and quick handovers.'},
  {icon:BarChart3,label:'Insights & loyalty',title:'Make better decisions with your numbers.',desc:'Review sales and order trends, follow team activity and reward returning guests with loyalty points.',eyebrow:'RIVANTOQ INSIGHTS',metric:'Trends · Teams · Loyalty',detail:'Use your café activity to understand what is working.'}
]

const features = [
  {icon:QrCode,title:'QR & guest ordering',desc:'Available now: table QR check-in, digital menu, cart and six-digit staff session code.'},
  {icon:LayoutDashboard,title:'Owner menu tools',desc:'Available now: manage restaurants, branches, menu items, photos, availability and private item-cost estimates.'},
  {icon:ShoppingBag,title:'Order management',desc:'Available now: review guest orders, update their status and receive browser alerts while the dashboard is open.'},
  {icon:ShieldCheck,title:'UPI subscriptions',desc:'Available now: scan a plan-specific UPI QR, submit the transaction reference and await administrator verification.'},
  {icon:Coffee,title:'POS & kitchen tools',desc:'Counter billing, payment recording and a dedicated kitchen order workflow.'},
  {icon:Users,title:'Staff, waiter & analytics',desc:'Team roster, shifts, attendance, table assignments and sales insights.'},
  {icon:Sparkles,title:'Customer loyalty',desc:'Reward returning guests with points earned on completed orders.'}
]

function App() {
  const [lang,setLang] = useState<'en'|'hi'>('en')
  const [menu,setMenu] = useState(false)
  const [activeTour,setActiveTour] = useState(0)
  const [dashboard,setDashboard] = useState(false)
  const [authUser,setAuthUser] = useState<{id:string;email?:string} | null>(null)
  const [linkedStaff,setLinkedStaff] = useState<{id:string;cafe_id:string;branch_id:string|null;full_name:string;role:string;active:boolean}|null>(null)
  const [staffInviteToken,setStaffInviteToken] = useState('')
  const [selectedPlan,setSelectedPlan] = useState<(typeof plans)[number] | null>(null)
  const [authMode,setAuthMode] = useState<'signin'|'signup'>('signin')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [authBusy,setAuthBusy] = useState(false)
  const [authMessage,setAuthMessage] = useState('')
  const [paymentReference,setPaymentReference] = useState('')
  const [paymentBusy,setPaymentBusy] = useState(false)
  const [paymentMessage,setPaymentMessage] = useState('')
  const [adminOpen,setAdminOpen] = useState(false)
  const [adminBusy,setAdminBusy] = useState(false)
  const [adminMessage,setAdminMessage] = useState('')
  const [adminRequests,setAdminRequests] = useState<Array<{id:string;user_id:string;plan_name:string;amount_paise:number;upi_transaction_ref:string;status:string;created_at:string}>>([])
  const [pendingCafes,setPendingCafes] = useState<Array<{id:string;name:string;slug:string;description:string|null;contact_phone:string|null;created_by:string;created_at:string}>>([])
  const [profileOpen,setProfileOpen] = useState(false)
  const [profileName,setProfileName] = useState('')
  const [profileBusy,setProfileBusy] = useState(false)
  const [profileMessage,setProfileMessage] = useState('')
  const [ownerOpen,setOwnerOpen] = useState(false)
  const [ownerBusy,setOwnerBusy] = useState(false)
  const [ownerLoading,setOwnerLoading] = useState(false)
  const [ownerMessage,setOwnerMessage] = useState('')
  const [ownerCafes,setOwnerCafes] = useState<Array<{id:string;name:string;slug:string;status:string;created_at:string}>>([])
  const [ownerWaiterCalls,setOwnerWaiterCalls] = useState<Array<{id:string;table_name:string;status:string;created_at:string;branch_id:string}>>([])
  const [ownerWaiterToast,setOwnerWaiterToast] = useState<{id:string;table_name:string}|null>(null)
  const seenOwnerCallIds = useRef<Set<string>>(new Set())
  const [tableCafeId,setTableCafeId] = useState('')
  const [tableBranchId,setTableBranchId] = useState('')
  const [tableName,setTableName] = useState('Table 1')
  const [tableBranches,setTableBranches] = useState<Array<{id:string;name:string}>>([])
  const [diningTables,setDiningTables] = useState<Array<{id:string;table_name:string;branch_id:string;active:boolean;created_at:string}>>([])
  const [tableBusy,setTableBusy] = useState(false)
  const [tableMessage,setTableMessage] = useState('')
  const [newTableToken,setNewTableToken] = useState('')
  const [qrTableInfo,setQrTableInfo] = useState<{restaurant_name:string;branch_name:string;table_name:string;session_active?:boolean} | null>(null)
  const [qrTableLoading,setQrTableLoading] = useState(false)
  const [qrTableError,setQrTableError] = useState('')
  const [qrMenuItems,setQrMenuItems] = useState<Array<{id:string;name:string;description:string|null;category:string;price:number;image:string|null;available:boolean}>>([])
  const [qrMenuLoading,setQrMenuLoading] = useState(false)
  const [qrMenuError,setQrMenuError] = useState('')
  const guestUrlParams = new URLSearchParams(window.location.search)
  const qrTokenFromUrl = guestUrlParams.get('table') || ''
  const [cafeName,setCafeName] = useState('')
  const [cafeSlug,setCafeSlug] = useState('')
  const [cafeDescription,setCafeDescription] = useState('')
  const [cafePhone,setCafePhone] = useState('')
  const [branchName,setBranchName] = useState('Main Branch')
  const [branchAddress,setBranchAddress] = useState('')
  const [subscriptionOpen,setSubscriptionOpen] = useState(false)
  const [subscriptionBusy,setSubscriptionBusy] = useState(false)
  const [subscriptionMessage,setSubscriptionMessage] = useState('')
  const [subscription,setSubscription] = useState<{plan_code:string;starts_at:string;expires_at:string|null;status:string}|null>(null)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email } : null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!supabase || !authUser?.id) { setLinkedStaff(null); return }
    let active = true
    void supabase.from('staff_members').select('id,cafe_id,branch_id,full_name,role,active')
      .eq('auth_user_id',authUser.id).eq('active',true).maybeSingle()
      .then(({data}) => { if(active) setLinkedStaff(data as typeof linkedStaff) })
    return () => { active = false }
  }, [authUser?.id])
  useEffect(() => {
    const client = supabase
    if (!client || !authUser?.id || linkedStaff) { setOwnerWaiterCalls([]); seenOwnerCallIds.current = new Set(); return }
    let active = true
    const refreshOwnerWaiterCalls = async () => {
      const { data, error } = await client.rpc('get_staff_waiter_calls')
      if (!active || error) return
      const calls = (data || []) as Array<{id:string;table_name:string;status:string;created_at:string;branch_id:string}>
      const previous = seenOwnerCallIds.current
      const newlyArrived = calls.find(call => !previous.has(call.id))
      if (previous.size && newlyArrived) setOwnerWaiterToast({id:newlyArrived.id,table_name:newlyArrived.table_name})
      seenOwnerCallIds.current = new Set(calls.map(call => call.id))
      setOwnerWaiterCalls(calls)
    }
    void refreshOwnerWaiterCalls()
    const timer = window.setInterval(() => void refreshOwnerWaiterCalls(), 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [authUser?.id, linkedStaff?.id])
  async function markOwnerWaiterCallHandled(callId:string) {
    const client = supabase
    if (!client) return
    const { error } = await client.rpc('update_waiter_call_status', {p_call_id:callId,p_status:'served'})
    if (error) { setOwnerMessage(error.message); return }
    setOwnerWaiterCalls(current => current.filter(call => call.id !== callId))
    setOwnerWaiterToast(current => current?.id === callId ? null : current)
  }
  useEffect(() => {
    if (!qrTokenFromUrl) return
    let active = true
    async function loadPublicTableInfo() {
      if (!supabase) {
        setQrTableError('The table page is not connected to the service yet.')
        return
      }
      setQrTableLoading(true)
      const { data, error } = await supabase.rpc('get_public_table_info', { p_token: qrTokenFromUrl })
      if (!active) return
      setQrTableLoading(false)
      if (error) {
        setQrTableError('We could not verify this table QR code. Please ask the café team for help.')
        return
      }
      if (!data) {
        setQrTableError('This table QR code is invalid, inactive, or no longer available.')
        return
      }
      const tableInfo = data as {restaurant_name:string;branch_name:string;table_name:string;session_active?:boolean;cafe_slug?:string;slug?:string}
      setQrTableInfo(tableInfo)
      setQrMenuLoading(true)
      setQrMenuError('')
      // The public RPC returns guest-safe menu fields only. Never query private cost/profit tables here.
      const menuSlug = (tableInfo.cafe_slug || tableInfo.slug || tableInfo.restaurant_name
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      const { data: menuData, error: menuError } = await supabase.rpc('get_public_cafe_menu', { p_slug: menuSlug })
      if (!active) return
      setQrMenuLoading(false)
      if (menuError) {
        setQrMenuError('The menu could not be loaded yet. Please ask the café team for assistance.')
        return
      }
      // get_public_cafe_menu returns { categories: [{ name, items: [...] }] }, not a flat item array.
      // Keep a fallback for older flat response shapes while normalizing the current nested schema.
      const menuRoot = menuData as unknown
      const root = menuRoot && typeof menuRoot === 'object' ? menuRoot as Record<string, unknown> : {}
      const categoryRows = Array.isArray(root.categories) ? root.categories : []
      const nestedItems = categoryRows.flatMap(categoryValue => {
        if (!categoryValue || typeof categoryValue !== 'object') return []
        const category = categoryValue as Record<string, unknown>
        const items = Array.isArray(category.items) ? category.items : []
        return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map(item => ({ ...item, category_name: category.name ?? 'Menu' }))
      })
      const legacyItems = Array.isArray(menuRoot) ? menuRoot
        : Array.isArray(root.items) ? root.items
        : Array.isArray(root.menu_items) ? root.menu_items
        : Array.isArray(root.menu) ? root.menu
        : []
      const rawItems = nestedItems.length ? nestedItems : legacyItems
      const normalized = rawItems.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .map((row, index) => {
          const rawPrice = row.price_paise ?? row.price ?? row.selling_price_paise ?? 0
          const numericPrice = Number(rawPrice)
          const priceInPaise = row.price_paise !== undefined || row.selling_price_paise !== undefined
            ? numericPrice : Math.round(numericPrice * 100)
          return {
            id: String(row.id ?? index),
            name: String(row.name ?? row.item_name ?? 'Menu item'),
            description: row.description == null ? null : String(row.description),
            category: String(row.category_name ?? row.category ?? 'Menu'),
            price: Number.isFinite(priceInPaise) ? priceInPaise : 0,
            image: row.image_url == null ? (row.image == null ? null : String(row.image)) : String(row.image_url),
            available: row.is_available !== false && row.available !== false
          }
        }).filter(item => item.available)
      setQrMenuItems(normalized)
      if (!normalized.length) setQrMenuError('The café has not added any available menu items yet.')
    }
    void loadPublicTableInfo()
    return () => { active = false }
  }, [qrTokenFromUrl])
  useEffect(() => {
    const client = supabase
    if (!qrTokenFromUrl || !client) return
    let active = true
    const refreshSessionCode = async () => {
      const { data, error } = await client.rpc('get_public_table_info', { p_token: qrTokenFromUrl })
      if (!active || error) return
      if (!data) {
        setQrTableInfo(current => current ? {...current, session_active: false} : current)
        return
      }
      const latest = data as {session_active?:boolean}
      setQrTableInfo(current => current ? {...current, session_active: Boolean(latest.session_active)} : current)
    }
    const timer = window.setInterval(() => void refreshSessionCode(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [qrTokenFromUrl])
  const t = copy[lang]
  if (qrTokenFromUrl) {
    return <div className="guest-page-shell">
      <main className="guest-page-card">
        <div className="guest-brand-mark"><Coffee size={25}/></div>
        <div className="guest-brand-name">Rivantoq <span>TABLE SERVICE</span></div>
        <div className="guest-welcome-banner"><div className="guest-welcome-copy"><span>GOOD FOOD. GOOD MOMENTS.</span><h1>Welcome to your table</h1><p>Explore the menu and order your favourites, freshly prepared.</p></div><div className="guest-welcome-art"><UtensilsCrossed size={42}/><Sparkles size={19}/></div></div>
        {qrTableLoading && <p role="status" style={{color:'#78716c'}}>Checking your table…</p>}
        {qrTableError && <p role="alert" style={{color:'#b91c1c',lineHeight:1.6}}>{qrTableError}</p>}
        {qrTableInfo && <>
          <p style={{fontSize:18,fontWeight:700,margin:'16px 0 4px',color:'#292524'}}>{qrTableInfo.restaurant_name}</p>
          <p style={{margin:4,color:'#78716c'}}>{qrTableInfo.branch_name}</p>
          <div style={{margin:'22px 0',padding:20,borderRadius:14,background:'#f5f5f4'}}>
            <div style={{fontSize:12,color:'#78716c',fontWeight:700,letterSpacing:1}}>YOUR TABLE</div>
            <div style={{fontSize:30,fontWeight:800,color:'#047857',marginTop:5}}>{qrTableInfo.table_name}</div>
          </div>
          <p style={{fontSize:13,lineHeight:1.6,color:'#78716c'}}>Your table has been identified. Browse the menu. When café staff activate your table, ask them for the six-digit ordering code.</p>
          {qrMenuLoading && <p role="status" style={{fontSize:13,color:'#78716c'}}>Loading menu…</p>}
          {qrMenuError && <p role="status" style={{fontSize:13,color:'#a16207',lineHeight:1.6}}>{qrMenuError}</p>}
          <CustomerOrdering token={qrTokenFromUrl} items={qrMenuItems} sessionActive={Boolean(qrTableInfo.session_active)} />
          <p style={{fontSize:12,fontWeight:700,color:'#a16207',marginTop:18}}>Payment is not collected here. The café team will confirm your order.</p>
        </>}
      </main>
    </div>
  }
  if (linkedStaff && authUser) return <StaffPortal staff={linkedStaff} onSignOut={async()=>{await supabase?.auth.signOut();setAuthUser(null);setLinkedStaff(null)}} />
  const subscriptionExpiry: Date | null = subscription?.expires_at ? new Date(subscription.expires_at) : null
  const subscriptionExpired: boolean = Boolean(subscription && (subscription.status !== 'active' || (subscriptionExpiry !== null && subscriptionExpiry.getTime() <= Date.now())))
  const subscriptionRemaining: number | null = subscriptionExpiry !== null ? Math.max(0, Math.ceil((subscriptionExpiry.getTime() - Date.now()) / 86400000)) : null
  const subscriptionPlanLabel: string = subscription ? (({'1_month':'1 Month','3_months':'3 Months','6_months':'6 Months','9_months':'9 Months','1_year':'1 Year','2_years':'2 Years',lifetime:'Lifetime'} as Record<string,string>)[subscription.plan_code] || subscription.plan_code) : ''
  async function loadSubscription() {
    if (!supabase) return
    setSubscriptionBusy(true)
    setSubscriptionMessage('')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setSubscription(null)
      setSubscriptionMessage('Please sign in to view your subscription.')
      setSubscriptionBusy(false)
      return
    }
    const { data, error } = await supabase.from('subscriptions')
      .select('plan_code,starts_at,expires_at,status')
      .eq('user_id', user.id)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSubscriptionBusy(false)
    if (error) {
      setSubscription(null)
      setSubscriptionMessage(error.message)
      return
    }
    const subscriptionRow = data as {plan_code:string;starts_at:string;expires_at:string|null;status:string} | null
    setSubscription(subscriptionRow)
    setSubscriptionMessage(subscriptionRow ? '' : 'No subscription has been activated for this account yet.')
  }
  async function loadOwnerCafes() {
    if (!supabase || !authUser) return
    setOwnerLoading(true)
    setOwnerMessage('')
    const { data, error } = await supabase.from('cafes')
      .select('id,name,slug,status,created_at')
      .eq('created_by', authUser.id)
      .order('created_at', { ascending: false })
    setOwnerLoading(false)
    if (error) {
      setOwnerMessage(error.message)
      return
    }
    setOwnerCafes(data || [])
  }
  async function loadTableSetup(cafeId: string) {
    if (!supabase || !cafeId) return
    setTableBusy(true)
    setTableMessage('')
    setNewTableToken('')
    const [{ data: branches, error: branchError }, { data: tables, error: tableError }] = await Promise.all([
      supabase.from('branches').select('id,name').eq('cafe_id', cafeId).eq('active', true).order('created_at'),
      supabase.from('dining_tables').select('id,table_name,branch_id,active,created_at').eq('cafe_id', cafeId).order('created_at', { ascending: false })
    ])
    setTableBusy(false)
    if (branchError || tableError) {
      setTableMessage(branchError?.message || tableError?.message || 'Could not load tables.')
      return
    }
    const branchRows = branches || []
    setTableBranches(branchRows)
    setTableBranchId(current => branchRows.some(branch => branch.id === current) ? current : (branchRows[0]?.id || ''))
    setDiningTables(tables || [])
  }
  async function createDiningTable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || !tableCafeId || !tableBranchId || !tableName.trim()) return
    setTableBusy(true)
    setTableMessage('')
    setNewTableToken('')
    const { data, error } = await supabase.rpc('create_dining_table_with_qr', {
      p_cafe_id: tableCafeId,
      p_branch_id: tableBranchId,
      p_table_name: tableName.trim()
    })
    setTableBusy(false)
    if (error) {
      setTableMessage(error.message)
      return
    }
    const created = data as { id: string; table_name: string; qr_token: string } | null
    if (!created?.qr_token) {
      setTableMessage('The table was created, but no one-time QR token was returned. Refresh the table list before trying again.')
      await loadTableSetup(tableCafeId)
      return
    }
    setNewTableToken(created.qr_token)
    setTableMessage(created.table_name + ' created. Save the one-time token securely; it cannot be retrieved again.')
    setTableName('Table ' + (diningTables.length + 2))
    await loadTableSetup(tableCafeId)
    setNewTableToken(created.qr_token)
  }
  async function createCafe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || !authUser) {
      setOwnerMessage('Please sign in again to create your restaurant.')
      return
    }
    setOwnerBusy(true)
    setOwnerMessage('')
    const { data, error } = await supabase.rpc('create_cafe_with_owner', {
      p_name: cafeName.trim(),
      p_slug: cafeSlug.trim().toLowerCase(),
      p_description: cafeDescription.trim() || null,
      p_contact_phone: cafePhone.trim() || null,
      p_branch_name: branchName.trim() || 'Main Branch',
      p_address: branchAddress.trim() || null
    })
    setOwnerBusy(false)
    if (error) {
      setOwnerMessage(error.message)
      return
    }
    setOwnerMessage('Restaurant created. Your owner access and first branch are ready.')
    setCafeName('')
    setCafeSlug('')
    setCafeDescription('')
    setCafePhone('')
    setBranchName('Main Branch')
    setBranchAddress('')
    await loadOwnerCafes()
    if (!data) setOwnerMessage('The restaurant creation request returned no café ID. Please refresh the list and check before trying again.')
  }
  async function loadAdminRequests() {
    if (!supabase) return
    setAdminBusy(true)
    setAdminMessage('')
    const { data: allowed, error: accessError } = await supabase.rpc('is_super_admin')
    if (accessError || !allowed) {
      setAdminRequests([])
      setAdminMessage(accessError ? accessError.message : 'This account is not registered as a Super Admin.')
      setAdminBusy(false)
      return
    }
    const { data, error } = await supabase.from('subscription_payment_requests')
      .select('id,user_id,plan_name,amount_paise,upi_transaction_ref,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setAdminBusy(false)
    if (error) {
      setAdminMessage(error.message)
      return
    }
    setAdminRequests(data || [])
    setAdminMessage(data?.length ? '' : 'No pending payment requests.')
  }
  async function loadPendingCafes() {
    if (!supabase) return
    setAdminBusy(true)
    setAdminMessage('')
    const { data: allowed, error: accessError } = await supabase.rpc('is_super_admin')
    if (accessError || !allowed) {
      setPendingCafes([])
      setAdminMessage(accessError ? accessError.message : 'This account is not registered as a Super Admin.')
      setAdminBusy(false)
      return
    }
    const { data, error } = await supabase.rpc('admin_list_pending_cafes')
    setAdminBusy(false)
    if (error) {
      setPendingCafes([])
      setAdminMessage(error.message)
      return
    }
    setPendingCafes(data || [])
    setAdminMessage(data?.length ? '' : 'No pending restaurants.')
  }
  async function reviewCafe(id: string, decision: 'approved'|'rejected') {
    if (!supabase) return
    const confirmed = window.confirm(decision === 'approved' ? 'Approve this restaurant?' : 'Reject this restaurant?')
    if (!confirmed) return
    setAdminBusy(true)
    setAdminMessage('')
    const { error } = await supabase.rpc('admin_review_cafe', { p_cafe_id: id, p_decision: decision })
    setAdminBusy(false)
    if (error) {
      setAdminMessage(error.message)
      return
    }
    setAdminMessage(decision === 'approved' ? 'Restaurant approved.' : 'Restaurant rejected.')
    await loadPendingCafes()
  }
  async function reviewPayment(id: string, decision: 'approved'|'rejected') {
    if (!supabase) return
    const note = decision === 'rejected' ? window.prompt('Optional reason for rejection (do not include sensitive information):') : null
    if (decision === 'rejected' && note === null) return
    setAdminBusy(true)
    setAdminMessage('')
    const { error } = await supabase.rpc('review_subscription_payment', {
      request_id: id,
      decision,
      note
    })
    setAdminBusy(false)
    if (error) {
      setAdminMessage(error.message)
      return
    }
    setAdminMessage(decision === 'approved' ? 'Request approved and subscription activated.' : 'Request rejected.')
    await loadAdminRequests()
  }
  async function submitPaymentRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || !selectedPlan) return
    setPaymentBusy(true)
    setPaymentMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPaymentBusy(false)
      setSelectedPlan(null)
      setAuthMode('signin')
      setDashboard(true)
      setAuthMessage('Please sign in first. Then choose your plan again to submit its payment reference.')
      return
    }
    const planCode = selectedPlan.name.toLowerCase().replace(/ /g, '_')
    const amountPaise = Number(selectedPlan.price.replace(/[^0-9]/g, '')) * 100
    const { error } = await supabase.from('subscription_payment_requests').insert({
      user_id: user.id,
      plan_code: planCode,
      plan_name: selectedPlan.name,
      amount_paise: amountPaise,
      upi_transaction_ref: paymentReference.trim()
    })
    setPaymentBusy(false)
    if (error) {
      setPaymentMessage(error.code === '23505' ? 'This UPI transaction reference has already been submitted.' : error.message)
    } else {
      setPaymentMessage('Payment reference submitted. Your request is pending manual verification; your plan is not active until it is approved.')
      setPaymentReference('')
    }
  }
  return <div className="app-shell">
    <header className="nav wrap">
      <a className="brand" href="#"><span className="brand-mark"><Coffee size={21}/></span><span>Rivantoq</span></a>
      <nav className={menu?'nav-links open':'nav-links'}>{t.nav.map((n,i)=><a key={n} href={['#platform','#features','#pricing'][i]} onClick={()=>setMenu(false)}>{n}</a>)}</nav>
      <div className="nav-actions"><button className="lang" onClick={()=>setLang(lang==='en'?'hi':'en')}><Globe2 size={16}/>{lang==='en'?'हिन्दी':'English'}<ChevronDown size={14}/></button>{authUser?<><button className="text-btn owner-dashboard-link" onClick={()=>{setOwnerOpen(true);void loadOwnerCafes()}}>Owner dashboard</button><button className="text-btn" onClick={async()=>{if(!supabase)return;const {data}=await supabase.from("profiles").select("full_name").eq("id",authUser.id).maybeSingle();setProfileName(data?.full_name||"");setEmail(authUser.email||"");setProfileMessage("");setProfileOpen(true)}}>My profile</button><button className="text-btn" onClick={async()=>{if(supabase)await supabase.auth.signOut();setAuthUser(null);setProfileOpen(false);setDashboard(false)}}>Sign out</button></>:<><button className="text-btn" onClick={()=>setDashboard(true)}>{t.sign}</button><a className="btn btn-small" href="#pricing">{t.start}<ArrowRight size={15}/></a></>}</div>
      <button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label={menu?'Close navigation menu':'Open navigation menu'} aria-expanded={menu}>{menu?<X/>:<Menu/>}</button>
    </header>
    <main>
      <section className="hero wrap">
        <div className="hero-copy"><div className="eyebrow"><span className="pulse"></span>{t.pill}</div><h1>{t.heroA}<br/><em>{t.heroB}</em></h1><p className="hero-sub">{t.sub}</p><div className="hero-actions"><a className="btn" href="#platform">{t.cta}<ArrowRight size={17}/></a><a className="link-btn" href="#features">{t.secondary}<span>↗</span></a></div><div className="hero-note"><ShieldCheck size={16}/> Built for independent cafés and growing teams</div></div>
        <div className="hero-art"><div className="float-chip chip-one"><span className="chip-icon green"><Check size={15}/></span><span><b>Sample order received</b><small>Table 08 · Preview</small></span></div><div className="dashboard-card"><div className="dash-top"><div><small>PRODUCT PREVIEW · SAMPLE DATA</small><h3>Good morning ☀️</h3></div><div className="avatar">R</div></div><div className="dash-stats"><div><small>Today's sales</small><b>₹24,580</b><span className="up">↗ 12.8%</span></div><div><small>Orders today</small><b>128</b><span className="muted">Across all tables</span></div></div><div className="chart-head"><b>Sales overview</b><small>This week⌄</small></div><div className="bars">{[35,52,43,72,57,88,66,100,76,91,68,84].map((v,i)=><i key={i} style={{height:v+'%'}}/>)}</div><div className="chart-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div><div className="dash-bottom"><span><i className="dot dot-green"/> Dine-in <b>68%</b></span><span><i className="dot dot-orange"/> Takeaway <b>32%</b></span></div></div><div className="float-chip chip-two"><span className="chip-icon orange"><Coffee size={15}/></span><span><b>Sample kitchen view</b><small>Example status · Preview</small></span></div><div className="orb orb-a"></div><div className="orb orb-b"></div></div>
      </section>
      <section className="trust wrap"><span>{t.trusted}</span><div><b>ORDERS</b><b>PEOPLE</b><b>BRANCHES</b><b>SUBSCRIPTIONS</b></div></section>
      <section className="platform-section" id="platform"><div className="wrap section-center"><div className="eyebrow centered">ONE WORKSPACE. EVERY WORKFLOW.</div><h2>{t.platform}</h2><p>{t.platformSub}</p><div className="workflow"><div className="workflow-item"><span className="wf-icon"><QrCode/></span><b>Guest orders</b><small>Scan · Browse · Order</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><LayoutDashboard/></span><b>Owner workspace</b><small>Tables · menus · orders</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><Coffee/></span><b>Order management</b><small>Review · update · notify</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><BarChart3/></span><b>Subscriptions</b><small>Choose plan · admin review</small></div></div></div></section>
      <section className="experience-section" aria-labelledby="experience-title">
        <div className="wrap experience-wrap">
          <div className="experience-intro"><div className="eyebrow">A CLOSER LOOK AT RIVANTOQ</div><h2 id="experience-title">One platform.<br/><em>Every moving part.</em></h2><p>Explore how the different Rivantoq tools fit together. This is a product overview, not a live account or real-time dashboard.</p></div>
          <div className="experience-tabs" aria-label="Choose a Rivantoq product area">
            {tourSteps.map((step,index)=><button key={step.label} type="button" aria-pressed={activeTour===index} className={activeTour===index?'experience-tab active':'experience-tab'} onClick={()=>setActiveTour(index)}><step.icon size={17}/><span>{step.label}</span><ArrowRight size={14}/></button>)}
          </div>
          <article className="experience-panel" id="tour-panel">
            <div className="experience-copy"><span className="experience-eyebrow">{tourSteps[activeTour].eyebrow}</span><h3>{tourSteps[activeTour].title}</h3><p>{tourSteps[activeTour].desc}</p><div className="experience-detail"><Check size={16}/><span>{tourSteps[activeTour].detail}</span></div><a className="experience-link" href="#features">Explore platform features <ArrowRight size={15}/></a></div>
            <div className="experience-visual" aria-hidden="true"><div className="experience-window"><div className="window-top"><span></span><span></span><span></span><b>RIVANTOQ / {tourSteps[activeTour].eyebrow}</b></div><div className="window-content"><div className="window-brand"><span className="window-mark">R</span><div><b>{tourSteps[activeTour].label}</b><small>Every service. One system.</small></div></div><div className="window-metric"><small>WORKFLOW</small><strong>{tourSteps[activeTour].metric}</strong><div className="window-bars"><i/><i/><i/><i/><i/><i/><i/></div></div><div className="window-row"><span><i></i>Connected workspace</span><b>Ready for service</b></div></div></div><div className="experience-orbit orbit-one"></div><div className="experience-orbit orbit-two"></div><div className="experience-stamp"><Sparkles size={15}/> Made for hospitality</div></div>
          </article>
        </div>
      </section>
      <section className="features wrap" id="features"><div className="section-heading"><div><div className="eyebrow">MADE FOR THE DAILY RUSH</div><h2>{t.featureTitle}</h2></div><p>{t.featureSub}</p></div><div className="feature-grid">{features.map((f,i)=><article className="feature-card" key={f.title}><span className={'feature-icon tone-'+i}><f.icon size={21}/></span><h3>{f.title}</h3><p>{f.desc}</p><a href="#pricing">Explore feature <ArrowRight size={14}/></a></article>)}</div></section>
      <section className="pricing-section" id="pricing"><div className="wrap"><div className="section-center"><div className="eyebrow centered">STRAIGHTFORWARD SUBSCRIPTIONS</div><h2>{t.pricing}</h2><p>{t.pricingSub}</p></div><div className="pricing-grid">{plans.map(p=><article className={p.popular?'price-card popular':'price-card'} key={p.name}>{p.popular&&<span className="popular-label">MOST POPULAR</span>}<h3>{p.name}</h3><div className="price">{p.price}</div><p className="price-term">{p.term} · Rivantoq platform access</p><ul><li><Check/> QR menu & guest ordering</li><li><Check/> Owner dashboard & menu management</li><li><Check/> Branch and order management</li><li><Check/> English & Hindi interface</li></ul><button className={p.popular?'btn':'outline-btn'} onClick={()=>{if(authUser){setSelectedPlan(p);setPaymentMessage('');setPaymentReference('')}else{setAuthMode('signin');setDashboard(true);setAuthMessage('Please sign in or create a Rivantoq account before paying for a plan.')}}}>{t.choose}<ArrowRight size={15}/></button></article>)}</div><p className="pricing-footnote">Pay via UPI and submit your transaction reference. Your subscription activates only after an administrator verifies the payment.</p></div></section>
      <section className="faq-section" id="faq"><div className="wrap faq-wrap"><div className="faq-heading"><div className="eyebrow">GOOD TO KNOW</div><h2>Questions, answered.</h2><p>A few useful details before you bring your café onto Rivantoq.</p></div><div className="faq-list">
        <details><summary>Can one café owner access another café’s dashboard or customer data?<span>+</span></summary><p>No. Each owner’s workspace is limited to cafés connected to that owner’s account. Café records and customer/order data are protected by account-scoped database permissions; owners cannot browse another café’s workspace.</p></details>
        <details><summary>Do customers need to create an account to place an order?<span>+</span></summary><p>No. Guests can scan the table QR and browse the menu without creating an account. Ordering is enabled after café staff activate that table’s session and provide its six-digit code. Repeated incorrect code attempts trigger a temporary lockout.</p></details>
        <details><summary>Does Rivantoq collect or automatically verify restaurant payments?<span>+</span></summary><p>No. Restaurant UPI payments are made directly to the café using its payment details. The café team must verify receipt independently and update the order. Rivantoq does not collect the restaurant’s funds or automatically confirm a customer’s UPI payment.</p></details>
        <details><summary>How are Rivantoq subscription payments activated?<span>+</span></summary><p>Choose a plan, pay using the displayed Rivantoq UPI QR or UPI ID, and submit the transaction reference. Your subscription remains pending until an administrator checks the payment and approves the request. Never share your UPI PIN or OTP.</p></details>
        <details><summary>How do staff members join a café workspace?<span>+</span></summary><p>The café owner creates a staff invitation and securely shares its one-time invitation code with the intended team member. The staff member signs in or creates an account using the invited email address, then claims the code. Their workspace and permissions depend on the role assigned by the café.</p></details>
        <details><summary>Does Rivantoq send notifications when the owner dashboard is closed?<span>+</span></summary><p>Order alerts are shown in the browser while the owner dashboard is open. Background web push notifications are not currently supported, so keep the dashboard open during service if you rely on these alerts.</p></details>
        <details><summary>Can I use Rivantoq on a tablet or phone?<span>+</span></summary><p>Yes. The interface is responsive and supports tablet and phone screens. Before a live shift, check the devices and browsers your café plans to use.</p></details>
      </div></div></section>
      <section className="closing wrap"><div><div className="eyebrow">YOUR CAFÉ. YOUR CRAFT.</div><h2>Make room for<br/><em>what matters.</em></h2></div><a className="btn" href="#pricing">Find your Rivantoq plan <ArrowRight size={17}/></a></section>
    </main>
    <footer className="footer"><div className="wrap footer-inner"><a className="brand" href="#"><span className="brand-mark"><Coffee size={20}/></span><span>Rivantoq</span></a><p>{t.footer} © 2026 Rivantoq.</p><button className="text-btn" onClick={()=>{setSubscriptionOpen(true);void loadSubscription()}}>My subscription</button><button className="text-btn" onClick={()=>{setAdminOpen(true);void loadAdminRequests()}}>Super Admin</button><a className="text-btn" href="#faq">Help & FAQ</a><span>Built for better café days.</span></div></footer>
    {ownerWaiterToast&&<div role="status" aria-live="polite" style={{position:'fixed',right:18,bottom:18,zIndex:10000,maxWidth:360,width:'calc(100% - 36px)',padding:16,borderRadius:14,background:'#064e3b',color:'#fff',boxShadow:'0 12px 36px rgba(0,0,0,.22)'}}><div style={{display:'flex',alignItems:'center',gap:9,fontWeight:800}}><Bell size={18}/> New waiter call</div><p style={{fontSize:13,margin:'8px 0 12px'}}>{ownerWaiterToast.table_name} is requesting assistance.</p><div style={{display:'flex',gap:8}}><button type="button" onClick={()=>{setOwnerOpen(true);void loadOwnerCafes();setOwnerWaiterToast(null)}} style={{border:0,borderRadius:8,padding:'8px 12px',fontWeight:700}}>Open owner dashboard</button><button type="button" onClick={()=>setOwnerWaiterToast(null)} style={{border:'1px solid rgba(255,255,255,.45)',background:'transparent',color:'#fff',borderRadius:8,padding:'8px 12px'}}>Dismiss</button></div></div>}
    {selectedPlan&&<div className="modal-backdrop" onClick={()=>setSelectedPlan(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedPlan(null)}><X/></button><span className="modal-icon"><QrCode/></span><h2>Complete your plan purchase</h2><p>Selected plan: <b>{selectedPlan.name}</b></p><div style={{fontSize:30,fontWeight:800,color:'#059669',margin:'8px 0 18px'}}>{selectedPlan.price}</div><div style={{background:'#f5f5f4',borderRadius:14,padding:18,marginBottom:14}}><div style={{width:190,height:190,margin:'0 auto 12px',borderRadius:12,display:'grid',placeItems:'center',background:'#fff',padding:8}}><QRCodeSVG value={`upi://pay?pa=${encodeURIComponent('misbahkhan19@fam')}&pn=${encodeURIComponent('Rivantoq')}&am=${Number(selectedPlan.price.replace(/[^0-9]/g,''))}&cu=INR`} size={174} level="M" includeMargin /></div><p style={{fontSize:12,margin:'0 0 8px',textAlign:'center'}}>Scan with any supported UPI app to pay the selected plan amount of {selectedPlan.price}</p><div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}><b style={{fontSize:15}}>misbahkhan19@fam</b><button type="button" className="outline-btn" onClick={()=>navigator.clipboard?.writeText('misbahkhan19@fam')}>Copy UPI ID</button></div></div><p style={{fontSize:12,lineHeight:1.6}}>After paying through UPI, enter the UPI transaction reference below. Do not enter your UPI PIN or share an OTP. Your plan stays inactive until an administrator verifies the payment.</p><form onSubmit={submitPaymentRequest} style={{display:'grid',gap:10,textAlign:'left'}}><label style={{fontSize:12}}>UPI transaction reference<input required minLength={6} maxLength={80} value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="Enter UPI transaction ID" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label><button className="btn" disabled={paymentBusy||!supabaseConfigured} style={{width:'100%',justifyContent:'center'}}>{paymentBusy?'Submitting…':'Submit for verification'} <ArrowRight size={15}/></button></form>{paymentMessage&&<p role="status" style={{fontSize:12,lineHeight:1.6,overflowWrap:'anywhere'}}>{paymentMessage}</p>}<button className="outline-btn" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={()=>setSelectedPlan(null)}>Close</button></div></div>}
    {subscriptionOpen&&<div className="modal-backdrop" onClick={()=>setSubscriptionOpen(false)}><div className="modal" style={{maxWidth:520,width:'100%',textAlign:'left'}} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSubscriptionOpen(false)}><X/></button><span className="modal-icon"><ShieldCheck/></span><h2 style={{textAlign:'center'}}>My subscription</h2><p style={{textAlign:'center'}}>Your Rivantoq plan and validity, securely loaded from your account.</p><div style={{display:'flex',justifyContent:'flex-end',margin:'14px 0'}}><button className="outline-btn" style={{width:'auto',padding:'10px 14px'}} onClick={()=>void loadSubscription()} disabled={subscriptionBusy}>Refresh status</button></div>{subscriptionBusy&&<p role="status">Loading subscription…</p>}{subscriptionMessage&&<p role="status" style={{textAlign:'center'}}>{subscriptionMessage}</p>}{subscription&&<div style={{border:'1px solid #e7e5e4',borderRadius:14,padding:18,marginTop:12}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><div><small style={{color:'#78716c'}}>CURRENT PLAN</small><h3 style={{margin:'5px 0',fontSize:22}}>{subscriptionPlanLabel}</h3></div><span style={{background:subscriptionExpired?'#fef2f2':'#dcfce7',color:subscriptionExpired?'#b91c1c':'#047857',padding:'7px 11px',borderRadius:20,fontSize:12,fontWeight:700}}>{subscriptionExpired?'Expired':'Active'}</span></div><div style={{display:'grid',gap:12,marginTop:18}}><div style={{display:'flex',gap:10,alignItems:'center'}}><Check size={18} color="#059669"/><span style={{fontSize:13}}>Started: <b>{new Date(subscription.starts_at).toLocaleDateString()}</b></span></div><div style={{display:'flex',gap:10,alignItems:'center'}}><Coffee size={18} color="#059669"/><span style={{fontSize:13}}>{subscriptionExpiry?<>Expires: <b>{subscriptionExpiry.toLocaleDateString()}</b></>:<b>Lifetime access — no expiry date</b>}</span></div>{subscriptionRemaining!==null&&<p style={{fontSize:13,margin:0,color:subscriptionExpired?'#b91c1c':'#047857',fontWeight:700}}>{subscriptionExpired?'This subscription has expired.':`${subscriptionRemaining} days remaining.`}</p>}</div></div>}{!subscriptionBusy&&<button className="btn" style={{width:'100%',marginTop:18,justifyContent:'center'}} onClick={()=>{setSubscriptionOpen(false);document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'})}}>View renewal plans <ArrowRight size={15}/></button>}<button className="outline-btn" style={{width:'100%',marginTop:10}} onClick={()=>setSubscriptionOpen(false)}>Close</button></div></div>}
    {adminOpen&&<div className="modal-backdrop" onClick={()=>setAdminOpen(false)}><div className="modal" style={{maxWidth:760,width:'100%',maxHeight:'90vh',overflowY:'auto',textAlign:'left'}} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setAdminOpen(false)}><X/></button><span className="modal-icon"><ShieldCheck/></span><h2 style={{textAlign:'center'}}>Super Admin · Payment review</h2><p style={{textAlign:'center'}}>Only a registered Super Admin can view and review pending requests. Verify each payment independently before approving.</p><div style={{display:'flex',justifyContent:'flex-end',margin:'16px 0'}}><button className="outline-btn" style={{width:'auto',padding:'10px 14px'}} onClick={()=>void loadAdminRequests()} disabled={adminBusy}>Refresh requests</button></div>{adminBusy&&<p role="status">Loading…</p>}{adminMessage&&<p role="status">{adminMessage}</p>}<div style={{borderTop:'1px solid #eee9df',paddingTop:18,marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><h3 style={{fontSize:16,margin:0}}>Pending restaurant approvals</h3><button className="outline-btn" style={{width:'auto',padding:'9px 12px'}} onClick={()=>void loadPendingCafes()} disabled={adminBusy}>Refresh restaurants</button></div><p style={{fontSize:12,color:'#78716c'}}>Review newly registered restaurants before they become active.</p>{pendingCafes.length===0&&!adminBusy&&<p style={{fontSize:12}}>No pending restaurants loaded. Select Refresh restaurants.</p>}<div style={{display:'grid',gap:12}}>{pendingCafes.map(cafe=><article key={cafe.id} style={{border:'1px solid #e7e5e4',borderRadius:12,padding:14}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><b>{cafe.name}</b><small style={{color:'#a16207',fontWeight:700}}>Pending</small></div><p style={{fontSize:12,margin:'7px 0'}}>Slug: {cafe.slug}</p>{cafe.description&&<p style={{fontSize:12,margin:'7px 0'}}>{cafe.description}</p>}{cafe.contact_phone&&<p style={{fontSize:12,margin:'7px 0'}}>Phone: {cafe.contact_phone}</p>}<p style={{fontSize:11,color:'#78716c',overflowWrap:'anywhere'}}>Owner account ID: {cafe.created_by}</p><small style={{color:'#78716c'}}>Submitted: {new Date(cafe.created_at).toLocaleString()}</small><div style={{display:'flex',gap:8,marginTop:12}}><button className="btn" style={{padding:'10px 14px'}} disabled={adminBusy} onClick={()=>void reviewCafe(cafe.id,'approved')}>Approve</button><button className="outline-btn" style={{width:'auto',padding:'10px 14px'}} disabled={adminBusy} onClick={()=>void reviewCafe(cafe.id,'rejected')}>Reject</button></div></article>)}</div></div><div style={{display:'grid',gap:12}}>{adminRequests.map(request=><article key={request.id} style={{border:'1px solid #e7e5e4',borderRadius:12,padding:14}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><b>{request.plan_name} · ₹{(request.amount_paise/100).toLocaleString('en-IN')}</b><small style={{color:'#78716c'}}>{new Date(request.created_at).toLocaleString()}</small></div><p style={{fontSize:12,overflowWrap:'anywhere',margin:'8px 0'}}>UPI reference: <b>{request.upi_transaction_ref}</b></p><p style={{fontSize:11,overflowWrap:'anywhere',margin:'4px 0',color:'#78716c'}}>Customer account ID: {request.user_id}</p><div style={{display:'flex',gap:8,marginTop:12}}><button className="btn" style={{padding:'10px 14px'}} disabled={adminBusy} onClick={()=>void reviewPayment(request.id,'approved')}>Approve & activate</button><button className="outline-btn" style={{width:'auto',padding:'10px 14px'}} disabled={adminBusy} onClick={()=>void reviewPayment(request.id,'rejected')}>Reject</button></div></article>)}</div><p style={{fontSize:11,marginTop:16}}>Safety: approval is final and activates the selected plan. Compare the reference, amount and recipient against your payment provider's actual transaction record first. Never rely only on a screenshot or customer claim.</p><button className="outline-btn" style={{width:'100%',marginTop:10}} onClick={()=>setAdminOpen(false)}>Close</button></div></div>}
    {ownerOpen&&<div className="modal-backdrop" onClick={()=>setOwnerOpen(false)}><div className="modal owner-workspace-modal" style={{width:'min(1440px, calc(100vw - 32px))',maxHeight:'94vh',overflowY:'auto',textAlign:'left'}} role="dialog" aria-modal="true" aria-label="Restaurant owner workspace" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close owner workspace" onClick={()=>setOwnerOpen(false)}><X/></button><span className="modal-icon"><LayoutDashboard/></span><h2 style={{textAlign:'center'}}>Restaurant owner workspace</h2><p style={{textAlign:'center'}}>Create your restaurant profile to begin setting up Rivantoq.</p><section style={{margin:'16px 0',padding:15,border:'1px solid #fcd34d',borderRadius:13,background:'#fffbeb'}}><h3 style={{fontSize:16,display:'flex',alignItems:'center',gap:8,margin:'0 0 10px'}}><Bell size={18}/> Customer waiter calls <span style={{fontSize:11,color:'#92400e'}}>({ownerWaiterCalls.length})</span></h3>{ownerWaiterCalls.map(call=><article key={call.id} style={{background:'#fff',border:'1px solid #fde68a',borderRadius:10,padding:12,marginTop:8,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><div><b>{call.table_name}</b><small style={{display:'block',color:'#78716c',marginTop:4}}>Waiter requested · {new Date(call.created_at).toLocaleTimeString()}</small></div><button type="button" className="outline-btn" style={{width:'auto',padding:'8px 11px'}} onClick={()=>void markOwnerWaiterCallHandled(call.id)}>Mark handled</button></article>)}{ownerWaiterCalls.length===0&&<p style={{fontSize:12,color:'#78716c',margin:0}}>No active waiter calls. New requests appear automatically.</p>}</section><div style={{display:'grid',gap:10,margin:'18px 0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><h3 style={{fontSize:15,margin:0}}>Your restaurants</h3><button type="button" className="outline-btn" style={{width:'auto',padding:'8px 12px'}} onClick={()=>void loadOwnerCafes()} disabled={ownerLoading}>Refresh</button></div>{ownerLoading&&<p role="status">Loading your restaurants…</p>}{ownerCafes.map(cafe=><article key={cafe.id} style={{border:'1px solid #e7e5e4',borderRadius:12,padding:14}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><b>{cafe.name}</b><span style={{fontSize:11,color:cafe.status==='approved'?'#047857':'#a16207',fontWeight:700,textTransform:'capitalize'}}>{cafe.status}</span></div><small style={{color:'#78716c'}}>Rivantoq.app/{cafe.slug}</small></article>)}{!ownerLoading&&ownerCafes.length===0&&<p style={{fontSize:12}}>You haven't added a restaurant yet. Use the form below to create your first one.</p>}</div><MenuManager cafes={ownerCafes.filter(cafe=>cafe.status==='approved')} />
<OwnerOrders cafes={ownerCafes.filter(cafe=>cafe.status==='approved')} />
<OwnerPOS cafes={ownerCafes.filter(cafe=>cafe.status==='approved')} />
<OwnerPaymentSettings cafes={ownerCafes.filter(cafe=>cafe.status==='approved')} />
 <OwnerOperations cafes={ownerCafes.filter(cafe=>cafe.status==='approved')} />
<div style={{borderTop:'1px solid #eee9df',paddingTop:18,marginTop:18}}>
<h3 style={{fontSize:16,margin:'0 0 12px'}}>Tables & QR setup</h3>
<p style={{fontSize:12,color:'#78716c'}}>Create tables and activate or end a table session. Customers see the active session code automatically after scanning the table QR.</p>
<label style={{fontSize:12}}>Restaurant
<select value={tableCafeId} onChange={e=>{setTableCafeId(e.target.value);void loadTableSetup(e.target.value)}} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,background:'#fff'}}>
<option value="">Select restaurant</option>{ownerCafes.filter(cafe=>cafe.status==='approved').map(cafe=><option key={cafe.id} value={cafe.id}>{cafe.name}</option>)}
</select></label>
{tableCafeId&&<><label style={{fontSize:12,display:'block',marginTop:10}}>Branch
<select value={tableBranchId} onChange={e=>setTableBranchId(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,background:'#fff'}}>
{tableBranches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
</select></label>
<form onSubmit={createDiningTable} style={{display:'grid',gap:10,marginTop:12}}>
<label style={{fontSize:12}}>Table name<input required maxLength={60} value={tableName} onChange={e=>setTableName(e.target.value)} placeholder="e.g. Table 1" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label>
<button className="btn" disabled={tableBusy||!tableBranchId||!supabaseConfigured} style={{justifyContent:'center'}}>{tableBusy?'Please wait…':'Create table' } <QrCode size={15}/></button>
</form>
{tableMessage&&<p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{tableMessage}</p>}
{newTableToken&&<div style={{border:'1px solid #f59e0b',background:'#fffbeb',borderRadius:10,padding:12,marginTop:10}}>
<b style={{fontSize:12}}>Guest table QR code</b>
<p style={{fontSize:11,margin:'6px 0',overflowWrap:'anywhere'}}>{newTableToken}</p>
<button type="button" className="outline-btn" style={{width:'auto',padding:'8px 12px'}} onClick={()=>void navigator.clipboard?.writeText(newTableToken)}>Copy token</button>
<p style={{fontSize:11,margin:'8px 0 0'}}>Display this QR at the table. When the owner activates the table session, customers see its session code automatically.</p>
<div id="new-table-qr" style={{display:'flex',justifyContent:'center',padding:14,background:'#fff',borderRadius:10,marginTop:10}}><QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL}?table=${encodeURIComponent(newTableToken)}`} size={220} level="M" includeMargin /></div>
<button type="button" className="btn" style={{width:'100%',justifyContent:'center',marginTop:9}} onClick={async()=>{
 const svg=document.querySelector('#new-table-qr svg') as SVGSVGElement|null;
 if(!svg)return;
 const serialized=new XMLSerializer().serializeToString(svg);
 const svgUrl=URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}));
 try {
  const image=new Image();image.src=svgUrl;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=880;canvas.height=880;
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
  context.fillStyle='#ffffff';context.fillRect(0,0,880,880);context.drawImage(image,0,0,880,880);
  const png=canvas.toDataURL('image/png');
  const link=document.createElement('a');link.href=png;link.download='Rivantoq-table-QR.png';document.body.appendChild(link);link.click();link.remove();
 } catch { const link=document.createElement('a');link.href=svgUrl;link.download='Rivantoq-table-QR.svg';document.body.appendChild(link);link.click();link.remove(); }
 finally { URL.revokeObjectURL(svgUrl); }
}}>Download QR Code (PNG)</button>
<p style={{fontSize:11,margin:'6px 0 0',textAlign:'center',color:'#78716c'}}>Scan to identify this table, browse the menu, and order when the owner opens the table session.</p>
</div>}
<div style={{display:'grid',gap:8,marginTop:14}}>
<b style={{fontSize:13}}>Existing tables</b>
{tableBusy&&<small>Loading tables…</small>}
{diningTables.filter(table=>table.branch_id===tableBranchId).map(table=><div key={table.id} style={{border:'1px solid #e7e5e4',borderRadius:9,padding:10,fontSize:12}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><b>{table.table_name}</b><span style={{color:table.active?'#047857':'#78716c'}}>{table.active?'Active':'Inactive'}</span></div>{table.active&&<TablePinIssuer tableId={table.id}/>}</div>)}
{!tableBusy&&tableCafeId&&diningTables.filter(table=>table.branch_id===tableBranchId).length===0&&<small>No tables created for this branch yet.</small>}
</div></>}
</div><div style={{borderTop:'1px solid #eee9df',paddingTop:18}}><h3 style={{fontSize:16,margin:'0 0 12px'}}>Add a restaurant</h3><form onSubmit={createCafe} style={{display:'grid',gap:11}}><label style={{fontSize:12}}>Restaurant name<input required minLength={2} maxLength={100} value={cafeName} onChange={e=>{setCafeName(e.target.value);setCafeSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}} placeholder="e.g. The Green Cup" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}}/></label><label style={{fontSize:12}}>Restaurant web address<input required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={cafeSlug} onChange={e=>setCafeSlug(e.target.value.toLowerCase())} placeholder="the-green-cup" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}}/><small style={{color:'#78716c'}}>Lowercase letters, numbers and hyphens only.</small></label><label style={{fontSize:12}}>Description (optional)<textarea maxLength={500} value={cafeDescription} onChange={e=>setCafeDescription(e.target.value)} placeholder="Tell guests a little about your restaurant" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,minHeight:70}}/></label><label style={{fontSize:12}}>Contact phone (optional)<input type="tel" maxLength={25} value={cafePhone} onChange={e=>setCafePhone(e.target.value)} placeholder="Restaurant contact number" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}}/></label><label style={{fontSize:12}}>First branch name<input required maxLength={100} value={branchName} onChange={e=>setBranchName(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}}/></label><label style={{fontSize:12}}>Branch address (optional)<textarea maxLength={300} value={branchAddress} onChange={e=>setBranchAddress(e.target.value)} placeholder="Street, area, city" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,minHeight:65}}/></label><button className="btn" disabled={ownerBusy||!supabaseConfigured} style={{justifyContent:'center'}}>{ownerBusy?'Creating…':'Create restaurant'} <ArrowRight size={15}/></button></form></div>{ownerMessage&&<p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{ownerMessage}</p>}<button className="outline-btn" style={{width:'100%',marginTop:10}} onClick={()=>setOwnerOpen(false)}>Close</button></div></div>}
    {profileOpen&&<div className="modal-backdrop"><div className="modal" style={{maxWidth:520,width:'100%',textAlign:'left'}}><span className="modal-icon"><Users/></span><h2 style={{textAlign:'center'}}>Your Rivantoq profile</h2><p style={{textAlign:'center'}}>Complete your profile details to continue.</p><form onSubmit={async (e: FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!supabase)return;setProfileBusy(true);setProfileMessage('');const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){setProfileBusy(false);setProfileMessage('Please sign in again.');return;}const {error}=await supabase.from('profiles').upsert({id:user.id,full_name:profileName.trim(),updated_at:new Date().toISOString()});setProfileBusy(false);if(error){setProfileMessage(error.message);return;}setProfileMessage('Profile saved successfully. Your Rivantoq account is ready.');}} style={{display:'grid',gap:12,textAlign:'left'}}><label style={{fontSize:12}}>Full name<input required maxLength={100} value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Enter your full name" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label><label style={{fontSize:12}}>Email<input disabled value={email} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5,background:'#f5f5f4'}} /></label><button className="btn" disabled={profileBusy||!supabaseConfigured} style={{justifyContent:'center'}}>{profileBusy?'Saving…':'Save profile'} <ArrowRight size={15}/></button></form>{profileMessage&&<p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{profileMessage}</p>}<button type="button" className="outline-btn" style={{width:'100%',marginTop:10}} onClick={()=>setProfileOpen(false)}>Continue</button></div></div>}
    {dashboard&&<div className="modal-backdrop" onClick={()=>setDashboard(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDashboard(false)}><X/></button><span className="modal-icon"><Zap/></span><h2>{authMode==='signin'?'Welcome back':'Create your Rivantoq account'}</h2><p>Use your email to access the café owner workspace.</p><div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:16}}><button className="outline-btn" type="button" onClick={()=>{setAuthMode('signin');setAuthMessage('')}}>Sign in</button><button className="outline-btn" type="button" onClick={()=>{setAuthMode('signup');setAuthMessage('')}}>Create account</button></div><form onSubmit={async (e: FormEvent<HTMLFormElement>)=>{
 e.preventDefault()
 if(!supabase){setAuthMessage('Supabase is not configured. Check the GitHub Pages repository Actions variables and redeploy.');return}
 setAuthBusy(true);setAuthMessage('')
 const result=authMode==='signup'?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}${import.meta.env.BASE_URL}`}}):await supabase.auth.signInWithPassword({email:email.trim(),password})
 setAuthBusy(false)
 if(result.error){setAuthMessage(result.error.message);return}
 const user=result.data.session?.user
 if(!user){setAuthMessage('Account created. Confirm your email, then sign in using the same email and your staff invitation code.');return}
 setAuthUser({id:user.id,email:user.email})
 if(staffInviteToken.trim()){
  const {data:claimData,error:claimError}=await supabase.rpc('claim_staff_invite',{p_token:staffInviteToken.trim()})
  if(claimError){setAuthMessage(claimError.message);return}
  const claimed=Array.isArray(claimData)?claimData[0]:claimData
  if(claimed)setLinkedStaff({id:claimed.staff_id,cafe_id:claimed.cafe_id,branch_id:claimed.branch_id,full_name:claimed.full_name,role:claimed.role,active:true})
  setStaffInviteToken('');setDashboard(false);setAuthMessage('Staff invitation accepted. Your role-based workspace is ready.');return
 }
 const {data:existingStaff}=await supabase.from('staff_members').select('id,cafe_id,branch_id,full_name,role,active').eq('auth_user_id',user.id).eq('active',true).maybeSingle()
 if(existingStaff){setLinkedStaff(existingStaff);setDashboard(false);setAuthMessage('');return}
 setDashboard(false)
 const {data:profile}=await supabase.from('profiles').select('full_name').eq('id',user.id).maybeSingle()
 setProfileName(profile?.full_name||'');setProfileMessage('');setProfileOpen(true);setAuthMessage('')
}} style={{display:'grid',gap:10,textAlign:'left'}}>
 <label style={{fontSize:12}}>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label>
 <label style={{fontSize:12}}>Password<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label>
 <label style={{fontSize:12}}>Staff invitation code (only if your café invited you)<input value={staffInviteToken} onChange={e=>setStaffInviteToken(e.target.value.trim())} maxLength={64} autoComplete="off" placeholder="Paste your 64-character invitation code" style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label>
 <button className="btn" disabled={authBusy||!supabaseConfigured}>{authBusy?'Please wait…':authMode==='signin'?'Sign in':'Create account'} <ArrowRight size={15}/></button>
</form>{!supabaseConfigured&&<p style={{color:'#b45309'}}>Supabase configuration is missing in this deployment. Please redeploy after adding the variables.</p>}{authMessage&&<p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{authMessage}</p>}</div></div>}
  </div>
}

export default App