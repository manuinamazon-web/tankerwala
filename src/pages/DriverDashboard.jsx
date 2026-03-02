import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DriverDashboard({ profile, setProfile }) {
  const [requests, setRequests] = useState([])
  const [myBids, setMyBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('requests')
  const [bidForm, setBidForm] = useState({})
  const [submitting, setSubmitting] = useState(null)
  const [rechargeAmount, setRechargeAmount] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('requests-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, () => fetchData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchData() {
    const [{ data: reqs }, { data: bids }] = await Promise.all([
      supabase.from('requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('bids').select('*, requests(type, capacity, address, status, accepted_price, customer_phone)').eq('driver_id', profile.id).order('created_at', { ascending: false })
    ])
    setRequests(reqs || [])
    setMyBids(bids || [])
    setLoading(false)
  }

  async function submitBid(requestId) {
    const price = bidForm[requestId]
    if (!price || isNaN(price) || price < 1) { alert('Please enter a valid price'); return }
    if (profile.wallet_balance < 10) { alert('Insufficient wallet balance. Please recharge ₹100 to continue bidding.'); return }
    if (!profile.is_active) { alert('Your account is not active yet. Please recharge your wallet first.'); return }
    setSubmitting(requestId)
    const { error } = await supabase.from('bids').insert({
      request_id: requestId,
      driver_id: profile.id,
      price: parseInt(price),
      note: bidForm[requestId + '_note'] || ''
    })
    if (error) alert('Error submitting bid: ' + error.message)
    else { setBidForm(f => ({...f, [requestId]: ''})); fetchData(); alert('✅ Bid submitted successfully!') }
    setSubmitting(null)
  }

  async function rechargeWallet() {
    const amount = parseInt(rechargeAmount)
    if (!amount || amount < 100) { alert('Minimum recharge is ₹100'); return }
    const { error } = await supabase.from('recharge_requests').insert({
      driver_id: profile.id,
      driver_name: profile.name,
      driver_phone: profile.phone,
      amount
    })
    if (error) alert(error.message)
    else alert(`Recharge request of ₹${amount} sent! Send ₹${amount} via UPI to the admin and your wallet will be credited within 30 minutes.`)
    setRechargeAmount('')
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="topbar-logo">Tanker<span>Wala</span></div>
          <div style={{fontSize:'13px', color:'#5a6a85'}}>{profile.name} 🚛</div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      <div style={{background:'linear-gradient(135deg, #0D47A1, #1976D2)', borderRadius:'16px', padding:'20px', marginBottom:'20px', color:'white'}}>
        <div style={{fontSize:'13px', opacity:0.8, marginBottom:'4px'}}>Wallet Balance</div>
        <div style={{fontSize:'36px', fontWeight:800, fontFamily:"'Baloo 2',cursive"}}>₹{profile.wallet_balance || 0}</div>
        <div style={{fontSize:'12px', opacity:0.7, marginBottom:'16px'}}>₹10 deducted per accepted bid</div>
        {!profile.is_active && (
          <div style={{background:'rgba(255,152,0,0.3)', border:'1px solid rgba(255,152,0,0.5)', borderRadius:'10px', padding:'10px', marginBottom:'12px', fontSize:'13px'}}>
            ⚠️ Account inactive. Recharge ₹100 to start bidding.
          </div>
        )}
        <div style={{display:'flex', gap:'8px'}}>
          <input
            placeholder="Amount (min ₹100)"
            value={rechargeAmount}
            onChange={e=>setRechargeAmount(e.target.value)}
            type="number"
            style={{flex:1, padding:'10px 12px', borderRadius:'8px', border:'none', fontSize:'14px'}}
          />
          <button onClick={rechargeWallet} style={{background:'#FFA000', color:'white', padding:'10px 16px', borderRadius:'8px', fontWeight:700, fontSize:'14px', whiteSpace:'nowrap'}}>
            Recharge
          </button>
        </div>
      </div>

      <div style={{display:'flex', gap:'8px', marginBottom:'20px'}}>
        {['requests','mybids'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'12px', borderRadius:'10px', fontWeight:600, fontSize:'14px',
            background: tab===t ? '#1565C0' : '#F0F4FF',
            color: tab===t ? 'white' : '#5a6a85', border:'none'
          }}>
            {t === 'requests' ? `🔔 Open Requests (${requests.length})` : `📋 My Bids (${myBids.length})`}
          </button>
        ))}
      </div>

      {loading && <div className="spinner"></div>}

      {tab === 'requests' && !loading && (
        <>
          {requests.length === 0 && (
            <div className="empty-state"><div className="icon">🔔</div><p>No open requests right now.</p></div>
          )}
          {requests.map(req => (
            <div key={req.id} className="card" style={{marginBottom:'14px'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                <span className={`badge badge-${req.type}`}>{req.type === 'water' ? '💧 Water' : '🚰 Sewage'}</span>
                <span style={{fontWeight:700, color:'#1565C0'}}>{req.capacity}L</span>
              </div>
              <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'14px'}}>
                📍 {req.address}<br/>👤 {req.customer_name}<br/>
                🕒 {new Date(req.created_at).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}
              </div>
              {req.notes && <div style={{fontSize:'13px', color:'#5a6a85', fontStyle:'italic', marginBottom:'12px'}}>"{req.notes}"</div>}
              <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
                <input placeholder="Your price (₹)" type="number" value={bidForm[req.id] || ''} onChange={e => setBidForm(f => ({...f, [req.id]: e.target.value}))} style={{flex:1}} />
              </div>
              <input placeholder="Optional note" value={bidForm[req.id+'_note'] || ''} onChange={e => setBidForm(f => ({...f, [req.id+'_note']: e.target.value}))} style={{marginBottom:'10px'}} />
              <button className="btn-primary" onClick={() => submitBid(req.id)} disabled={submitting === req.id || !profile.is_active || profile.wallet_balance < 10}>
                {submitting === req.id ? 'Submitting...' : '💰 Submit Bid (₹10 on acceptance)'}
              </button>
            </div>
          ))}
        </>
      )}

      {tab === 'mybids' && !loading && (
        <>
          {myBids.length === 0 && (
            <div className="empty-state"><div className="icon">📋</div><p>No bids yet.</p></div>
          )}
          {myBids.map(bid => (
            <div key={bid.id} className="card" style={{marginBottom:'14px'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                <span className={`badge badge-${bid.requests?.type}`}>{bid.requests?.type === 'water' ? '💧 Water' : '🚰 Sewage'} — {bid.requests?.capacity}L</span>
                <span style={{fontWeight:800, fontSize:'18px', color:'#1565C0', fontFamily:"'Baloo 2',cursive"}}>₹{bid.price}</span>
              </div>
              <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'8px'}}>📍 {bid.requests?.address}</div>
              <div style={{display:'inline-block', padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600, background: bid.status === 'accepted' ? '#E8F5E9' : '#FFF9C4', color: bid.status === 'accepted' ? '#2E7D32' : '#F57F17'}}>
                {bid.status === 'accepted' ? '✅ ACCEPTED' : '⏳ PENDING'}
              </div>
              {bid.status === 'accepted' && (
                <div className="alert alert-success" style={{marginTop:'10px'}}>
                  Job confirmed! Customer: <strong>{bid.requests?.customer_phone}</strong>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
