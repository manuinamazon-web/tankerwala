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
  const [driverLat, setDriverLat] = useState(profile.driver_lat || null)
  const [driverLng, setDriverLng] = useState(profile.driver_lng || null)
  const [locationStatus, setLocationStatus] = useState('Getting your location...')
  const [serviceRadius, setServiceRadius] = useState(profile.service_radius || 10)
  const [savingRadius, setSavingRadius] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    updateLocation()
    const locationInterval = setInterval(updateLocation, 2 * 60 * 1000)

    const channel = supabase.channel('driver-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.new?.tanker_type === profile.tanker_type) {
          const dist = getDistance(
            profile.driver_lat, profile.driver_lng,
            payload.new?.location_lat, payload.new?.location_lng
          )
          if (!dist || parseFloat(dist) <= serviceRadius) {
            playSound(440, 0.4, 4)
            fetchData()
          }
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

  useEffect(() => {
    fetchData()
  }, [serviceRadius, driverLat, driverLng])

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

    const currentLat = driverLat || profile.driver_lat
    const currentLng = driverLng || profile.driver_lng

    const filteredReqs = (reqs || []).filter(req => {
      if (!req.location_lat || !req.location_lng) return true
      if (!currentLat || !currentLng) return true
      const dist = getDistance(currentLat, currentLng, req.location_lat, req.location_lng)
      return !dist || parseFloat(dist) <= serviceRadius
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
        <span>📍 {profile.area || 'Not set'} • {serviceRadius}km</span>
      </div>

      <div className="card" style={{background:'linear-gradient(135deg, #1565C0, #1976D2)', color:'white', marginBottom:'16px'}}>
        <div style={{fontSize:'13px', opacity:0.85, marginBottom:'4px'}}>Wallet Balance</div>
        <div style={{fontFamily:"'Baloo 2',cursive", fontSize:'36px', fontWeight:800}}>₹{profile.wallet_balance || 0}</div>
        <div style={{fo
