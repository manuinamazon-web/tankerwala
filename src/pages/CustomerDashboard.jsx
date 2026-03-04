import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

export default function CustomerDashboard({ profile }) {
  const [tab, setTab] = useState('active')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchRequests()

    const channel = supabase.channel('customer-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => {
        playSound(660, 0.4, 2)
        fetchRequests()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.new?.customer_id === profile.id && payload.new?.status === 'accepted') {
          playSound(528, 0.4, 4)
        }
        fetchRequests()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchRequests() {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  function enableSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      g.gain.value = 0.3
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 660
      o.type = 'sine'
      o.start(); o.stop(ctx.currentTime + 0.3)
      setSoundEnabled(true)
    } catch(e) {
      alert('Could not enable sound. Please check your browser settings.')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'accepted')
  const completedRequests = requests.filter(r => r.status === 'completed')
  const cancelledRequests = requests.filter(r => r.status === 'cancelled' || r.status === 'rejected')

  function RequestCard({ req }) {
    return (
      <div className="card" style={{marginBottom:'12px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px'}}>
          <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
            <span style={{background: req.tanker_type==='water' ? '#E3F2FD' : '#E8F5E9', color: req.tanker_type==='water' ? '#1565C0' : '#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
              {req.tanker_type === 'water' ? '💧 Water' : '🚽 Sewage'}
            </span>
            <span style={{fontWeight:600, color:'#333'}}>{req.capacity} litres</span>
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

        {req.status === 'accepted' && req.driver_phone && (
          <div style={{background:'#E8F5E9', borderRadius:'10px', padding:'12px', marginBottom:'12px'}}>
            <div style={{fontWeight:700, color:'#2E7D32', marginBottom:'4px'}}>✅ Bid accepted!</div>
            <a href={`tel:${req.driver_phone}`} style={{fontSize:'14px', color:'#1565C0', fontWeight:700, textDecoration:'none'}}>
              📞 Call Driver: {req.driver_phone}
            </a>
          </div>
        )}

        {req.status === 'pending' && (
          <button
            onClick={() => navigate(`/customer/bids/${req.id}`)}
            style={{width:'100%', padding:'12px', background:'#F0F4FF', border:'1.5px solid #C5D5F0', borderRadius:'10px', color:'#1565C0', fontWeight:600, fontSize:'14px', cursor:'pointer'}}
          >
            👁️ View Bids
          </button>
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

      {!soundEnabled && (
        <button onClick={enableSound} style={{
          width:'100%', padding:'14px', marginBottom:'12px',
          background:'linear-gradient(135deg, #FF6F00, #FF8F00)',
          color:'white', border:'none', borderRadius:'12px',
          fontWeight:700, fontSize:'15px', cursor:'pointer',
          boxShadow:'0 4px 12px rgba(255,111,0,0.3)'
        }}>
          🔔 Tap here to enable sound alerts
        </button>
      )}

      {soundEnabled && (
        <div style={{background:'#E8F5E9', borderRadius:'8px', padding:'8px 12px', marginBottom:'12px', fontSize:'13px', color:'#2E7D32', textAlign:'center', fontWeight:600}}>
          🔔 Sound alerts enabled ✅
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
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Post a new request to get bids from drivers!</p>
        </div>
      )}

      {tab === 'completed' && !loading && completedRequests.length === 0 && (
        <div className="empty-state">
          <div className="icon">✅</div>
          <p>No completed deliveries yet.</p>
        </div>
      )}

      {tab === 'cancelled' && !loading && cancelledRequests.length === 0 && (
        <div className="empty-state">
          <div className="icon">❌</div>
          <p>No cancelled requests.</p>
        </div>
      )}

      {tab === 'active' && !loading && activeRequests.map(req => <RequestCard key={req.id} req={req} />)}
      {tab === 'completed' && !loading && completedRequests.map(req => <RequestCard key={req.id} req={req} />)}
      {tab === 'cancelled' && !loading && cancelledRequests.map(req => <RequestCard key={req.id} req={req} />)}
    </div>
  )
}
