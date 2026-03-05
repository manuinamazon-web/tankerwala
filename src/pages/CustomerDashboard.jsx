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
}

export default function CustomerDashboard({ profile }) {
  const [tab, setTab] = useState('active')
  const [requests, setRequests] = useState([])
  const [bidCounts, setBidCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const audioUnlocked = useRef(false)
  const navigate = useNavigate()

  // Unlock audio on first touch
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
    fetchRequests()
    fetchBidCounts()

    const channel = supabase.channel('customer-dashboard-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, (payload) => {
        playSound(660, 0.4, 2)
        showNotification('🔔 New bid received!')
        fetchRequests()
        fetchBidCounts()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.new?.customer_id === profile.id) {
          if (payload.new?.status === 'accepted') {
            playSound(528, 0.4, 4)
            showNotification('✅ Bid accepted! Share OTP with driver on arrival.')
          }
          if (payload.new?.status === 'pending' && payload.old?.status === 'accepted') {
            playSound(440, 0.4, 3)
            showNotification('⚠️ Driver cancelled! Please choose another bid.')
          }
          fetchRequests()
          fetchBidCounts()
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 5000)
  }

  async function fetchRequests() {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function fetchBidCounts() {
    const { data: reqs } = await supabase
      .from('requests')
      .select('id')
      .eq('customer_id', profile.id)

    if (!reqs || reqs.length === 0) return

    const reqIds = reqs.map(r => r.id)
    const { data: bids } = await supabase
      .from('bids')
      .select('request_id')
      .in('request_id', reqIds)
      .not('status', 'eq', 'withdrawn')

    const counts = {}
    ;(bids || []).forEach(b => {
      counts[b.request_id] = (counts[b.request_id] || 0) + 1
    })
    setBidCounts(counts)
  }

  async function cancelRequest(requestId) {
    if (!window.confirm('Are you sure you want to cancel this request?')) return
    await supabase.from('requests').update({ status: 'cancelled' }).eq('id', requestId)
    fetchRequests()
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'accepted')
  const completedRequests = requests.filter(r => r.status === 'completed')
  const cancelledRequests = requests.filter(r => r.status === 'cancelled' || r.status === 'expired')

  function RequestCard({ req }) {
    const bidCount = bidCounts[req.id] || 0
    return (
      <div className="card" style={{marginBottom:'12px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px'}}>
          <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
            <span style={{background: req.tanker_type==='water' ? '#E3F2FD' : '#E8F5E9', color: req.tanker_type==='water' ? '#1565C0' : '#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
              {req.tanker_type === 'water' ? '🚰 Water' : '🚛 Sewage'}
            </span>
            <span style={{fontWeight:600, color:'#333'}}>{req.capacity} L</span>
          </div>
          <span style={{
            padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
            background: req.status==='accepted' ? '#E8F5E9' : req.status==='completed' ? '#E3F2FD' : req.status==='pending' ? '#FFF3E0' : '#FFEBEE',
            color: req.status==='accepted' ? '#2E7D32' : req.status==='completed' ? '#1565C0' : req.status==='pending' ? '#E65100' : '#C62828'
          }}>
            {req.status?.toUpperCase()}
          </span>
        </div>

        {req.location_text && (
          <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'4px'}}>📍 {req.location_text}</div>
        )}

        <div style={{fontSize:'12px', color:'#5a6a85', marginBottom:'12px'}}>
          🕐 {new Date(req.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
        </div>

        {req.status === 'pending' && (
          <div style={{
            background: bidCount > 0 ? '#E8F5E9' : '#FFF3E0',
            borderRadius:'10px', padding:'10px 14px', marginBottom:'12px',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{fontSize:'14px', fontWeight:700, color: bidCount > 0 ? '#2E7D32' : '#E65100'}}>
              {bidCount > 0 ? `🏷️ ${bidCount} bid${bidCount > 1 ? 's' : ''} received!` : '⏳ Waiting for bids...'}
            </span>
            {bidCount > 0 && (
              <span style={{
                background:'#2E7D32', color:'white', borderRadius:'50%',
                width:'28px', height:'28px', display:'flex', alignItems:'center',
                justifyContent:'center', fontWeight:800, fontSize:'14px'
              }}>{bidCount}</span>
            )}
          </div>
        )}

        {req.status === 'accepted' && (
          <div style={{background:'#E8F5E9', borderRadius:'10px', padding:'12px', marginBottom:'12px'}}>
            <div style={{fontWeight:700, color:'#2E7D32', marginBottom:'4px'}}>✅ Bid accepted!</div>
            {req.driver_phone && (
              <a href={`tel:${req.driver_phone}`} style={{fontSize:'14px', color:'#1565C0', fontWeight:700, textDecoration:'none', display:'block', marginBottom:'8px'}}>
                📞 Call Driver: {req.driver_phone}
              </a>
            )}
            {req.otp && (
              <div style={{background:'#1565C0', borderRadius:'10px', padding:'12px', textAlign:'center'}}>
                <div style={{fontSize:'12px', color:'rgba(255,255,255,0.8)', marginBottom:'4px'}}>Share OTP with driver on arrival</div>
                <div style={{fontSize:'36px', fontWeight:900, color:'white', letterSpacing:'8px', fontFamily:"'Baloo 2',cursive"}}>{req.otp}</div>
              </div>
            )}
          </div>
        )}

        {req.status === 'pending' && (
          <div style={{display:'flex', gap:'8px'}}>
            <button
              onClick={() => navigate(`/customer/bids/${req.id}`)}
              style={{flex:1, padding:'12px', background: bidCount > 0 ? '#1565C0' : '#F0F4FF', border: bidCount > 0 ? 'none' : '1.5px solid #C5D5F0', borderRadius:'10px', color: bidCount > 0 ? 'white' : '#1565C0', fontWeight:600, fontSize:'14px', cursor:'pointer'}}
            >
              {bidCount > 0 ? `👁️ View ${bidCount} Bid${bidCount > 1 ? 's' : ''}` : '👁️ View Bids'}
            </button>
            <button
              onClick={() => cancelRequest(req.id)}
              style={{padding:'12px 16px', background:'#FFEBEE', border:'1.5px solid #FFCDD2', borderRadius:'10px', color:'#C62828', fontWeight:600, fontSize:'14px', cursor:'pointer'}}
            >
              ❌
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="topbar-logo">Tanker<span>Wala</span></div>
          <div style={{fontSize:'12px', color:'#5a6a85'}}>Hello, {profile.name} 👋</div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      {notification && (
        <div style={{
          background:'#1565C0', color:'white', padding:'12px 16px', borderRadius:'10px',
          marginBottom:'12px', fontWeight:600, fontSize:'14px', textAlign:'center'
        }}>
          {notification}
        </div>
      )}

      <button className="btn-primary" style={{marginBottom:'16px'}} onClick={() => navigate('/customer/post')}>
        + Post New Tanker Request
      </button>

      <div style={{display:'flex', gap:'6px', marginBottom:'16px'}}>
        <button onClick={() => setTab('active')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'13px',
          background: tab==='active' ? '#1565C0' : '#F0F4FF',
          color: tab==='active' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>🔔 Active ({activeRequests.length})</button>
        <button onClick={() => setTab('completed')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'13px',
          background: tab==='completed' ? '#2E7D32' : '#F0F4FF',
          color: tab==='completed' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>✅ Done ({completedRequests.length})</button>
        <button onClick={() => setTab('cancelled')} style={{
          flex:1, padding:'10px', borderRadius:'10px', fontWeight:700, fontSize:'13px',
          background: tab==='cancelled' ? '#C62828' : '#F0F4FF',
          color: tab==='cancelled' ? 'white' : '#5a6a85', border:'none', cursor:'pointer'
        }}>❌ Cancelled ({cancelledRequests.length})</button>
      </div>

      {loading && <div className="spinner"></div>}

      {tab === 'active' && !loading && activeRequests.length === 0 && (
        <div className="empty-state">
          <div className="icon">🚛</div>
          <p>No active requests.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Post a new request to get bids!</p>
        </div>
      )}
      {tab === 'completed' && !loading && completedRequests.length === 0 && (
        <div className="empty-state"><div className="icon">✅</div><p>No completed deliveries yet.</p></div>
      )}
      {tab === 'cancelled' && !loading && cancelledRequests.length === 0 && (
        <div className="empty-state"><div className="icon">❌</div><p>No cancelled requests.</p></div>
      )}

      {tab === 'active' && !loading && activeRequests.map(req => <RequestCard key={req.id} req={req} />)}
      {tab === 'completed' && !loading && completedRequests.map(req => <RequestCard key={req.id} req={req} />)}
      {tab === 'cancelled' && !loading && cancelledRequests.map(req => <RequestCard key={req.id} req={req} />)}
    </div>
  )
}
