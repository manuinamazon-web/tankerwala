import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playSound(freq, vol, repeat) {
  try {
    const ctx = getAudioContext()
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
  try {
    if (navigator.vibrate) {
      const pattern = Array.from({length: repeat}, () => [300, 200]).flat()
      navigator.vibrate(pattern)
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

const CANCEL_REASONS = [
  '⚡ Power cut / Motor issue',
  '🚛 Vehicle breakdown',
  '🚦 Heavy traffic',
  '🤒 Personal emergency',
  '📍 Cannot reach location',
  '💧 Water not available',
]

export default function DriverDashboard({ profile, setProfile }) {
  const [tab, setTab] = useState('open')
  const [requests, setRequests] = useState([])
  const [myBids, setMyBids] = useState([])
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [bidPrices, setBidPrices] = useState({})
  const [bidNotes, setBidNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [driverLat, setDriverLat] = useState(profile.driver_lat || null)
  const [driverLng, setDriverLng] = useState(profile.driver_lng || null)
  const [locationStatus, setLocationStatus] = useState('Getting your location...')
  const [serviceRadius, setServiceRadius] = useState(profile.service_radius || 10)
  const [savingRadius, setSavingRadius] = useState(false)
  const [cancelModal, setCancelModal] = useState(null)
  const [withdrawModal, setWithdrawModal] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const audioUnlocked = useRef(false)
  const navigate = useNavigate()

  const isWater = profile.tanker_type === 'water'
  const tankerIcon = isWater ? '🚰' : '🚛'
  const tankerLabel = isWater ? 'Water Tanker Driver' : 'Sewage Tanker Driver'
  const tankerColor = isWater ? '#1565C0' : '#2E7D32'

  // Unlock audio on first touch/click/scroll — mandatory
  useEffect(() => {
    function unlock() {
      if (audioUnlocked.current) return
      try {
        const ctx = getAudioContext()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        g.gain.value = 0
        o.connect(g); g.connect(ctx.destination)
        o.start(); o.stop(ctx.currentTime + 0.001)
        if (navigator.vibrate) navigator.vibrate(1)
        audioUnlocked.current = true
      } catch(e) {}
    }
    document.addEventListener('touchstart', unlock, { once: true })
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('scroll', unlock, { once: true })
    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
      document.removeEventListener('scroll', unlock)
    }
  }, [])

  useEffect(() => {
    fetchData()
    updateLocation()
    const locationInterval = setInterval(updateLocation, 2 * 60 * 1000)

    const channel = supabase.channel('driver-live-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.new?.tanker_type === profile.tanker_type) {
          const dist = getDistance(
            profile.driver_lat, profile.driver_lng,
            payload.new?.location_lat, payload.new?.location_lng
          )
          if (!dist || parseFloat(dist) <= (serviceRadius + 0.5)) {
            playSound(440, 0.4, 4)
            showNotification('🔔 New request arrived!')
            fetchData()
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, (payload) => {
        if (payload.new?.driver_id === profile.id) {
          if (payload.new?.status === 'accepted') {
            playSound(880, 0.4, 3)
            showNotification('🎉 Your bid was accepted!')
          }
          if (payload.new?.status === 'rejected') {
            showNotification('😔 Customer chose another driver.')
          }
          fetchData()
        }
      })
      .subscribe()

    return () => {
      clearInterval(locationInterval)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => { fetchData() }, [serviceRadius, driverLat, driverLng])

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 5000)
  }

  async function updateLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setDriverLat(lat)
      setDriverLng(lng)
      setLocationStatus('📍 Location active')
      await supabase.from('profiles').update({
        driver_lat: lat, driver_lng: lng,
        last_seen: new Date().toISOString()
      }).eq('id', profile.id)
    }, () => setLocationStatus('⚠️ Location unavailable — please allow location access'))
  }

  async function fetchData() {
    const [{ data: reqs }, { data: bids }] = await Promise.all([
      supabase.from('requests').select('*')
        .eq('status', 'pending')
        .eq('tanker_type', profile.tanker_type)
        .order('created_at', { ascending: false }),
      supabase.from('bids').select('*, requests(*)')
        .eq('driver_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50)
    ])

    const currentLat = driverLat || profile.driver_lat
    const currentLng = driverLng || profile.driver_lng

    const filteredReqs = (reqs || []).filter(req => {
      if (!req.location_lat || !req.location_lng) return true
      if (!currentLat || !currentLng) return true
      const dist = getDistance(currentLat, currentLng, req.location_lat, req.location_lng)
      return !dist || parseFloat(dist) <= (serviceRadius + 0.5)
    })

    setRequests(filteredReqs)
    setMyBids(bids || [])
    setLoading(false)
  }

  async function updateRadius(radius) {
    setServiceRadius(radius)
    if (setProfile) setProfile(p => ({...p, service_radius: radius}))
    setSavingRadius(true)
    await supabase.from('profiles').update({ service_radius: radius }).eq('id', profile.id)
    setSavingRadius(false)
    fetchData()
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

  async function withdrawBid(bid) {
    setActionLoading(true)
    await supabase.from('bids').update({
      status: 'withdrawn',
      withdraw_reason: 'Driver withdrew bid'
    }).eq('id', bid.id)
    setWithdrawModal(null)
    setActionLoading(false)
    fetchData()
  }

  async function cancelAcceptedBid(bid, reason) {
    setActionLoading(true)
    await supabase.from('bids').update({
      status: 'cancelled',
      withdraw_reason: reason
    }).eq('id', bid.id)
    setCancelModal(null)
    setActionLoading(false)
    alert('✅ Bid cancelled. ₹10 has been refunded to your wallet.')
    fetchData()
  }

  async function requestRecharge() {
    const amount = parseInt(rechargeAmount)
    if (!amount || amount < 100) return alert('Minimum recharge is ₹100')
    const { error } = await supabase.from('recharge_requests').insert({ driver_id: profile.id, amount })
    if (error) alert(error.message)
    else { alert('Recharge request sent! Admin will approve shortly.'); setRechargeAmount('') }
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const pendingBids = myBids.filter(b => b.status === 'pending')
  const acceptedBids = myBids.filter(b => b.status === 'accepted')
  const rejectedBids = myBids.filter(b => b.status === 'rejected' || b.status === 'withdrawn' || b.status === 'cancelled')

  function BidCard({ bid }) {
    return (
      <div className="card" style={{marginBottom:'12px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700}}>
              {bid.requests?.tanker_type === 'water' ? '🚰 Water' : '🚛 Sewage'} — {bid.requests?.capacity}L
            </div>
            {bid.requests?.location_text && (
              <div style={{fontSize:'13px', color:'#5a6a85', marginTop:'2px'}}>🏘️ {bid.requests.location_text}</div>
            )}
            {bid.requests?.location_lat && bid.requests?.location_lng && (
              <a href={`https://www.google.com/maps?q=${bid.requests.location_lat},${bid.requests.location_lng}`}
                target="_blank" rel="noreferrer"
                style={{fontSize:'12px', color:'#1565C0', fontWeight:600, textDecoration:'none'}}>
                📍 View on Google Maps →
              </a>
            )}
            <div style={{fontSize:'16px', fontWeight:800, color:'#1565C0', fontFamily:"'Baloo 2',cursive", marginTop:'4px'}}>₹{bid.price}</div>
            {bid.note && <div style={{fontSize:'12px', color:'#5a6a85'}}>📝 {bid.note}</div>}
            <div style={{fontSize:'12px', color:'#5a6a85', marginTop:'4px'}}>
              🕐 {new Date(bid.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>
          </div>
          <span style={{
            padding:'6px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600, marginLeft:'8px',
            background: bid.status==='accepted' ? '#E8F5E9' : bid.status==='rejected' ? '#FFEBEE' : bid.status==='withdrawn' ? '#F3E5F5' : bid.status==='cancelled' ? '#FFF3E0' : '#FFF3E0',
            color: bid.status==='accepted' ? '#2E7D32' : bid.status==='rejected' ? '#C62828' : bid.status==='withdrawn' ? '#7B1FA2' : bid.status==='cancelled' ? '#E65100' : '#E65100'
          }}>{bid.status?.toUpperCase()}</span>
        </div>

        {bid.status === 'accepted' && (
          <div style={{marginTop:'10px'}}>
            {bid.requests?.customer_phone && (
              <a href={`tel:${bid.requests.customer_phone}`} style={{
                display:'block', background:'#1565C0', color:'white', padding:'10px',
                borderRadius:'8px', textAlign:'center', fontWeight:700, fontSize:'14px',
                textDecoration:'none', marginBottom:'8px'
              }}>
                📞 Call Customer: {bid.requests.customer_phone}
              </a>
            )}
            <button onClick={() => navigate(`/driver/otp/${bid.request_id}`)} style={{
              width:'100%', padding:'12px', background:'#2E7D32', color:'white',
              border:'none', borderRadius:'8px', fontWeight:700,
              fontSize:'14px', cursor:'pointer', marginBottom:'8px'
            }}>
              🔐 Enter OTP to Complete Delivery
            </button>
            <button onClick={() => setCancelModal(bid)} style={{
              width:'100%', padding:'10px', background:'#FFEBEE', color:'#C62828',
              border:'1.5px solid #FFCDD2', borderRadius:'8px', fontWeight:600,
              fontSize:'13px', cursor:'pointer'
            }}>
              ⚠️ Cannot Deliver — Report Issue
            </button>
          </div>
        )}

        {bid.status === 'pending' && (
          <button onClick={() => setWithdrawModal(bid)} style={{
            width:'100%', padding:'8px', background:'#FFF3E0', color:'#E65100',
            border:'1.5px solid #FFE0B2', borderRadius:'8px', fontWeight:600,
            fontSize:'12px', cursor:'pointer', marginTop:'8px'
          }}>
            🔙 Withdraw Bid
          </button>
        )}

        {bid.status === 'rejected' && (
          <div style={{background:'#FFEBEE', borderRadius:'8px', padding:'8px 10px', marginTop:'8px', fontSize:'12px', color:'#C62828'}}>
            😔 Customer chose another driver.
          </div>
        )}
        {bid.status === 'withdrawn' && (
          <div style={{background:'#F3E5F5', borderRadius:'8px', padding:'8px 10px', marginTop:'8px', fontSize:'12px', color:'#7B1FA2'}}>
            🔙 You withdrew this bid.
          </div>
        )}
        {bid.status === 'cancelled' && (
          <div style={{background:'#FFF3E0', borderRadius:'8px', padding:'8px 10px', marginTop:'8px', fontSize:'12px', color:'#E65100'}}>
            ⚠️ You cancelled this delivery. ₹10 refunded.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <span style={{fontSize:'32px'}}>{tankerIcon}</span>
          <div>
            <div className="topbar-logo" style={{fontSize:'18px'}}>Tanker<span>Wala</span></div>
            <div style={{fontSize:'12px', color: tankerColor, fontWeight:600}}>{tankerLabel}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      <div style={{background:'#F0F4FF', borderRadius:'8px', padding:'8px 12px', marginBottom:'12px', fontSize:'12px', color:'#5a6a85', display:'flex', justifyContent:'space-between'}}>
        <span>{locationStatus}</span>
        <span>📍 {profile.area || 'Not set'} • {serviceRadius}km</span>
      </div>

      {notification && (
        <div style={{
          background:'#1565C0', color:'white', padding:'12px 16px', borderRadius:'10px',
          marginBottom:'12px', fontWeight:600, fontSize:'14px', textAlign:'center'
        }}>
          {notification}
        </div>
      )}

      <div className="card" style={{background:'linear-gradient(135deg, #1565C0, #1976D2)', color:'white', marginBottom:'16px'}}>
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

      <div style={{background:'white', borderRadius:'12px', padding:'14px', marginBottom:'16px', border:'1px solid #E8EEF8'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
          <div style={{fontWeight:600, fontSize:'13px', color:'#1a2a4a'}}>📡 My Service Radius</div>
          <div style={{fontWeight:800, fontSize:'18px', color:'#1565C0'}}>{serviceRadius} km {savingRadius ? '⏳' : '✅'}</div>
        </div>
        <input
          type="range" min="1" max="10" step="1"
          value={serviceRadius}
          onChange={e => updateRadius(parseInt(e.target.value))}
          style={{width:'100%', marginBottom:'6px', accentColor:'#1565C0', height:'6px'}}
        />
        <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#5a6a85'}}>
          {[1,2,3,4,5,6,7,8,9,10].map(r => (
            <span key={r} style={{fontWeight: serviceRadius===r ? 700 : 400, color: serviceRadius===r ? '#1565C0' : '#5a6a85'}}>{r}</span>
          ))}
        </div>
        <div style={{fontSize:'11px', color:'#5a6a85', marginTop:'6px', textAlign:'center'}}>
          Showing requests within {serviceRadius}km of your location
        </div>
      </div>

      <div style={{display:'flex', gap:'6px', marginBottom:'16px'}}>
        <button onClick={() => setTab('open')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'12px',
          background: tab==='open' ? '#1565C0' : '#F0F4FF',
          color: tab==='open' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>🔔 New ({requests.length})</button>
        <button onClick={() => setTab('pending')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'12px',
          background: tab==='pending' ? '#FF6F00' : '#F0F4FF',
          color: tab==='pending' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>⏳ Pending ({pendingBids.length})</button>
        <button onClick={() => setTab('accepted')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'12px',
          background: tab==='accepted' ? '#2E7D32' : '#F0F4FF',
          color: tab==='accepted' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>✅ Won ({acceptedBids.length})</button>
        <button onClick={() => setTab('rejected')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'12px',
          background: tab==='rejected' ? '#C62828' : '#F0F4FF',
          color: tab==='rejected' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>❌ Lost ({rejectedBids.length})</button>
      </div>

      {loading && <div className="spinner"></div>}

      {tab === 'open' && !loading && requests.map(req => {
        const dist = getDistance(driverLat, driverLng, req.location_lat, req.location_lng)
        const mapsUrl = req.location_lat && req.location_lng
          ? `https://www.google.com/maps?q=${req.location_lat},${req.location_lng}`
          : `https://www.google.com/maps/search/${encodeURIComponent(req.location_text)}`
        const alreadyBid = myBids.some(b => b.request_id === req.id && b.status !== 'withdrawn')
        return (
          <div key={req.id} className="card" style={{marginBottom:'12px', opacity: alreadyBid ? 0.7 : 1}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
              <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                <span style={{background: req.tanker_type==='water' ? '#E3F2FD' : '#E8F5E9', color: req.tanker_type==='water' ? '#1565C0' : '#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  {req.tanker_type === 'water' ? '🚰 Water' : '🚛 Sewage'}
                </span>
                <span style={{fontWeight:700, color:'#1565C0'}}>{req.capacity}L</span>
              </div>
              {dist && (
                <span style={{
                  background: parseFloat(dist) <= 5 ? '#E8F5E9' : '#FFF3E0',
                  color: parseFloat(dist) <= 5 ? '#2E7D32' : '#E65100',
                  padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600
                }}>📏 {dist} km</span>
              )}
            </div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'4px'}}>👤 {req.customer_name || 'Customer'}</div>
            {req.location_text && (
              <div style={{fontSize:'13px', color:'#333', marginBottom:'4px', fontWeight:600}}>🏘️ {req.location_text}</div>
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
            )}
            {alreadyBid ? (
              <div style={{textAlign:'center', color:'#2E7D32', fontWeight:600, fontSize:'14px'}}>✅ Bid submitted — waiting for customer</div>
            ) : (
              <>
                <input
                  type="number" placeholder="Your price (₹)"
                  value={bidPrices[req.id] || ''}
                  onChange={e => setBidPrices(p => ({...p, [req.id]: e.target.value}))}
                  style={{width:'100%', padding:'10px', borderRadius:'8px', border:'1.5px solid #C5D5F0', fontSize:'14px', marginBottom:'8px', boxSizing:'border-box'}}
                />
                <input
                  type="text" placeholder="Optional note (e.g. can deliver in 1 hour)"
                  value={bidNotes[req.id] || ''}
                  onChange={e => setBidNotes(p => ({...p, [req.id]: e.target.value}))}
                  style={{width:'100%', padding:'10px', borderRadius:'8px', border:'1.5px solid #C5D5F0', fontSize:'14px', marginBottom:'8px', boxSizing:'border-box'}}
                />
                <button className="btn-primary" onClick={() => submitBid(req.id)}>
                  🏷️ Submit Bid (₹10 on acceptance)
                </button>
              </>
            )}
          </div>
        )
      })}

      {tab === 'open' && !loading && requests.length === 0 && (
        <div className="empty-state">
          <div className="icon">{tankerIcon}</div>
          <p>No new requests within {serviceRadius}km.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Increase your radius or wait for new requests!</p>
        </div>
      )}

      {tab === 'pending' && !loading && pendingBids.length === 0 && (
        <div className="empty-state">
          <div className="icon">⏳</div>
          <p>No pending bids.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Submit bids on new requests!</p>
        </div>
      )}
      {tab === 'pending' && !loading && pendingBids.map(bid => <BidCard key={bid.id} bid={bid} />)}

      {tab === 'accepted' && !loading && acceptedBids.length === 0 && (
        <div className="empty-state">
          <div className="icon">✅</div>
          <p>No accepted bids yet.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Keep bidding — your first win is coming!</p>
        </div>
      )}
      {tab === 'accepted' && !loading && acceptedBids.map(bid => <BidCard key={bid.id} bid={bid} />)}

      {tab === 'rejected' && !loading && rejectedBids.length === 0 && (
        <div className="empty-state"><div className="icon">👍</div><p>No lost bids!</p></div>
      )}
      {tab === 'rejected' && !loading && rejectedBids.map(bid => <BidCard key={bid.id} bid={bid} />)}

      {cancelModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end'}}>
          <div style={{background:'white', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%'}}>
            <div style={{fontWeight:700, fontSize:'16px', marginBottom:'6px', color:'#C62828'}}>⚠️ Cannot Deliver</div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'16px'}}>Select reason — ₹10 will be refunded to your wallet</div>
            {CANCEL_REASONS.map(reason => (
              <button key={reason} onClick={() => cancelAcceptedBid(cancelModal, reason)} disabled={actionLoading} style={{
                width:'100%', padding:'12px', marginBottom:'8px', borderRadius:'10px',
                background:'#FFF3E0', color:'#E65100', border:'1.5px solid #FFE0B2',
                fontWeight:600, fontSize:'14px', cursor:'pointer', textAlign:'left'
              }}>{reason}</button>
            ))}
            <button onClick={() => setCancelModal(null)} style={{
              width:'100%', padding:'12px', borderRadius:'10px', background:'#F0F4FF',
              color:'#5a6a85', border:'none', fontWeight:600, fontSize:'14px', cursor:'pointer'
            }}>Go Back</button>
          </div>
        </div>
      )}

      {withdrawModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}>
          <div style={{background:'white', borderRadius:'16px', padding:'24px', width:'100%'}}>
            <div style={{fontWeight:700, fontSize:'16px', marginBottom:'8px'}}>🔙 Withdraw Bid</div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'20px'}}>
              Are you sure you want to withdraw your bid of ₹{withdrawModal.price}?
            </div>
            <div style={{display:'flex', gap:'8px'}}>
              <button onClick={() => withdrawBid(withdrawModal)} disabled={actionLoading} style={{
                flex:1, padding:'12px', borderRadius:'10px', background:'#C62828',
                color:'white', border:'none', fontWeight:700, fontSize:'14px', cursor:'pointer'
              }}>{actionLoading ? 'Withdrawing...' : 'Yes, Withdraw'}</button>
              <button onClick={() => setWithdrawModal(null)} style={{
                flex:1, padding:'12px', borderRadius:'10px', background:'#F0F4FF',
                color:'#5a6a85', border:'none', fontWeight:600, fontSize:'14px', cursor:'pointer'
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
