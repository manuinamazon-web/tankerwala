import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ViewBids({ profile }) {
  const [request, setRequest] = useState(null)
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(null)
  const { requestId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('bids-'+requestId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `request_id=eq.${requestId}` },
        () => fetchData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [requestId])

  async function fetchData() {
    const [{ data: req }, { data: bidData }] = await Promise.all([
      supabase.from('requests').select('*').eq('id', requestId).single(),
      supabase.from('bids').select('*, profiles(name, phone, rating)').eq('request_id', requestId).order('price', { ascending: true })
    ])
    setRequest(req)
    setBids(bidData || [])
    setLoading(false)
  }

  async function acceptBid(bid) {
    setAccepting(bid.id)
    const { data: driver } = await supabase.from('profiles').select('wallet_balance').eq('id', bid.driver_id).single()
    if (driver.wallet_balance < 10) {
      alert('Driver has insufficient wallet balance. Please choose another driver.')
      setAccepting(null)
      return
    }
    await supabase.from('profiles').update({ wallet_balance: driver.wallet_balance - 10 }).eq('id', bid.driver_id)
    await supabase.from('commissions').insert({ driver_id: bid.driver_id, request_id: requestId, amount: 10 })
    await supabase.from('requests').update({
      status: 'accepted',
      driver_id: bid.driver_id,
      driver_phone: bid.profiles.phone,
      accepted_price: bid.price
    }).eq('id', requestId)
    await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id)
    alert(`✅ Bid accepted! Driver ${bid.profiles.name} will contact you at ${bid.profiles.phone}`)
    navigate('/customer')
  }

  if (loading) return <div className="spinner" style={{marginTop:'40vh'}}></div>

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
            <div style={{fontSize:'32px'}}>{request.type === 'water' ? '💧' : '🚰'}</div>
            <div>
              <div style={{fontWeight:700, fontSize:'16px'}}>{request.type === 'water' ? 'Water' : 'Sewage'} Tanker</div>
              <div style={{color:'#5a6a85', fontSize:'14px'}}>{request.capacity} Litres</div>
              <div style={{color:'#5a6a85', fontSize:'13px'}}>📍 {request.address}</div>
            </div>
          </div>
        </div>
      )}

      <div className="section-title">
        {bids.length === 0 ? 'Waiting for bids...' : `${bids.length} Bid${bids.length > 1 ? 's' : ''} Received`}
      </div>

      {bids.length === 0 && (
        <div className="empty-state">
          <div className="icon">⏳</div>
          <p>Drivers are being notified. Bids will appear here in real-time.</p>
        </div>
      )}

      {bids.map((bid, i) => (
        <div key={bid.id} className="card" style={{marginBottom:'14px', border: i===0 ? '2px solid #2E7D32' : '1px solid #C5D5F0'}}>
          {i === 0 && <div style={{color:'#2E7D32', fontSize:'12px', fontWeight:700, marginBottom:'8px'}}>⭐ LOWEST BID</div>}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
            <div>
              <div style={{fontWeight:700, fontSize:'16px'}}>{bid.profiles?.name}</div>
              <div style={{color:'#5a6a85', fontSize:'13px'}}>⭐ {bid.profiles?.rating || 'New'}</div>
            </div>
            <div style={{fontSize:'24px', fontWeight:800, color:'#1565C0', fontFamily:"'Baloo 2',cursive"}}>
              ₹{bid.price}
            </div>
          </div>
          {bid.note && <div style={{color:'#5a6a85', fontSize:'13px', marginBottom:'12px'}}>"{bid.note}"</div>}
          <button className="btn-green" style={{width:'100%'}} onClick={() => acceptBid(bid)} disabled={accepting === bid.id}>
            {accepting === bid.id ? 'Accepting...' : '✅ Accept This Bid'}
          </button>
        </div>
      ))}
    </div>
  )
}
