import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

export default function ViewBids({ profile }) {
  const { requestId } = useParams()
  const [bids, setBids] = useState([])
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('bids-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `request_id=eq.${requestId}` }, () => {
        playSound(660, 0.4, 2)
        fetchData()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [requestId])

  async function fetchData() {
    const [{ data: req }, { data: bidsData }] = await Promise.all([
      supabase.from('requests').select('*').eq('id', requestId).single(),
      supabase.from('bids').select('*').eq('request_id', requestId).order('price', { ascending: true })
    ])
    setRequest(req)
    setBids(bidsData || [])
    setLoading(false)
  }

  async function acceptBid(bid) {
    if (!window.confirm(`Accept bid from ${bid.driver_name} for ₹${bid.price}?`)) return

    await supabase.from('requests').update({
      status: 'accepted',
      accepted_price: bid.price,
      driver_phone: bid.driver_phone
    }).eq('id', requestId)

    await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id)
    await supabase.from('bids').update({ status: 'rejected' }).eq('request_id', requestId).neq('id', bid.id)

    const { data: driver } = await supabase.from('profiles').select('wallet_balance').eq('id', bid.driver_id).single()
    const newBalance = (driver.wallet_balance || 0) - 10
    await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', bid.driver_id)

    await supabase.from('commissions').insert({ request_id: requestId, driver_id: bid.driver_id, amount: 10 })

    alert(`✅ Bid accepted! Driver will contact you at your registered number.`)
    fetchData()
  }

  if (loading) return <div className="spinner" style={{marginTop:'40vh'}}></div>

  const lowestBid = bids.length > 0 ? Math.min(...bids.map(b => b.price)) : null

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => navigate('/customer')} style={{background:'none', border:'none', fontSize:'20px', cursor:'pointer'}}>←</button>
        <div style={{fontWeight:700, color:'#1565C0', fontSize:'16px'}}>Bids Received</div>
        <div></div>
      </div>

      {request && (
        <div className="card" style={{marginBottom:'16px', background:'#F0F4FF'}}>
          <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px'}}>
            <span style={{background: request.tanker_type==='water' ? '#E3F2FD' : '#E8F5E9', color: request.tanker_type==='water' ? '#1565C0' : '#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'13px', fontWeight:600}}>
              {request.tanker_type === 'water' ? '💧 Water' : '🚽 Sewage'}
            </span>
            <span style={{fontWeight:700}}>{request.capacity} litres</span>
            <span style={{
              marginLeft:'auto', padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
              background: request.status==='accepted' ? '#E8F5E9' : '#FFF3E0',
              color: request.status==='accepted' ? '#2E7D32' : '#E65100'
            }}>{request.status?.toUpperCase()}</span>
          </div>
          {request.location_text && <div style={{fontSize:'13px', color:'#5a6a85'}}>📍 {request.location_text}</div>}
          {request.status === 'accepted' && request.driver_phone && (
            <div style={{background:'#E8F5E9', borderRadius:'8px', padding:'12px', marginTop:'8px'}}>
              <div style={{fontWeight:700, color:'#2E7D32', fontSize:'15px'}}>✅ Bid Accepted!</div>
              <div style={{fontSize:'14px', marginTop:'4px'}}>Call driver: <strong>{request.driver_phone}</strong></div>
            </div>
          )}
        </div>
      )}

      {bids.length === 0 && (
        <div className="empty-state">
          <div className="icon">⏳</div>
          <p>Waiting for drivers to bid...</p>
          <p style={{fontSize:'13px', color:'#5a6a85'}}>You'll hear a sound when bids arrive!</p>
        </div>
      )}

      {bids.length > 0 && request?.status !== 'accepted' && (
        <div className="alert alert-info" style={{marginBottom:'16px'}}>
          🏆 Lowest bid: <strong>₹{lowestBid}</strong> — Accept the best offer!
        </div>
      )}

      {bids.map(bid => (
        <div key={bid.id} className="card" style={{
          marginBottom:'12px',
          border: bid.price === lowestBid && request?.status !== 'accepted' ? '2px solid #1565C0' : '1px solid #E8EEF8'
        }}>
          {bid.price === lowestBid && request?.status !== 'accepted' && (
            <div style={{background:'#1565C0', color:'white', borderRadius:'6px', padding:'4px 10px', fontSize:'12px', fontWeight:600, marginBottom:'8px', display:'inline-block'}}>
              🏆 Lowest Bid
            </div>
          )}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:700, fontSize:'16px'}}>{bid.driver_name}</div>
              {bid.status === 'accepted' && (
                <div style={{fontSize:'13px', color:'#2E7D32'}}>📱 {bid.driver_phone}</div>
              )}
              {bid.note && <div style={{fontSize:'13px', color:'#5a6a85', marginTop:'4px'}}>📝 {bid.note}</div>}
              <div style={{fontSize:'12px', color:'#5a6a85', marginTop:'4px'}}>
                {new Date(bid.created_at).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:"'Baloo 2',cursive", fontSize:'24px', fontWeight:800, color:'#1565C0'}}>₹{bid.price}</div>
              {bid.status === 'accepted' && (
                <span style={{background:'#E8F5E9', color:'#2E7D32', padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>✅ ACCEPTED</span>
              )}
              {bid.status === 'rejected' && (
                <span style={{background:'#FFEBEE', color:'#C62828', padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600}}>REJECTED</span>
              )}
            </div>
          </div>
          {request?.status === 'pending' && (
            <button className="btn-primary" style={{marginTop:'12px'}} onClick={() => acceptBid(bid)}>
              ✅ Accept This Bid
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
