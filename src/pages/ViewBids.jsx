import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

function StarRating({ rating, size = 14 }) {
  if (!rating) return <span style={{fontSize: size, color:'#9E9E9E'}}>No ratings yet</span>
  const stars = Math.round(rating)
  return (
    <span style={{fontSize: size}}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{color: i <= stars ? '#FFA726' : '#E0E0E0'}}>★</span>
      ))}
      <span style={{fontSize: size - 2, color:'#5a6a85', marginLeft:'4px'}}>{parseFloat(rating).toFixed(1)}</span>
    </span>
  )
}

export default function ViewBids({ profile }) {
  const [request, setRequest] = useState(null)
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(null)
  const [acceptedBid, setAcceptedBid] = useState(null)
  const [otp, setOtp] = useState(null)
  const { requestId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('bids-' + requestId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `request_id=eq.${requestId}` },
        () => { playSound(660, 0.4, 2); fetchData() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
        () => fetchData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [requestId])

  async function fetchData() {
    const [{ data: req }, { data: bidData }] = await Promise.all([
      supabase.from('requests').select('*').eq('id', requestId).single(),
      supabase.from('bids').select('*, profiles(id, name, phone, area, tanker_type, driver_lat, driver_lng, rating, total_ratings, total_deliveries)')
        .eq('request_id', requestId)
        .order('price', { ascending: true })
    ])
    setRequest(req)
    setBids(bidData || [])
    if (req?.status === 'accepted' && req?.otp) {
      setOtp(req.otp)
      const accepted = bidData?.find(b => b.status === 'accepted')
      if (accepted) setAcceptedBid(accepted)
    }
    setLoading(false)
  }

  async function acceptBid(bid) {
    setAccepting(bid.id)

    const { data: driver } = await supabase
      .from('profiles')
      .select('wallet_balance, is_active, name')
      .eq('id', bid.driver_id)
      .single()

    if (!driver.is_active || driver.wallet_balance < 10) {
      alert('This driver has insufficient wallet balance. Please choose another driver.')
      setAccepting(null)
      return
    }

    const { error } = await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id)
    if (error) { alert(error.message); setAccepting(null); return }

    // ✅ Save driver_id and driver_name to request for rating later
    await supabase.from('requests').update({
      driver_id: bid.driver_id,
      driver_name: driver.name,
      driver_phone: bid.profiles?.phone
    }).eq('id', requestId)

    setTimeout(async () => {
      const { data: updatedReq } = await supabase.from('requests').select('*').eq('id', requestId).single()
      if (updatedReq?.otp) {
        setOtp(updatedReq.otp)
        setAcceptedBid(bid)
        setRequest(updatedReq)
      }
      setAccepting(null)
    }, 1000)
  }

  if (loading) return <div className="spinner" style={{marginTop:'40vh'}}></div>

  if (otp && acceptedBid) {
    return (
      <div className="page">
        <div className="topbar">
          <button onClick={() => navigate('/customer')} style={{background:'#F0F4FF', border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:600, color:'#1565C0'}}>
            ← Back
          </button>
          <div className="topbar-logo">Delivery OTP</div>
          <div></div>
        </div>

        <div className="card" style={{textAlign:'center', marginBottom:'16px'}}>
          <div style={{fontSize:'48px', marginBottom:'8px'}}>✅</div>
          <div style={{fontWeight:800, fontSize:'18px', color:'#2E7D32', marginBottom:'4px'}}>Bid Accepted!</div>
          <div style={{fontSize:'14px', color:'#5a6a85', marginBottom:'20px'}}>
            Share this OTP with the driver when they arrive
          </div>

          <div style={{
            background:'linear-gradient(135deg, #1565C0, #1976D2)',
            borderRadius:'16px', padding:'24px', marginBottom:'20px'
          }}>
            <div style={{fontSize:'13px', color:'rgba(255,255,255,0.8)', marginBottom:'8px'}}>Your Delivery OTP</div>
            <div style={{
              fontSize:'52px', fontWeight:900, color:'white', letterSpacing:'12px',
              fontFamily:"'Baloo 2',cursive"
            }}>{otp}</div>
            <div style={{fontSize:'12px', color:'rgba(255,255,255,0.7)', marginTop:'8px'}}>
              Valid for this delivery only
            </div>
          </div>

          <div style={{background:'#E8F5E9', borderRadius:'12px', padding:'16px', marginBottom:'16px', textAlign:'left'}}>
            <div style={{fontWeight:700, color:'#2E7D32', marginBottom:'10px'}}>🚰 Driver Details</div>
            <div style={{fontSize:'15px', fontWeight:700, color:'#1a2a4a', marginBottom:'4px'}}>👤 {acceptedBid.profiles?.name}</div>
            <div style={{marginBottom:'6px'}}><StarRating rating={acceptedBid.profiles?.rating} /></div>
            <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'4px'}}>📍 {acceptedBid.profiles?.area || 'Bengaluru'}</div>
            {acceptedBid.profiles?.total_deliveries > 0 && (
              <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'8px'}}>
                ✅ {acceptedBid.profiles.total_deliveries} deliveries completed
              </div>
            )}
            <div style={{display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap'}}>
              {acceptedBid.delivery_time && (
                <span style={{background:'#E3F2FD', color:'#1565C0', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  ⏱️ {acceptedBid.delivery_time}
                </span>
              )}
              {acceptedBid.tank_capacity && (
                <span style={{background:'#E8F5E9', color:'#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  🚰 {acceptedBid.tank_capacity}L tank
                </span>
              )}
            </div>
            <a href={`tel:${acceptedBid.profiles?.phone}`} style={{
              display:'block', background:'#1565C0', color:'white', padding:'12px',
              borderRadius:'10px', textAlign:'center', fontWeight:700, fontSize:'15px',
              textDecoration:'none'
            }}>
              📞 Call Driver: {acceptedBid.profiles?.phone}
            </a>
          </div>

          <div style={{background:'#FFF3E0', borderRadius:'10px', padding:'12px', fontSize:'13px', color:'#E65100', textAlign:'left'}}>
            ⚠️ <strong>Important:</strong> Only share OTP when tanker arrives. Do not share before delivery.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => navigate('/customer')} style={{background:'#F0F4FF', border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:600, color:'#1565C0'}}>
          ← Back
        </button>
        <div className="topbar-logo">Bids</div>
        <div></div>
      </div>

      {request && (
        <div className="card" style={{marginBottom:'16px', background:'linear-gradient(135deg, #E3F2FD, #F0F4FF)'}}>
          <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
            <div style={{fontSize:'32px'}}>{request.tanker_type === 'water' ? '🚰' : '🚛'}</div>
            <div>
              <div style={{fontWeight:700, fontSize:'16px'}}>{request.tanker_type === 'water' ? 'Water' : 'Sewage'} Tanker</div>
              <div style={{color:'#5a6a85', fontSize:'14px'}}>{request.capacity} Litres</div>
              <div style={{color:'#5a6a85', fontSize:'13px'}}>📍 {request.location_text}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{fontWeight:700, fontSize:'16px', marginBottom:'12px', color:'#1a2a4a'}}>
        {bids.length === 0 ? '⏳ Waiting for bids...' : `${bids.length} Bid${bids.length > 1 ? 's' : ''} Received`}
      </div>

      {bids.length === 0 && (
        <div className="empty-state">
          <div className="icon">⏳</div>
          <p>Drivers are being notified.</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>Bids will appear here in real-time!</p>
        </div>
      )}

      {bids.map((bid, i) => {
        // Calculate distance from customer to driver
        const dist = getDistance(
          request?.location_lat, request?.location_lng,
          bid.profiles?.driver_lat, bid.profiles?.driver_lng
        )

        return (
          <div key={bid.id} className="card" style={{
            marginBottom:'14px',
            border: i===0 && bids.length > 1 ? '2px solid #2E7D32' : '1.5px solid #C5D5F0'
          }}>
            {i === 0 && bids.length > 1 && (
              <div style={{color:'#2E7D32', fontSize:'12px', fontWeight:700, marginBottom:'8px'}}>⭐ LOWEST BID</div>
            )}

            {/* Driver name + price */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px'}}>
              <div>
                <div style={{fontWeight:700, fontSize:'16px'}}>👤 {bid.profiles?.name}</div>
                {/* ⭐ Rating */}
                <div style={{marginBottom:'4px'}}>
                  <StarRating rating={bid.profiles?.rating} />
                  {bid.profiles?.total_deliveries > 0 && (
                    <span style={{fontSize:'12px', color:'#5a6a85', marginLeft:'6px'}}>
                      ({bid.profiles.total_deliveries} deliveries)
                    </span>
                  )}
                </div>
                {/* 📍 Area + Distance */}
                <div style={{fontSize:'13px', color:'#5a6a85'}}>
                  📍 {bid.profiles?.area || 'Bengaluru'}
                  {dist !== null && (
                    <span style={{
                      marginLeft:'8px', background:'#E3F2FD', color:'#1565C0',
                      padding:'2px 8px', borderRadius:'12px', fontSize:'12px', fontWeight:600
                    }}>
                      🗺️ {parseFloat(dist) < 0.5 ? 'Very close!' : `${dist} km away`}
                    </span>
                  )}
                </div>
              </div>
              <div style={{fontSize:'28px', fontWeight:800, color:'#1565C0', fontFamily:"'Baloo 2',cursive"}}>
                ₹{bid.price}
              </div>
            </div>

            {/* Delivery time and tank capacity */}
            <div style={{display:'flex', gap:'8px', marginBottom:'10px', flexWrap:'wrap', marginTop:'8px'}}>
              {bid.delivery_time && (
                <span style={{background:'#E3F2FD', color:'#1565C0', padding:'4px 12px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  ⏱️ {bid.delivery_time}
                </span>
              )}
              {bid.tank_capacity && (
                <span style={{background:'#E8F5E9', color:'#2E7D32', padding:'4px 12px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
                  🚰 {bid.tank_capacity}L tank
                </span>
              )}
            </div>

            {bid.note && (
              <div style={{background:'#F8F9FA', borderRadius:'8px', padding:'8px', fontSize:'13px', color:'#5a6a85', marginBottom:'10px'}}>
                📝 "{bid.note}"
              </div>
            )}

            <div style={{fontSize:'12px', color:'#5a6a85', marginBottom:'12px'}}>
              🕐 {new Date(bid.created_at).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
            </div>

            {bid.status === 'accepted' ? (
              <div style={{textAlign:'center', color:'#2E7D32', fontWeight:700, fontSize:'14px', padding:'10px', background:'#E8F5E9', borderRadius:'8px'}}>
                ✅ You accepted this bid
              </div>
            ) : bid.status === 'rejected' ? (
              <div style={{textAlign:'center', color:'#C62828', fontWeight:600, fontSize:'13px', padding:'8px', background:'#FFEBEE', borderRadius:'8px'}}>
                ❌ Not selected
              </div>
            ) : (
              <button
                className="btn-primary"
                style={{width:'100%'}}
                onClick={() => acceptBid(bid)}
                disabled={accepting === bid.id || request?.status === 'accepted'}
              >
                {accepting === bid.id ? '⏳ Accepting...' : '✅ Accept This Bid'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
