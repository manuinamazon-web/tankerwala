import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { registerPushNotifications, setDriverOnline } from '../lib/pushNotifications'
import { TankerIcon } from '../components/TankerIcon'

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

function playRinging() {
  try {
    const ctx = getAudioContext()
    const ringPattern = [
      { start: 0.0, duration: 0.15, freq: 1000 },
      { start: 0.2, duration: 0.15, freq: 1000 },
      { start: 0.4, duration: 0.15, freq: 1000 },
      { start: 1.2, duration: 0.15, freq: 1000 },
      { start: 1.4, duration: 0.15, freq: 1000 },
      { start: 1.6, duration: 0.15, freq: 1000 },
      { start: 2.4, duration: 0.15, freq: 1000 },
      { start: 2.6, duration: 0.15, freq: 1000 },
      { start: 2.8, duration: 0.15, freq: 1000 },
    ]
    ringPattern.forEach(({ start, duration, freq }) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = freq
      o.type = 'sine'
      g.gain.setValueAtTime(0, ctx.currentTime + start)
      g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + start + 0.02)
      g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + start + duration - 0.02)
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
      o.start(ctx.currentTime + start)
      o.stop(ctx.currentTime + start + duration + 0.1)
    })
  } catch(e) {}
  try {
    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500, 800, 500, 200, 500, 200, 500, 800, 500, 200, 500, 200, 500])
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

const DELIVERY_TIMES = ['Now (30 min)', '1 Hour', '2 Hours', '3 Hours']
const TANK_CAPACITIES = [3000, 5000, 10000, 12000]

function isToday(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
}

// ✅ WhatsApp location sharing function
function shareLocationOnWhatsApp(customerPhone, customerName, driverLat, driverLng, driverName, status) {
  if (!driverLat || !driverLng) {
    alert('Your GPS location is not available. Please wait for location to be captured.')
    return
  }

  const mapsLink = `https://maps.google.com/?q=${driverLat},${driverLng}`
  const statusText = status === 'on_the_way' ? 'I am on my way' : 'I have arrived at your location'

  const message =
    `Hello! I am your TankerWala driver 🚛\n` +
    `*${statusText}* to deliver your water tanker.\n\n` +
    `📍 *My current location:*\n${mapsLink}\n\n` +
    `Driver: ${driverName}\n` +
    `_Powered by TankerWala_`

  // Format phone number — remove 0 or +91 prefix, keep 10 digits
  const cleanPhone = customerPhone.replace(/\D/g, '').replace(/^(0|91)/, '')
  const whatsappUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`
  window.open(whatsappUrl, '_blank')
}

export default function DriverDashboard({ profile, setProfile }) {
  const [tab, setTab] = useState('open')
  const [requests, setRequests] = useState([])
  const [myBids, setMyBids] = useState([])
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [bidPrices, setBidPrices] = useState({})
  const [bidTimes, setBidTimes] = useState({})
  const [bidCapacities, setBidCapacities] = useState({})
  const [loading, setLoading] = useState(true)
  const [driverLat, setDriverLat] = useState(profile.driver_lat || null)
  const [driverLng, setDriverLng] = useState(profile.driver_lng || null)
  const [locationStatus, setLocationStatus] = useState('Getting your location...')
  const [locationBlocked, setLocationBlocked] = useState(false)
  const [serviceRadius, setServiceRadius] = useState(profile.service_radius || 10)
  const [savingRadius, setSavingRadius] = useState(false)
  const [cancelModal, setCancelModal] = useState(null)
  const [withdrawModal, setWithdrawModal] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [walletBalance, setWalletBalance] = useState(profile.wallet_balance || 0)
  const [isOnline, setIsOnline] = useState(profile.is_online || false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const audioUnlocked = useRef(false)
  const inactivityTimer = useRef(null)
  const locationInterval = useRef(null)
  const navigate = useNavigate()

  const isWater = profile.tanker_type === 'water'
  const tankerLabel = isWater ? 'Water Tanker Driver' : 'Sewage Tanker Driver'
  const tankerColor = isWater ? '#1565C0' : '#2E7D32'

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
    locationInterval.current = setInterval(updateLocation, 2 * 60 * 1000)

    // ✅ Single reliable channel for driver
    const channel = supabase.channel('driver-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests',  }, (payload) => {
        if (payload.new?.tanker_type === profile.tanker_type) {
          playRinging()
          showNotification('🔔 New request arrived!')
          fetchData()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, (payload) => {
        if (payload.new?.driver_id === profile.id) {
          if (payload.new?.status === 'accepted' && payload.old?.status !== 'accepted') {
            playSound(880, 0.4, 4)
            playRinging()
            showNotification('🎉 Your bid was accepted! Go deliver!')
            setTab('delivery')
          }
          fetchData()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        if (payload.new?.id === profile.id) {
          if (payload.new?.wallet_balance !== undefined) {
            setWalletBalance(payload.new.wallet_balance)
          }
          if (payload.new?.is_active === true) {
            showNotification('✅ Wallet recharged! You can now bid.')
            playSound(880, 0.3, 3)
          }
        }
      })
      .subscribe()

    resetInactivityTimer()
    document.addEventListener('touchstart', resetInactivityTimer)
    document.addEventListener('click', resetInactivityTimer)

    // ✅ Backup polling every 8 seconds for new requests + bid acceptance
    let lastAcceptedBid = null

    const pollInterval = setInterval(async () => {
      // Check if any of driver's bids got accepted
      const { data: acceptedBids } = await supabase
        .from('bids')
        .select('id, request_id, status')
        .eq('driver_id', profile.id)
        .eq('status', 'accepted')

      if (acceptedBids && acceptedBids.length > 0) {
        const latestAccepted = acceptedBids[0].id
        if (lastAcceptedBid !== latestAccepted) {
          if (lastAcceptedBid !== null) {
            // New acceptance detected!
            playSound(880, 0.4, 4)
            playRinging()
            showNotification('🎉 Your bid was accepted! Go deliver!')
            setTab('delivery')
          }
          lastAcceptedBid = latestAccepted
        }
      }

      fetchData()
    }, 8000)

    return () => {
      clearInterval(locationInterval.current)
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
      document.removeEventListener('touchstart', resetInactivityTimer)
      document.removeEventListener('click', resetInactivityTimer)
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [])

  useEffect(() => { fetchData() }, [serviceRadius, driverLat, driverLng])

  function resetInactivityTimer() {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(async () => {
      await goOffline()
    }, 30 * 60 * 1000)
  }

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 5000)
  }

  function updateLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocationStatus('⚠️ GPS not supported on this device')
        setLocationBlocked(true)
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setDriverLat(lat)
          setDriverLng(lng)
          setLocationStatus('📍 Location active')
          setLocationBlocked(false)
          await supabase.from('profiles').update({
            driver_lat: lat, driver_lng: lng,
            last_seen: new Date().toISOString()
          }).eq('id', profile.id)

          // ✅ Sync driver GPS to active request so customer sees live location
          await supabase.from('requests').update({
            driver_lat: lat, driver_lng: lng
          }).eq('driver_id', profile.id).eq('status', 'accepted')
          resolve({ lat, lng })
        },
        (err) => {
          console.error('Location error:', err.code, err.message)
          if (err.code === 1) {
            setLocationStatus('🚫 Location blocked! Please allow location in browser settings.')
            setLocationBlocked(true)
          } else {
            setLocationStatus('⚠️ Location unavailable. Please check GPS.')
            setLocationBlocked(false)
          }
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  async function goOnline() {
    setLocationStatus('📡 Getting your GPS location...')
    showNotification('📡 Getting your GPS location...')
    const loc = await updateLocation()
    if (!loc) {
      if (locationBlocked) {
        showNotification('🚫 Location blocked! Open browser Settings → Allow Location for this site.')
      } else {
        showNotification('⚠️ Could not get GPS. Check if GPS is ON in your phone settings.')
      }
    }
    const success = await registerPushNotifications(profile.id, supabase)
    setPushEnabled(success)
    await setDriverOnline(profile.id, true, supabase)
    setIsOnline(true)
    if (loc) {
      showNotification('✅ You are now online! GPS location captured.')
    } else {
      showNotification('🟡 You are online but GPS is not active.')
    }
    playSound(880, 0.3, 2)
  }

  async function goOffline() {
    await setDriverOnline(profile.id, false, supabase)
    setIsOnline(false)
    showNotification('🔴 You are now offline.')
  }

  async function fetchData() {
    const [{ data: reqs }, { data: bids }, { data: profileData }] = await Promise.all([
      supabase.from('requests').select('*')
        .eq('status', 'pending')
        .eq('tanker_type', profile.tanker_type)
        .order('created_at', { ascending: false }),
      supabase.from('bids').select('*, requests(*)')
        .eq('driver_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('profiles').select('wallet_balance, is_online').eq('id', profile.id).single()
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
    if (profileData) {
      setWalletBalance(profileData.wallet_balance || 0)
      setIsOnline(profileData.is_online || false)
    }
    setLoading(false)
  }

  async function updateDeliveryStatus(requestId, newStatus) {
    await supabase.from('requests').update({ delivery_status: newStatus }).eq('id', requestId)
    fetchData()
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
    const deliveryTime = bidTimes[requestId]
    const tankCapacity = bidCapacities[requestId]
    if (!price) return alert('Please enter your price')
    if (!deliveryTime) return alert('Please select delivery time')
    if (!tankCapacity) return alert('Please select tank capacity')
    if (!profile.is_active) return alert('Account inactive. Please recharge ₹100 first.')
    if (walletBalance < 10) return alert('Insufficient wallet balance. Please recharge.')
    const { error } = await supabase.from('bids').insert({
      request_id: requestId,
      driver_id: profile.id,
      driver_name: profile.name,
      driver_phone: profile.phone,
      price: parseInt(price),
      delivery_time: deliveryTime,
      tank_capacity: parseInt(tankCapacity)
    })
    if (error) alert(error.message)
    else {
      setBidPrices(p => { const n = {...p}; delete n[requestId]; return n })
      setBidTimes(p => { const n = {...p}; delete n[requestId]; return n })
      setBidCapacities(p => { const n = {...p}; delete n[requestId]; return n })
      fetchData()
    }
  }

  async function withdrawBid(bid) {
    setActionLoading(true)
    await supabase.from('bids').update({ status: 'withdrawn', withdraw_reason: 'Driver withdrew bid' }).eq('id', bid.id)
    setWithdrawModal(null)
    setActionLoading(false)
    fetchData()
  }

  async function cancelAcceptedBid(bid, reason) {
    setActionLoading(true)
    const { data: freshBid } = await supabase
      .from('bids').select('*')
      .eq('request_id', bid.request_id)
      .eq('driver_id', profile.id)
      .eq('status', 'accepted')
      .single()

    if (!freshBid) {
      alert('Bid not found or already cancelled.')
      setActionLoading(false)
      setCancelModal(null)
      return
    }

    await supabase.from('bids').update({ status: 'cancelled', withdraw_reason: reason }).eq('id', freshBid.id)
    await supabase.from('requests').update({
      status: 'pending', driver_id: null, driver_phone: null,
      accepted_price: null, otp: null, otp_verified: false, delivery_status: 'pending'
    }).eq('id', freshBid.request_id)
    await supabase.from('profiles').update({ wallet_balance: walletBalance + 10 }).eq('id', profile.id)

    setCancelModal(null)
    setActionLoading(false)
    alert('✅ Delivery cancelled. ₹10 refunded to your wallet.')
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
    await goOffline()
    await supabase.auth.signOut()
    navigate('/')
  }

  const pendingBids = myBids.filter(b => b.status === 'pending')
  const activeBids = myBids.filter(b => b.status === 'accepted')
  const historyBids = myBids.filter(b => b.status === 'completed')
  const thisWeekDeliveries = historyBids.filter(b => {
    const d = new Date(b.created_at)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return d >= weekAgo
  }).length

  function DeliveryStatusButtons({ bid }) {
    const req = bid.requests
    if (!req) return null
    const currentStatus = req.delivery_status || 'pending'

    return (
      <div style={{marginTop:'10px'}}>
        {/* Progress bar */}
        <div style={{display:'flex', gap:'4px', marginBottom:'10px'}}>
          {['loading','on_the_way','arrived'].map((stage, idx) => {
            const order = ['pending','loading','on_the_way','arrived']
            const filled = order.indexOf(currentStatus) > idx
            return <div key={stage} style={{flex:1, height:'6px', borderRadius:'4px', background: filled ? '#2E7D32' : '#E0E0E0'}} />
          })}
        </div>

        {currentStatus === 'pending' && (
          <button onClick={() => updateDeliveryStatus(bid.request_id, 'loading')} style={{
            width:'100%', padding:'12px', background:'#FF6F00', color:'white',
            border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px', cursor:'pointer', marginBottom:'8px'
          }}>🔄 Start Loading Water</button>
        )}

        {currentStatus === 'loading' && (
          <>
            <button onClick={() => updateDeliveryStatus(bid.request_id, 'on_the_way')} style={{
              width:'100%', padding:'12px', background:'#1565C0', color:'white',
              border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px', cursor:'pointer', marginBottom:'8px'
            }}>🚛 I am On the Way</button>

            {/* ✅ WhatsApp location share when loading */}
            {req.customer_phone && (
              <button onClick={() => shareLocationOnWhatsApp(
                req.customer_phone, req.customer_name,
                driverLat, driverLng, profile.name, 'on_the_way'
              )} style={{
                width:'100%', padding:'12px', background:'#25D366', color:'white',
                border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px',
                cursor:'pointer', marginBottom:'8px', display:'flex',
                alignItems:'center', justifyContent:'center', gap:'8px'
              }}>
                <span style={{fontSize:'18px'}}>💬</span> Share My Location on WhatsApp
              </button>
            )}
          </>
        )}

        {currentStatus === 'on_the_way' && (
          <>
            <button onClick={() => updateDeliveryStatus(bid.request_id, 'arrived')} style={{
              width:'100%', padding:'12px', background:'#2E7D32', color:'white',
              border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px', cursor:'pointer', marginBottom:'8px'
            }}>📍 I Have Arrived</button>

            {/* ✅ WhatsApp location share when on the way */}
            {req.customer_phone && (
              <button onClick={() => shareLocationOnWhatsApp(
                req.customer_phone, req.customer_name,
                driverLat, driverLng, profile.name, 'on_the_way'
              )} style={{
                width:'100%', padding:'12px', background:'#25D366', color:'white',
                border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px',
                cursor:'pointer', marginBottom:'8px', display:'flex',
                alignItems:'center', justifyContent:'center', gap:'8px'
              }}>
                <span style={{fontSize:'18px'}}>💬</span> Share My Location on WhatsApp
              </button>
            )}
          </>
        )}

        {currentStatus === 'arrived' && (
          <>
            <div style={{background:'#E8F5E9', borderRadius:'8px', padding:'10px', marginBottom:'8px', textAlign:'center', fontSize:'13px', color:'#2E7D32', fontWeight:700}}>
              ✅ Waiting for customer OTP
            </div>

            {/* ✅ WhatsApp message when arrived */}
            {req.customer_phone && (
              <button onClick={() => shareLocationOnWhatsApp(
                req.customer_phone, req.customer_name,
                driverLat, driverLng, profile.name, 'arrived'
              )} style={{
                width:'100%', padding:'12px', background:'#25D366', color:'white',
                border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px',
                cursor:'pointer', marginBottom:'8px', display:'flex',
                alignItems:'center', justifyContent:'center', gap:'8px'
              }}>
                <span style={{fontSize:'18px'}}>💬</span> Notify Customer on WhatsApp
              </button>
            )}
          </>
        )}

        {/* Call customer */}
        {req.customer_phone && (
          <a href={`tel:${req.customer_phone}`} style={{
            display:'block', background:'#1565C0', color:'white', padding:'10px',
            borderRadius:'8px', textAlign:'center', fontWeight:700, fontSize:'14px',
            textDecoration:'none', marginBottom:'8px'
          }}>📞 Call Customer: {req.customer_phone}</a>
        )}

        {currentStatus === 'arrived' && (
          <button onClick={() => navigate(`/driver/otp/${bid.request_id}`)} style={{
            width:'100%', padding:'12px', background:'#2E7D32', color:'white',
            border:'none', borderRadius:'8px', fontWeight:700, fontSize:'14px', cursor:'pointer', marginBottom:'8px'
          }}>🔐 Enter OTP to Complete Delivery</button>
        )}

        <button onClick={() => setCancelModal(bid)} style={{
          width:'100%', padding:'10px', background:'#FFEBEE', color:'#C62828',
          border:'1.5px solid #FFCDD2', borderRadius:'8px', fontWeight:600,
          fontSize:'13px', cursor:'pointer'
        }}>⚠️ Cannot Deliver — Report Issue</button>
      </div>
    )
  }

  function BidCard({ bid }) {
    return (
      <div className="card" style={{marginBottom:'12px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px'}}>
              <TankerIcon type={bid.requests?.tanker_type} size={36} />
              <div>
                <div style={{fontWeight:700, fontSize:'14px', color: bid.requests?.tanker_type === 'water' ? '#1565C0' : '#2E7D32'}}>
                  {bid.requests?.tanker_type === 'water' ? '🚰 Water Tanker' : '🚛 Sewage Tanker'}
                </div>
                <div style={{fontSize:'13px', color:'#5a6a85'}}>{bid.requests?.capacity}L</div>
              </div>
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
            <div style={{display:'flex', gap:'6px', marginTop:'4px', flexWrap:'wrap'}}>
              {bid.delivery_time && (
                <span style={{background:'#E3F2FD', color:'#1565C0', padding:'2px 8px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>⏱️ {bid.delivery_time}</span>
              )}
              {bid.tank_capacity && (
                <span style={{background:'#E8F5E9', color:'#2E7D32', padding:'2px 8px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>🚰 {bid.tank_capacity}L</span>
              )}
            </div>
            <div style={{fontSize:'12px', color:'#5a6a85', marginTop:'4px'}}>
              🕐 {new Date(bid.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>
          </div>
        </div>
        {bid.status === 'accepted' && <DeliveryStatusButtons bid={bid} />}
        {bid.status === 'pending' && (
          <button onClick={() => setWithdrawModal(bid)} style={{
            width:'100%', padding:'8px', background:'#FFF3E0', color:'#E65100',
            border:'1.5px solid #FFE0B2', borderRadius:'8px', fontWeight:600,
            fontSize:'12px', cursor:'pointer', marginTop:'8px'
          }}>🔙 Withdraw Bid</button>
        )}
        {bid.status === 'completed' && (
          <div style={{background:'#E3F2FD', borderRadius:'8px', padding:'8px 10px', marginTop:'8px', fontSize:'13px', color:'#1565C0', fontWeight:600}}>
            🎉 Delivery completed!
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <TankerIcon type={profile.tanker_type} size={48} />
          <div>
            <div className="topbar-logo" style={{fontSize:'18px'}}>Tanker<span>Wala</span></div>
            <div style={{fontSize:'12px', color: tankerColor, fontWeight:600}}>{tankerLabel}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      {/* Location blocked warning */}
      {locationBlocked && (
        <div style={{background:'#B71C1C', color:'white', borderRadius:'12px', padding:'14px 16px', marginBottom:'12px', fontSize:'13px', fontWeight:600}}>
          🚫 Location is blocked!<br/>
          <span style={{fontWeight:400, fontSize:'12px'}}>
            Go to phone Settings → Browser → Permissions → Location → Allow. Then tap "Go Online".
          </span>
        </div>
      )}

      {/* Online/Offline Toggle */}
      <div style={{
        background: isOnline ? '#E8F5E9' : '#FFEBEE',
        borderRadius:'12px', padding:'14px 16px', marginBottom:'12px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        border: `1.5px solid ${isOnline ? '#A5D6A7' : '#FFCDD2'}`
      }}>
        <div>
          <div style={{fontWeight:700, fontSize:'15px', color: isOnline ? '#2E7D32' : '#C62828'}}>
            {isOnline ? '🟢 You are Online' : '🔴 You are Offline'}
          </div>
          <div style={{fontSize:'12px', color:'#5a6a85', marginTop:'2px'}}>
            {isOnline ? 'Receiving new requests' : 'Tap Go Online to start receiving requests'}
          </div>
          {isOnline && pushEnabled && (
            <div style={{fontSize:'11px', color:'#2E7D32', marginTop:'2px'}}>🔔 Background alerts enabled</div>
          )}
          {!isOnline && (
            <div style={{fontSize:'11px', color:'#E65100', marginTop:'4px', fontWeight:600}}>
              ⚠️ When asked, tap ALLOW for location access
            </div>
          )}
        </div>
        <button onClick={isOnline ? goOffline : goOnline} style={{
          padding:'10px 20px', borderRadius:'20px', fontWeight:700, fontSize:'14px',
          background: isOnline ? '#C62828' : '#2E7D32',
          color:'white', border:'none', cursor:'pointer', minWidth:'100px'
        }}>{isOnline ? 'Go Offline' : 'Go Online'}</button>
      </div>

      {/* Location status */}
      <div style={{
        background: locationBlocked ? '#FFEBEE' : driverLat ? '#E8F5E9' : '#F0F4FF',
        borderRadius:'8px', padding:'8px 12px', marginBottom:'12px',
        fontSize:'12px', color: locationBlocked ? '#C62828' : driverLat ? '#2E7D32' : '#5a6a85',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        fontWeight: locationBlocked ? 600 : 400
      }}>
        <span>{locationStatus}</span>
        <span>📍 {profile.area || 'Not set'} • {serviceRadius}km</span>
      </div>

      {notification && (
        <div style={{
          background: notification.includes('🚫') || notification.includes('⚠️') ? '#E65100' : '#1565C0',
          color:'white', padding:'12px 16px', borderRadius:'10px', marginBottom:'12px',
          fontWeight:600, fontSize:'13px', textAlign:'center', lineHeight:'1.5'
        }}>
          {notification}
        </div>
      )}

      {/* Wallet */}
      <div className="card" style={{background:'linear-gradient(135deg, #1565C0, #1976D2)', color:'white', marginBottom:'16px'}}>
        <div style={{fontSize:'13px', opacity:0.85, marginBottom:'4px'}}>Wallet Balance</div>
        <div style={{fontFamily:"'Baloo 2',cursive", fontSize:'36px', fontWeight:800}}>₹{walletBalance}</div>
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

      {/* Service Radius */}
      <div style={{background:'white', borderRadius:'12px', padding:'14px', marginBottom:'16px', border:'1px solid #E8EEF8'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
          <div style={{fontWeight:600, fontSize:'13px', color:'#1a2a4a'}}>📡 Service Radius</div>
          <div style={{fontWeight:800, fontSize:'18px', color:'#1565C0'}}>{serviceRadius} km {savingRadius ? '⏳' : '✅'}</div>
        </div>
        <input type="range" min="1" max="20" step="1" value={serviceRadius}
          onChange={e => updateRadius(parseInt(e.target.value))}
          style={{width:'100%', marginBottom:'6px', accentColor:'#1565C0', height:'6px'}}
        />
        <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#5a6a85'}}>
          {[1,5,10,15,20].map(r => (
            <span key={r} style={{fontWeight: serviceRadius===r ? 700 : 400, color: serviceRadius===r ? '#1565C0' : '#5a6a85'}}>{r}km</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'6px', marginBottom:'16px'}}>
        {[
          { key:'open', label:'🔔 New', count: requests.length, color:'#1565C0' },
          { key:'mybids', label:'⏳ My Bids', count: pendingBids.length, color:'#FF6F00' },
          { key:'delivery', label:'🚚 Delivery', count: activeBids.length, color:'#2E7D32' },
          { key:'history', label:'📋 History', count: historyBids.length, color:'#7B1FA2' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex:1, padding:'8px 4px', borderRadius:'10px', fontWeight:700, fontSize:'11px',
            background: tab===t.key ? t.color : '#F0F4FF',
            color: tab===t.key ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
          }}>{t.label}<br/>({t.count})</button>
        ))}
      </div>

      {loading && <div className="spinner"></div>}

      {/* New Requests */}
      {tab === 'open' && !loading && requests.map(req => {
        const dist = getDistance(driverLat, driverLng, req.location_lat, req.location_lng)
        const mapsUrl = req.location_lat && req.location_lng
          ? `https://www.google.com/maps?q=${req.location_lat},${req.location_lng}`
          : `https://www.google.com/maps/search/${encodeURIComponent(req.location_text)}`
        const existingBid = myBids.find(b => b.request_id === req.id && b.status === 'pending')
        const alreadyBid = !!existingBid
        return (
          <div key={req.id} className="card" style={{marginBottom:'12px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px'}}>
              <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                <TankerIcon type={req.tanker_type} size={44} />
                <div>
                  <div style={{fontWeight:700, fontSize:'14px', color: req.tanker_type === 'water' ? '#1565C0' : '#2E7D32'}}>
                    {req.tanker_type === 'water' ? '🚰 Water Tanker' : '🚛 Sewage Tanker'}
                  </div>
                  <div style={{fontSize:'13px', color:'#5a6a85'}}>{req.capacity}L</div>
                </div>
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
              display:'inline-block', fontSize:'13px', color:'#1565C0', fontWeight:600, marginBottom:'8px', textDecoration:'none'
            }}>📍 View on Google Maps →</a>
            <div style={{fontSize:'12px', color:'#5a6a85', marginBottom:'12px'}}>
              🕐 {new Date(req.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>
            {alreadyBid ? (
              <div>
                <div style={{background:'#E8F5E9', borderRadius:'8px', padding:'10px', marginBottom:'8px', textAlign:'center', color:'#2E7D32', fontWeight:700, fontSize:'14px'}}>
                  ✅ Bid submitted — ₹{existingBid.price}
                </div>
                <button onClick={() => setWithdrawModal(existingBid)} style={{
                  width:'100%', padding:'8px', background:'#FFF3E0', color:'#E65100',
                  border:'1.5px solid #FFE0B2', borderRadius:'8px', fontWeight:600,
                  fontSize:'12px', cursor:'pointer'
                }}>🔙 Withdraw Bid</button>
              </div>
            ) : (
              <>
                <input
                  type="number" placeholder="Your price (₹)"
                  value={bidPrices[req.id] || ''}
                  onChange={e => setBidPrices(p => ({...p, [req.id]: e.target.value}))}
                  style={{width:'100%', padding:'12px', borderRadius:'8px', border:'1.5px solid #C5D5F0', fontSize:'18px', marginBottom:'8px', boxSizing:'border-box', fontWeight:800, color:'#1565C0'}}
                />
                <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
                  <select value={bidTimes[req.id] || ''} onChange={e => setBidTimes(p => ({...p, [req.id]: e.target.value}))}
                    style={{flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid #C5D5F0', fontSize:'13px', background:'white'}}>
                    <option value="">⏱️ Delivery time</option>
                    {DELIVERY_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={bidCapacities[req.id] || ''} onChange={e => setBidCapacities(p => ({...p, [req.id]: e.target.value}))}
                    style={{flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid #C5D5F0', fontSize:'13px', background:'white'}}>
                    <option value="">🚰 Tank size</option>
                    {TANK_CAPACITIES.map(c => <option key={c} value={c}>{c}L</option>)}
                  </select>
                </div>
                <button className="btn-primary" onClick={() => submitBid(req.id)}>🏷️ Submit Bid</button>
              </>
            )}
          </div>
        )
      })}
      {tab === 'open' && !loading && requests.length === 0 && (
        <div className="empty-state">
          <TankerIcon type={profile.tanker_type} size={80} />
          <p>No new requests within {serviceRadius}km.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Increase radius or wait for requests!</p>
        </div>
      )}

      {tab === 'mybids' && !loading && pendingBids.length === 0 && (
        <div className="empty-state"><div className="icon">⏳</div><p>No pending bids.</p></div>
      )}
      {tab === 'mybids' && !loading && pendingBids.map(bid => <BidCard key={bid.id} bid={bid} />)}

      {tab === 'delivery' && !loading && activeBids.length === 0 && (
        <div className="empty-state"><div className="icon">🚚</div><p>No active deliveries.</p></div>
      )}
      {tab === 'delivery' && !loading && activeBids.map(bid => <BidCard key={bid.id} bid={bid} />)}

      {tab === 'history' && !loading && (
        <>
          <div style={{background:'linear-gradient(135deg, #7B1FA2, #9C27B0)', borderRadius:'12px', padding:'16px', marginBottom:'16px', color:'white'}}>
            <div style={{fontSize:'13px', opacity:0.85, marginBottom:'8px'}}>📊 Your Delivery Stats</div>
            <div style={{display:'flex', gap:'12px'}}>
              <div style={{flex:1, background:'rgba(255,255,255,0.15)', borderRadius:'10px', padding:'12px', textAlign:'center'}}>
                <div style={{fontSize:'28px', fontWeight:800, fontFamily:"'Baloo 2',cursive"}}>{historyBids.length}</div>
                <div style={{fontSize:'11px', opacity:0.85}}>Total</div>
              </div>
              <div style={{flex:1, background:'rgba(255,255,255,0.15)', borderRadius:'10px', padding:'12px', textAlign:'center'}}>
                <div style={{fontSize:'28px', fontWeight:800, fontFamily:"'Baloo 2',cursive"}}>{thisWeekDeliveries}</div>
                <div style={{fontSize:'11px', opacity:0.85}}>This Week</div>
              </div>
              <div style={{flex:1, background:'rgba(255,255,255,0.15)', borderRadius:'10px', padding:'12px', textAlign:'center'}}>
                <div style={{fontSize:'28px', fontWeight:800, fontFamily:"'Baloo 2',cursive"}}>{historyBids.filter(b => isToday(b.created_at)).length}</div>
                <div style={{fontSize:'11px', opacity:0.85}}>Today</div>
              </div>
            </div>
          </div>
          {historyBids.length === 0 && (
            <div className="empty-state"><TankerIcon type={profile.tanker_type} size={80} /><p>No completed deliveries yet.</p></div>
          )}
          {historyBids.map(bid => (
            <div key={bid.id} className="card" style={{marginBottom:'12px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                  <TankerIcon type={bid.requests?.tanker_type} size={36} />
                  <div>
                    <div style={{fontWeight:700, fontSize:'14px', color: bid.requests?.tanker_type === 'water' ? '#1565C0' : '#2E7D32'}}>
                      {bid.requests?.tanker_type === 'water' ? '🚰 Water Tanker' : '🚛 Sewage Tanker'}
                    </div>
                    <div style={{fontSize:'13px', color:'#5a6a85'}}>{bid.requests?.capacity}L • {bid.requests?.location_text}</div>
                    <div style={{fontSize:'16px', fontWeight:800, color:'#1565C0', fontFamily:"'Baloo 2',cursive"}}>₹{bid.price}</div>
                    <div style={{fontSize:'12px', color:'#5a6a85'}}>
                      🕐 {new Date(bid.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
                <span style={{background:'#E3F2FD', color:'#1565C0', padding:'6px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>✅ DONE</span>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end'}}>
          <div style={{background:'white', borderRadius:'20px 20px 0 0', padding:'24px', width:'100%'}}>
            <div style={{fontWeight:700, fontSize:'16px', marginBottom:'6px', color:'#C62828'}}>⚠️ Cannot Deliver</div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'16px'}}>Select reason — ₹10 will be refunded</div>
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

      {/* Withdraw Modal */}
      {withdrawModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}>
          <div style={{background:'white', borderRadius:'16px', padding:'24px', width:'100%'}}>
            <div style={{fontWeight:700, fontSize:'16px', marginBottom:'8px'}}>🔙 Withdraw Bid</div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'20px'}}>Withdraw your bid of ₹{withdrawModal.price}?</div>
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
