import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CustomerDashboard({ profile }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase
      .from('requests')
      .select('*, bids(count)')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const statusColor = { pending:'#F57F17', accepted:'#2E7D32', completed:'#283593', cancelled:'#C62828' }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="topbar-logo">Tanker<span>Wala</span></div>
          <div style={{fontSize:'13px', color:'#5a6a85'}}>Hello, {profile.name} 👋</div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      <button className="btn-primary" onClick={() => navigate('/customer/post')} style={{marginBottom:'24px'}}>
        + Post New Tanker Request
      </button>

      <div className="section-title">Your Requests</div>

      {loading && <div className="spinner"></div>}

      {!loading && requests.length === 0 && (
        <div className="empty-state">
          <div className="icon">💧</div>
          <p>No requests yet. Post your first tanker request!</p>
        </div>
      )}

      {requests.map(req => (
        <div key={req.id} className="card" style={{marginBottom:'14px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px'}}>
            <div>
              <span className={`badge badge-${req.type}`}>{req.type === 'water' ? '💧 Water' : '🚰 Sewage'}</span>
              <span style={{marginLeft:'8px', fontSize:'14px', color:'#5a6a85'}}>{req.capacity} litres</span>
            </div>
            <span style={{
              background: statusColor[req.status]+'20',
              color: statusColor[req.status],
              padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:600
            }}>{req.status?.toUpperCase()}</span>
          </div>

          <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'12px'}}>
            📍 {req.address || 'Location set'}<br/>
            🕒 {new Date(req.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
          </div>

          {req.status === 'pending' && (
            <button className="btn-outline" style={{width:'100%'}} onClick={() => navigate(`/customer/bids/${req.id}`)}>
              View Bids ({req.bids?.[0]?.count || 0})
            </button>
          )}

          {req.status === 'accepted' && req.driver_phone && (
            <div className="alert alert-success">
              ✅ Bid accepted! Call driver: <strong>{req.driver_phone}</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
