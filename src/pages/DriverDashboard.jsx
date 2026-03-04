import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

let audioUnlocked = false

function unlockAudio() {
  if (audioUnlocked) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    g.gain.value = 0
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.001)
    audioUnlocked = true
  } catch(e) {}
}

function playSound(freq, vol, repeat) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    for(let i = 0; i < repeat; i++) {
      setTimeout(() => {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.frequency.value = freq
        g.gain.value = vol
        o.type = 'sine'
        o.start(); o.stop(ctx.currentTime + 0.4)
      }, i * 500)
    }
  } catch(e) {}
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
}

export default function DriverDashboard({ profile, setProfile }) {
  const [tab, setTab] = useState('open')
  const [requests, setRequests] = useState([])
  const [myBids, setMyBids] = useState([])
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [bidPrices, setBidPrices] = useState({})
  const [bidNotes, setBidNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [driverLat, setDriverLat] = useState(null)
  const [driverLng, setDriverLng] = useState(null)
  const [locationStatus, setLocationStatus] = useState('Getting your location...')
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    updateLocation()
    const locationInterval = setInterval(updateLocation, 2 * 60 * 1000)

    const channel = supabase.channel('driver-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.new?.tanker_type === profile.tanker_type) {
          playSound(440, 0.4, 4)
          fetchData()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, (payload) => {
        if (payload.new?.driver_id === profile.id && payload.new?.status === 'accepted') {
          playSound(880, 0.4, 3)
          fetchData()
        }
      })
      .subscribe()

    return () => {
      clearInterval(locationInterval)
      supabase.removeChannel(channel)
    }
  }, [])

  async function updateLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setDriverLat(lat)
      setDriverLng(lng)
      setLocationStatus('📍 Location active')
      await supabase.from('profiles').update({
        driver_lat: lat,
        driver_lng: lng,
        last_seen: new Date().toISOString()
      }).eq('id', profile.id)
    }, () => {
      setLocationStatus('⚠️ Location unavailable — please allow location access')
    })
  }

  async function fetchData() {
    const [{ data: reqs }, { data: bids }] = await Promise.all([
      supabase.from('requests').select('*')
        .eq('status', 'pending')
        .eq('tanker_type', profile.tanker_type)
        .order('created_at', { ascending: false }),
      supabase.from('bids').select('*, requests(*)').eq('driver_id', profile.id).order('created_at', { ascending: false })
    ])
    setRequests(reqs || [])
    setMyBids(bids || [])
    setLoading(false)
  }

  async function submitBid(requestId) {
    const price = bidPrices[requestId]
    if (!price) return alert('Please enter your price')
    if (!profile.is_active) return alert('Account inactive. Please recharge ₹100 first.')
    if (profile.wallet_balance < 10) return alert('Insufficient wallet balance. Please recharge.')
    const { error } = await supabase.from('bids').insert({
      request_id: requestId,
      driver_id: profile.id,
      driver_name: profile.name,
      driver_phone: profile.phone,
      price: parseInt(price),
      note: bidNotes[requestId] || ''
    })
    if (error) alert(error.message)
    else { alert('Bid submitted!'); fetchData() }
  }

  async function requestRecharge() {
    const amount = parseInt(rechargeAmount)
    if (!amount || amount < 100) return alert('Minimum recharge is ₹100')
    const { error } = await supabase.from('recharge_requests').insert({
      driver_id: profile.id, amount
    })
    if (error) alert(error.message)
    else { alert('Recharge request sent! Admin will approve shortly.'); setRechargeAmount('') }
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const tankerLabel = profile.tanker_type === 'water' ? '💧 Water' : '🚽 Sewage'
  const tankerColor = profile.tanker_type === 'water' ? '#1565C0' : '#2E7D32'

  return (
    <div className="page" onClick={unlockAudio}>
      <div className="topbar">
        <div>
          <div className="topbar-logo">Tanker<span>Wala</span></div>
          <div style={{fontSize:'12px', color:'#5a6a85'}}>
            Driver — <span style={{color: tankerColor, fontWeight:600}}>{tankerLabel}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      <div style={{background:'#F0F4FF', borderRadius:'8px', padding:'8px 12px', marginBottom:'12px', fontSize:'12px', color:'#5a6a85', display:'flex', justifyContent:'space-between'}}>
        <span>{locationStatus}</span>
        <span>Area: {profile.area || 'Not set'}</span>
      </div>

      <div className="card" style={{background:'linear-gradient(135deg, #1565C0, #1976D2)', color:'white', marginBottom:'20px'}}>
        <div style={{fontSize:'13px', opacity:0.85, marginBottom:'4px'}}>Wallet Balance</div>
        <div style={{fontFamily:"'Baloo 2',cursive", fontSize:'36px', fontWeight:800}}>₹{profile.wallet_balance || 0}</div>
        <div style={{fontSize:'12px', opacity:0.75}}>₹10 deducted per accepted bid</div>
        {!profile.is_active && (
          <div style={{background:'rgba(255,255,255,0.15)', borderRadius:'8px', padding:'10px', marginTop:'12px', fontSize:'13px'}}>
            ⚠️ Account inactive. Recharge ₹100 to start bidding.
          </div>
        )}
        <div style={{display:'flex', gap:'8px', marginTop:'12px'}}>
          <input
            type="number" placeholder="Amount (min ₹100)"
            value={rechargeAmount} onChange={e => setRechargeAmount(e.target.value)}
            style={{flex:1, padding:'10px', borderRadius:'8px', border:'none', fontSize:'14px'}}
          />
          <button onClick={requestRecharge} style={{
            padding:'10px 16px', background:'#FF6F00', color:'white',
            borderRadius:'8px', border:'none', fontWeight:700, fontSize:'14px'
          }}>Recharge</button>
        </div>
      </div>

      <div style={{display:'flex', gap:'8px', marginBottom:'16px'}}>
        <button onClick={() => setTab('open')} style={{
          flex:1, padding:'12px', borderRadius:'10px', fontWeight:700, fontSize:'14px',
          background: tab==='open' ? '#1565C0' : '#F0F4FF',
          color: tab==='open' ? 'white' : '#5a6a85', border:'none'
        }}>🔔 Open Requests ({requests.length})</button>
        <button onClick={() => setTab('mybids')} style={{
          flex:1, padding:'12px', borderRadius:'10px', fontWeight:700, fontSize:'14px',
          background: tab==='mybids' ? '#1565C0' : '#F0F4FF',
          color: tab==='mybids' ? 'white' : '#5a6a85', border:'none'
        }}>📋 My Bids ({myBids.length})</button>
      </div>

      {loading && <div className="spinner"></div>}

      {tab === 'open' && !loading && requests.map(req => {
        const dist = getDistance(driverLat, driverLng, req.location_lat, req.location_lng)
        const mapsUrl = `https://www.google.com/maps?q=${req.location_lat},${req.location_lng}`
        const alreadyBid = myBids.some(b => b.request_id === req.id)
        return (
          <div key={req.id} className="card" style={{marginBottom:'12px', opacity: alreadyBid ? 0.6 : 1}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
              <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                <span style={{background: req.tanker_type==='water' ? '#E3F2FD' : '#E8F5E9', color: req.tanker_type==='water' ? '#1565C0' : '#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  {req.tanker_type === 'water' ? '💧 Water' : '🚽 Sewage'}
                </span>
                <span style={{fontWeight:700, color:'#1565C0'}}>{req.capacity}L</span>
              </div>
              {dist && <span style={{background: parseFloat(dist) <= 5 ? '#E8F5E9' : '#FFF3E0', color: parseFloat(dist) <= 5 ? '#2E7D32' : '#E65100', padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>📏 {dist} km</span>}
            </div>

            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'4px'}}>👤 {req.customer_name || 'Customer'}</div>

            {req.location_text && (
              <div style={{fontSize:'13px', color:'#333', marginBottom:'4px'}}>🏘️ {req.location_text}</div>
            )}

            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
              display:'inline-block', fontSize:'13px', color:'#1565C0', fontWeight:600,
              marginBottom:'8px', textDecoration:'none'
            }}>📍 View on Google Maps →</a>

            <div style={{fontSize:'12px', color:'#5a6a85', marginBottom:'12px'}}>
              🕐 {new Date(req.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>

            {req.notes && (
              <div style={{background:'#F8F9FA', borderRadius:'8px', padding:'8px', fontSize:'13px', marginBottom:'12px'}}>
                📝 {req.notes}
              </div>
