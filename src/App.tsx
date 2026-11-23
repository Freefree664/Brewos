import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'
import { ArrowRight, BarChart3, Check, ChevronDown, Coffee, Globe2, LayoutDashboard, Menu, Package, QrCode, ShieldCheck, ShoppingBag, Users, X, Zap } from 'lucide-react'

const copy = {
  en: {
    nav: ['Platform', 'Features', 'Pricing'],
    sign: 'Sign in', start: 'Get started', pill: 'THE OPERATING SYSTEM FOR MODERN CAFÉS',
    heroA: 'Your café,', heroB: 'running beautifully.', sub: 'One calm, powerful workspace for orders, menus, your team and every little detail that makes a great café.',
    cta: 'Explore the platform', secondary: 'See how it works', trusted: 'MADE FOR THE PEOPLE BEHIND THE COUNTER',
    platform: 'Everything in sync.', platformSub: 'From the first QR scan to the final bill, keep your whole café moving together.',
    featureTitle: 'The tools to make every day smoother', featureSub: 'Less juggling. More hospitality.',
    pricing: 'Simple, transparent plans', pricingSub: 'Every plan includes the full BrewOS experience. Choose the duration that works for your café.',
    choose: 'Choose plan', footer: 'A better day starts here.'
  },
  hi: {
    nav: ['प्लेटफ़ॉर्म', 'फ़ीचर्स', 'कीमत'],
    sign: 'साइन इन', start: 'शुरू करें', pill: 'आधुनिक कैफ़े के लिए ऑपरेटिंग सिस्टम',
    heroA: 'आपका कैफ़े,', heroB: 'अब और बेहतर।', sub: 'ऑर्डर, मेन्यू, टीम और कैफ़े के हर काम को एक ही आसान और शक्तिशाली जगह से संभालें।',
    cta: 'प्लेटफ़ॉर्म देखें', secondary: 'कैसे काम करता है', trusted: 'कैफ़े चलाने वालों के लिए बनाया गया',
    platform: 'सब कुछ एक साथ।', platformSub: 'पहले QR स्कैन से लेकर आख़िरी बिल तक, आपका पूरा कैफ़े एक साथ काम करे।',
    featureTitle: 'हर दिन को आसान बनाने वाले टूल', featureSub: 'कम भागदौड़। बेहतर मेहमाननवाज़ी।',
    pricing: 'आसान और स्पष्ट प्लान', pricingSub: 'हर प्लान में BrewOS के सभी फ़ीचर शामिल हैं। अपनी सुविधा के अनुसार अवधि चुनें।',
    choose: 'प्लान चुनें', footer: 'बेहतर दिन की शुरुआत यहीं से।'
  }
}

const plans = [{name:'3 Months',price:'₹699',term:'3 महीने'}, {name:'6 Months',price:'₹999',term:'6 महीने',popular:true}, {name:'9 Months',price:'₹1,499',term:'9 महीने'}, {name:'1 Year',price:'₹1,999',term:'1 साल'}, {name:'Lifetime',price:'₹4,999',term:'एक बार भुगतान'}]
const features = [
  {icon:QrCode,title:'QR & online ordering',desc:'Let guests browse your menu and order from their table or your café link.'},
  {icon:ShoppingBag,title:'Smart POS & billing',desc:'Handle dine-in, takeaway, delivery, split bills and multiple payment types.'},
  {icon:Coffee,title:'Kitchen display',desc:'Send orders straight to the kitchen with clear statuses and prep timers.'},
  {icon:Users,title:'Your team, together',desc:'Manage roles, shifts, attendance and waiter assignments in one place.'},
  {icon:Package,title:'Inventory control',desc:'Track ingredients, recipes, low stock, suppliers and wastage.'},
  {icon:BarChart3,title:'Insights that help',desc:'Understand sales, popular items, busy hours and branch performance.'}
]

function App() {
  const [lang,setLang] = useState<'en'|'hi'>('en')
  const [menu,setMenu] = useState(false)
  const [dashboard,setDashboard] = useState(false)
  const [selectedPlan,setSelectedPlan] = useState<(typeof plans)[number] | null>(null)
  const [authMode,setAuthMode] = useState<'signin'|'signup'>('signin')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [authBusy,setAuthBusy] = useState(false)
  const [authMessage,setAuthMessage] = useState('')
  const t = copy[lang]
  return <div className="app-shell">
    <header className="nav wrap">
      <a className="brand" href="#"><span className="brand-mark"><Coffee size={21}/></span><span>Brew<span>OS</span></span></a>
      <nav className={menu?'nav-links open':'nav-links'}>{t.nav.map((n,i)=><a key={n} href={['#platform','#features','#pricing'][i]} onClick={()=>setMenu(false)}>{n}</a>)}</nav>
      <div className="nav-actions"><button className="lang" onClick={()=>setLang(lang==='en'?'hi':'en')}><Globe2 size={16}/>{lang==='en'?'हिन्दी':'English'}<ChevronDown size={14}/></button><button className="text-btn" onClick={()=>setDashboard(true)}>{t.sign}</button><a className="btn btn-small" href="#pricing">{t.start}<ArrowRight size={15}/></a></div>
      <button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label="Toggle menu">{menu?<X/>:<Menu/>}</button>
    </header>
    <main>
      <section className="hero wrap">
        <div className="hero-copy"><div className="eyebrow"><span className="pulse"></span>{t.pill}</div><h1>{t.heroA}<br/><em>{t.heroB}</em></h1><p className="hero-sub">{t.sub}</p><div className="hero-actions"><a className="btn" href="#platform">{t.cta}<ArrowRight size={17}/></a><a className="link-btn" href="#features">{t.secondary}<span>↗</span></a></div><div className="hero-note"><ShieldCheck size={16}/> Built for independent cafés and growing teams</div></div>
        <div className="hero-art"><div className="float-chip chip-one"><span className="chip-icon green"><Check size={15}/></span><span><b>Order received</b><small>Table 08 · Just now</small></span></div><div className="dashboard-card"><div className="dash-top"><div><small>MONDAY, 23 NOVEMBER</small><h3>Good morning ☀️</h3></div><div className="avatar">B</div></div><div className="dash-stats"><div><small>Today's sales</small><b>₹24,580</b><span className="up">↗ 12.8%</span></div><div><small>Orders today</small><b>128</b><span className="muted">Across all tables</span></div></div><div className="chart-head"><b>Sales overview</b><small>This week⌄</small></div><div className="bars">{[35,52,43,72,57,88,66,100,76,91,68,84].map((v,i)=><i key={i} style={{height:v+'%'}}/>)}</div><div className="chart-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div><div className="dash-bottom"><span><i className="dot dot-green"/> Dine-in <b>68%</b></span><span><i className="dot dot-orange"/> Takeaway <b>32%</b></span></div></div><div className="float-chip chip-two"><span className="chip-icon orange"><Coffee size={15}/></span><span><b>Kitchen is on track</b><small>6 orders in preparation</small></span></div><div className="orb orb-a"></div><div className="orb orb-b"></div></div>
      </section>
      <section className="trust wrap"><span>{t.trusted}</span><div><b>ORDERS</b><b>PEOPLE</b><b>INVENTORY</b><b>INSIGHTS</b></div></section>
      <section className="platform-section" id="platform"><div className="wrap section-center"><div className="eyebrow centered">ONE WORKSPACE. EVERY WORKFLOW.</div><h2>{t.platform}</h2><p>{t.platformSub}</p><div className="workflow"><div className="workflow-item"><span className="wf-icon"><QrCode/></span><b>Guest orders</b><small>Scan · Browse · Order</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><LayoutDashboard/></span><b>Front of house</b><small>Tables · POS · Team</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><Coffee/></span><b>Kitchen</b><small>Prepare · Serve</small></div><ArrowRight className="wf-arrow"/><div className="workflow-item"><span className="wf-icon"><BarChart3/></span><b>Owner insights</b><small>Track · Improve · Grow</small></div></div></div></section>
      <section className="features wrap" id="features"><div className="section-heading"><div><div className="eyebrow">MADE FOR THE DAILY RUSH</div><h2>{t.featureTitle}</h2></div><p>{t.featureSub}</p></div><div className="feature-grid">{features.map((f,i)=><article className="feature-card" key={f.title}><span className={'feature-icon tone-'+i}><f.icon size={21}/></span><h3>{f.title}</h3><p>{f.desc}</p><a href="#pricing">Explore feature <ArrowRight size={14}/></a></article>)}</div></section>
      <section className="pricing-section" id="pricing"><div className="wrap"><div className="section-center"><div className="eyebrow centered">STRAIGHTFORWARD SUBSCRIPTIONS</div><h2>{t.pricing}</h2><p>{t.pricingSub}</p></div><div className="pricing-grid">{plans.map(p=><article className={p.popular?'price-card popular':'price-card'} key={p.name}>{p.popular&&<span className="popular-label">MOST POPULAR</span>}<h3>{p.name}</h3><div className="price">{p.price}</div><p className="price-term">{p.term} · All features included</p><ul><li><Check/> Full café management suite</li><li><Check/> Single & multiple branches</li><li><Check/> English & Hindi interface</li><li><Check/> Updates during validity</li></ul><button className={p.popular?'btn':'outline-btn'} onClick={()=>setSelectedPlan(p)}>{t.choose}<ArrowRight size={15}/></button></article>)}</div><p className="pricing-footnote">Prices shown are the selected BrewOS plan prices. Payment and subscription activation will be connected in a later milestone.</p></div></section>
      <section className="closing wrap"><div><div className="eyebrow">YOUR CAFÉ. YOUR CRAFT.</div><h2>Make room for<br/><em>what matters.</em></h2></div><a className="btn" href="#pricing">Find your BrewOS plan <ArrowRight size={17}/></a></section>
    </main>
    <footer className="footer"><div className="wrap footer-inner"><a className="brand" href="#"><span className="brand-mark"><Coffee size={20}/></span><span>Brew<span>OS</span></span></a><p>{t.footer} © 2026 BrewOS.</p><span>Built for better café days.</span></div></footer>
    {selectedPlan&&<div className="modal-backdrop" onClick={()=>setSelectedPlan(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedPlan(null)}><X/></button><span className="modal-icon"><QrCode/></span><h2>Complete your plan purchase</h2><p>Selected plan: <b>{selectedPlan.name}</b></p><div style={{fontSize:30,fontWeight:800,color:'#059669',margin:'8px 0 18px'}}>{selectedPlan.price}</div><div style={{background:'#f5f5f4',borderRadius:14,padding:18,marginBottom:14}}><div style={{width:170,height:170,margin:'0 auto 12px',border:'2px dashed #a8a29e',borderRadius:12,display:'grid',placeItems:'center',background:'#fff',color:'#78716c'}}><div style={{textAlign:'center'}}><QrCode size={52}/><div style={{fontSize:11,marginTop:8}}>Your payment QR<br/>will appear here</div></div></div><p style={{fontSize:12,margin:'0 0 8px'}}>Pay using any supported UPI app</p><div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}><b style={{fontSize:15}}>misbahkhan19@fam</b><button type="button" className="outline-btn" onClick={()=>navigator.clipboard?.writeText('misbahkhan19@fam')}>Copy UPI ID</button></div></div><p style={{fontSize:12,lineHeight:1.6}}>The QR image will be added when you share it. After payment, BrewOS will need a secure payment record and manual verification before activating your plan. This screen does not collect or confirm payments yet.</p><button className="btn" style={{width:'100%',justifyContent:'center'}} onClick={()=>setSelectedPlan(null)}>Close <X size={15}/></button></div></div>}
    {dashboard&&<div className="modal-backdrop" onClick={()=>setDashboard(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDashboard(false)}><X/></button><span className="modal-icon"><Zap/></span><h2>{authMode==='signin'?'Welcome back':'Create your BrewOS account'}</h2><p>Use your email to access the café owner workspace.</p><div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:16}}><button className="outline-btn" type="button" onClick={()=>{setAuthMode('signin');setAuthMessage('')}}>Sign in</button><button className="outline-btn" type="button" onClick={()=>{setAuthMode('signup');setAuthMessage('')}}>Create account</button></div><form onSubmit={async (e: FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!supabase){setAuthMessage('Supabase is not configured. Check Netlify environment variables and redeploy.');return;}setAuthBusy(true);setAuthMessage('');const result=authMode==='signup'?await supabase.auth.signUp({email:email.trim(),password}):await supabase.auth.signInWithPassword({email:email.trim(),password});setAuthBusy(false);setAuthMessage(result.error?result.error.message:(authMode==='signup'?'Account created. Check your email if confirmation is enabled.':'Signed in successfully. Café onboarding is the next step.'));}} style={{display:'grid',gap:10,textAlign:'left'}}><label style={{fontSize:12}}>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label><label style={{fontSize:12}}>Password<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,border:'1px solid #d6d3d1',borderRadius:9,marginTop:5}} /></label><button className="btn" disabled={authBusy||!supabaseConfigured}>{authBusy?'Please wait…':authMode==='signin'?'Sign in':'Create account'} <ArrowRight size={15}/></button></form>{!supabaseConfigured&&<p style={{color:'#b45309'}}>Supabase configuration is missing in this deployment. Please redeploy after adding the variables.</p>}{authMessage&&<p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{authMessage}</p>}</div></div>}
  </div>
}

export default App