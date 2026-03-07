import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
}

const DELIVERY_STATUS_INFO = {
  pending:    { label: 'Waiting for driver',      icon: '⏳', color: '#E65100', bg: '#FFF3E0' },
  loading:    { label: 'Driver is loading water', icon: '🔄', color: '#FF6F00', bg: '#FFF8E1' },
  on_the_way: { label: 'Driver is on the way!',   icon: '🚛', color: '#1565C0', bg: '#E3F2FD' },
  arrived:    { label: 'Driver has arrived!',      icon: '📍', color: '#2E7D32', bg: '#E8F5E9' },
  completed:  { label: 'Delivered!',               icon: '✅', color: '#1565C0', bg: '#E3F2FD' },
}

// ⭐ Star Rating Component
function StarPicker({ value, onChange }) {
  return (
    <div style={{display:'flex', gap:'8px', justifyContent:'center', margin:'16px 0'}}>
      {[1,2,3,4,5].map(star => (
        <span
          key={star}
          onClick={() => onChange(star)}
          style={{
            fontSize:'44px', cursor:'pointer',
            color: star <= value ? '#FFA726' : '#E0E0E0',
            transition:'color 0.15s'
          }}
        >★</span>
      ))}
    </div>
  )
}

export default function CustomerDashboard({ profile }) {
  const [tab, setTab] = useState('active')
  const [requests, setRequests] = useState([])
  const [bidCounts, setBidCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const [ratingModal, setRatingModal] = useState(null) // { requestId, driverId, driverName }
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratedRequests, setRatedRequests] = useState([])
  const audioUnlocked = useRef(false)
  const navigate = useNavigate()

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => {
        fetchRequests()
        fetchBidCounts()
        playSound(660, 0.4, 2)
        showNotification('🔔 New bid received!')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        fetchRequests()
        fetchBidCounts()
        if (payload.new?.customer_id === profile.id) {
          const newStatus = payload.new?.status
          const oldStatus = payload.old?.status
          const newDelivery = payload.new?.delivery_status
          const oldDelivery = payload.old?.delivery_status
          if (newStatus === 'accepted' && oldStatus !== 'accepted') {
            playSound(528, 0.4, 4)
            showNotification('✅ Bid accepted! Share OTP with driver on arrival.')
          }
          if (newStatus === 'pending' && oldStatus === 'accepted') {
            playSound(440, 0.4, 3)
            showNotification('⚠️ Driver cancelled! Please choose another bid.')
          }
          if (newStatus === 'completed' && oldStatus !== 'completed') {
            playSound(528, 0.4, 4)
            showNotification('🎉 Delivery completed! Please rate your driver.')
            // Show rating modal after short delay
            setTimeout(() => {
              if (payload.new?.driver_id && !payload.new?.is_rated) {
                showRatingModal(payload.new.id, payload.new.driver_id, payload.new.driver_name || 'your driver', false)
              }
            }, 1500)
          }
          if (newDelivery !== oldDelivery) {
            const info = DELIVERY_STATUS_INFO[newDelivery]
            if (info) {
              playSound(660, 0.3, 2)
              showNotification(`${info.icon} ${info.label}`)
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bids' }, () => {
        fetchRequests()
        fetchBidCounts()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 6000)
  }

  function showRatingModal(requestId, driverId, driverName, isAlreadyRated) {
    if (isAlreadyRated || ratedRequests.includes(requestId)) return
    setRatingValue(0)
    setRatingModal({ requestId, driverId, driverName })
  }

  async function submitRating() {
    if (ratingValue === 0) return alert('Please select a star rating!')
    setRatingSubmitting(true)

    // Get current driver rating
    const { data: driver } = await supabase
      .from('profiles')
      .select('rating, total_ratings')
      .eq('id', ratingModal.driverId)
      .single()

    const currentRating = parseFloat(driver?.rating || 0)
    const currentCount = parseInt(driver?.total_ratings || 0)

    // Calculate new average
    const newCount = currentCount + 1
    const newRating = ((currentRating * currentCount) + ratingValue) / newCount

    // Update driver profile
    await supabase.from('profiles').update({
      rating: parseFloat(newRating.toFixed(2)),
      total_ratings: newCount
    }).eq('id', ratingModal.driverId)

    // Mark request as rated
    await supabase.from('requests').update({
      is_rated: true,
      customer_rating: ratingValue
    }).eq('id', ratingModal.requestId)

    // Save in state so modal doesn't show again this session
    const updated = [...ratedRequests, ratingModal.requestId]
    setRatedRequests(updated)

    setRatingSubmitting(false)
    setRatingModal(null)
    setRatingValue(0)
    showNotification('⭐ Thank you for rating!')
    fetchRequests() // refresh to show rated status
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
      .from('requests').select('id').eq('customer_id', profile.id)
    if (!reqs || reqs.length === 0) return
    const reqIds = reqs.map(r => r.id)
    const { data: bids } = await supabase
      .from('bids').select('request_id')
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

  async function cancelAcceptedRequest(requestId) {
    if (!window.confirm('Cancel this request? The driver will be notified.')) return
    // Reset request back to pending so other drivers can bid
    await supabase.from('requests').update({
      status: 'cancelled',
      driver_id: null,
      driver_name: null,
      driver_phone: null,
      otp: null,
      otp_verified: false,
      delivery_status: 'pending'
    }).eq('id', requestId)
    // Withdraw the accepted bid
    await supabase.from('bids').update({ status: 'withdrawn' })
      .eq('request_id', requestId)
      .eq('status', 'accepted')
    fetchRequests()
    showNotification('❌ Request cancelled.')
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'accepted')
  const completedRequests = requests.filter(r => r.status === 'completed')
  const cancelledRequests = requests.filter(r => r.status === 'cancelled' || r.status === 'expired')

  function DeliveryStatusBar({ req }) {
    const stages = ['loading', 'on_the_way', 'arrived', 'completed']
    const currentIdx = stages.indexOf(req.delivery_status)
    const info = DELIVERY_STATUS_INFO[req.delivery_status] || DELIVERY_STATUS_INFO['pending']
    if (req.status !== 'accepted' && req.status !== 'completed') return null
    return (
      <div style={{background: info.bg, borderRadius:'10px', padding:'12px', marginBottom:'12px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
          <span style={{fontSize:'20px'}}>{info.icon}</span>
          <span style={{fontWeight:700, fontSize:'14px', color: info.color}}>{info.label}</span>
        </div>
        <div style={{display:'flex', gap:'4px'}}>
          {stages.map((stage, idx) => (
            <div key={stage} style={{
              flex:1, height:'6px', borderRadius:'4px',
              background: idx <= currentIdx ? info.color : '#E0E0E0',
              transition: 'background 0.3s ease'
            }} />
          ))}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:'6px'}}>
          {['Loading','On Way','Arrived','Done'].map((label, idx) => (
            <span key={label} style={{
              fontSize:'10px', fontWeight: idx <= currentIdx ? 700 : 400,
              color: idx <= currentIdx ? info.color : '#9E9E9E'
            }}>{label}</span>
          ))}
        </div>
      </div>
    )
  }

  function RequestCard({ req }) {
    const bidCount = bidCounts[req.id] || 0
    const isRated = req.is_rated === true || ratedRequests.includes(req.id)
    return (
      <div className="card" style={{marginBottom:'12px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px'}}>
          <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
            <TankerIcon type={req.tanker_type} size={44} />
            <div>
              <div style={{
                fontWeight:700, fontSize:'14px',
                color: req.tanker_type === 'water' ? '#1565C0' : '#2E7D32'
              }}>
                {req.tanker_type === 'water' ? '🚰 Water Tanker' : '🚛 Sewage Tanker'}
              </div>
              <div style={{fontSize:'13px', color:'#5a6a85'}}>{req.capacity} Litres</div>
            </div>
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

        <DeliveryStatusBar req={req} />

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
            <div style={{fontWeight:700, color:'#2E7D32', marginBottom:'8px'}}>✅ Bid accepted!</div>

            {/* Driver details */}
            {req.driver_name && (
              <div style={{fontSize:'14px', fontWeight:700, color:'#1a2a4a', marginBottom:'4px'}}>
                👤 {req.driver_name}
              </div>
            )}
            {req.driver_phone && (
              <a href={`tel:${req.driver_phone}`} style={{
                fontSize:'14px', color:'#1565C0', fontWeight:700,
                textDecoration:'none', display:'block', marginBottom:'4px'
              }}>📞 Call Driver: {req.driver_phone}</a>
            )}
            {req.vehicle_number && (
              <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'8px'}}>
                🚗 Vehicle: {req.vehicle_number}
              </div>
            )}

            {req.otp && (req.delivery_status === 'arrived' || req.delivery_status === 'completed') && (
              <div style={{background:'#1565C0', borderRadius:'10px', padding:'12px', textAlign:'center', marginBottom:'8px'}}>
                <div style={{fontSize:'12px', color:'rgba(255,255,255,0.8)', marginBottom:'4px'}}>Share OTP with driver</div>
                <div style={{fontSize:'36px', fontWeight:900, color:'white', letterSpacing:'8px', fontFamily:"'Baloo 2',cursive"}}>
                  {req.otp}
                </div>
              </div>
            )}
            {req.otp && req.delivery_status !== 'arrived' && req.delivery_status !== 'completed' && (
              <div style={{background:'#F0F4FF', borderRadius:'10px', padding:'10px', textAlign:'center', fontSize:'13px', color:'#5a6a85', marginBottom:'8px'}}>
                🔒 OTP will be shown when driver arrives
              </div>
            )}

            {/* 🗺️ Live location link when driver is on the way */}
            {req.delivery_status === 'on_the_way' && req.driver_lat && req.driver_lng && (
              <a
                href={`https://maps.google.com/?q=${req.driver_lat},${req.driver_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:'block', marginBottom:'8px', background:'#E8F5E9',
                  color:'#2E7D32', padding:'10px', borderRadius:'10px',
                  textAlign:'center', fontWeight:700, fontSize:'14px',
                  textDecoration:'none'
                }}
              >
                🗺️ View Driver Live Location
              </a>
            )}

            {/* ❌ Cancel option — only if driver hasn't started yet */}
            {(req.delivery_status === 'pending' || !req.delivery_status) && (
              <button
                onClick={() => cancelAcceptedRequest(req.id)}
                style={{
                  width:'100%', padding:'10px', borderRadius:'10px',
                  background:'#FFEBEE', color:'#C62828',
                  border:'1.5px solid #FFCDD2', fontWeight:600,
                  fontSize:'13px', cursor:'pointer', marginTop:'4px'
                }}
              >
                ❌ Cancel Request (Driver hasn't started yet)
              </button>
            )}
          </div>
        )}

        {/* ⭐ Rating section for completed requests */}
        {req.status === 'completed' && (
          <div style={{background:'#E3F2FD', borderRadius:'10px', padding:'12px', marginBottom:'12px'}}>
            <div style={{fontWeight:700, color:'#1565C0', marginBottom:'4px'}}>🎉 Delivery completed!</div>
            {req.accepted_price && (
              <div style={{fontSize:'14px', color:'#333', marginBottom:'8px'}}>💰 Amount paid: <strong>₹{req.accepted_price}</strong></div>
            )}
            {!isRated && req.driver_id ? (
              <button
                onClick={() => showRatingModal(req.id, req.driver_id, req.driver_name || req.driver_phone || 'your driver', req.is_rated)}
                style={{
                  width:'100%', padding:'10px', borderRadius:'10px',
                  background:'#FFA726', color:'white', border:'none',
                  fontWeight:700, fontSize:'14px', cursor:'pointer'
                }}
              >
                ⭐ Rate Your Driver
              </button>
            ) : isRated ? (
              <div style={{textAlign:'center', fontSize:'13px', color:'#2E7D32', fontWeight:600}}>
                {'⭐'.repeat(req.customer_rating || 5)} Rated {req.customer_rating || 5}/5 — Thank you!
              </div>
            ) : null}
          </div>
        )}

        {req.status === 'pending' && (
          <div style={{display:'flex', gap:'8px'}}>
            <button onClick={() => navigate(`/customer/bids/${req.id}`)} style={{
              flex:1, padding:'12px',
              background: bidCount > 0 ? '#1565C0' : '#F0F4FF',
              border: bidCount > 0 ? 'none' : '1.5px solid #C5D5F0',
              borderRadius:'10px',
              color: bidCount > 0 ? 'white' : '#1565C0',
              fontWeight:600, fontSize:'14px', cursor:'pointer'
            }}>
              {bidCount > 0 ? `👁️ View ${bidCount} Bid${bidCount > 1 ? 's' : ''}` : '👁️ View Bids'}
            </button>
            <button onClick={() => cancelRequest(req.id)} style={{
              padding:'12px 16px', background:'#FFEBEE',
              border:'1.5px solid #FFCDD2', borderRadius:'10px',
              color:'#C62828', fontWeight:600, fontSize:'14px', cursor:'pointer'
            }}>❌</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <TankerIcon type="water" size={36} />
          <div>
            <div className="topbar-logo">Tanker<span>Wala</span></div>
            <div style={{fontSize:'12px', color:'#5a6a85'}}>Hello, {profile.name} 👋</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      {notification && (
        <div style={{
          background:'#1565C0', color:'white', padding:'12px 16px',
          borderRadius:'10px', marginBottom:'12px', fontWeight:600,
          fontSize:'14px', textAlign:'center',
          boxShadow:'0 4px 12px rgba(21,101,192,0.3)'
        }}>
          {notification}
        </div>
      )}

      {/* ⭐ Rating Modal */}
      {ratingModal && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.6)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
        }}>
          <div style={{
            background:'white', borderRadius:'20px', padding:'28px',
            width:'100%', maxWidth:'360px', textAlign:'center',
            boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{fontSize:'48px', marginBottom:'8px'}}>🎉</div>
            <div style={{fontWeight:800, fontSize:'20px', color:'#1a2a4a', marginBottom:'4px'}}>
              Delivery Complete!
            </div>
            <div style={{fontSize:'14px', color:'#5a6a85', marginBottom:'4px'}}>
              How was your experience with
            </div>
            <div style={{fontWeight:700, fontSize:'18px', color:'#1565C0', marginBottom:'16px'}}>
              {ratingModal.driverName}?
            </div>

            <StarPicker value={ratingValue} onChange={setRatingValue} />

            <div style={{fontSize:'14px', color:'#5a6a85', marginBottom:'20px', minHeight:'20px'}}>
              {ratingValue === 1 && '😞 Poor'}
              {ratingValue === 2 && '😐 Fair'}
              {ratingValue === 3 && '🙂 Good'}
              {ratingValue === 4 && '😊 Very Good'}
              {ratingValue === 5 && '🤩 Excellent!'}
            </div>

            <button
              onClick={submitRating}
              disabled={ratingSubmitting || ratingValue === 0}
              style={{
                width:'100%', padding:'14px', borderRadius:'12px',
                background: ratingValue === 0 ? '#E0E0E0' : '#1565C0',
                color: ratingValue === 0 ? '#9E9E9E' : 'white',
                border:'none', fontWeight:700, fontSize:'16px',
                cursor: ratingValue === 0 ? 'not-allowed' : 'pointer',
                marginBottom:'10px'
              }}
            >
              {ratingSubmitting ? '⏳ Submitting...' : '⭐ Submit Rating'}
            </button>

            <button
              onClick={() => setRatingModal(null)}
              style={{
                width:'100%', padding:'10px', borderRadius:'12px',
                background:'#F0F4FF', color:'#5a6a85',
                border:'none', fontWeight:600, fontSize:'14px', cursor:'pointer'
              }}
            >
              Skip for now
            </button>
          </div>
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
          <TankerIcon type="water" size={80} />
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
