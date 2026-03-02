import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AdminDashboard({ profile }) {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState({})
  const [drivers, setDrivers] = useState([])
  const [recharges, setRecharges] = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [tab])

  async function fetchAll() {
    setLoading(true)
    const [{ data: allRequests }, { data: allDrivers }, { data: allRecharges }, { data: allCommissions }] = await Promise.all([
      supabase.from('requests').select('status'),
      supabase.from('profiles').select('*').eq('role', 'driver').order('created_at', { ascending: false }),
      supabase.from('recharge_requests').select('*, profiles(name,phone)').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*').order('created_at', { ascending: false })
    ])
    const total = allRequests?.length || 0
    const completed = allRequests?.filter(r => r.status === 'accepted' || r.status === 'completed').length || 0
    setStats({ total, completed, earnings: (allCommissions?.length || 0) * 10 })
    setDrivers(allDrivers || [])
    setRecharges(allRecharges || [])
    setCommissions(allCommissions || [])
    setLoading(false)
  }

  async function approveRecharge(recharge) {
    const { data: driver } = await supabase.from('profiles').select('wallet_balance').eq('id', recharge.driver_id).single()
    const newBalance = (driver.wallet_balance || 0) + recharge.amount
    await supabase.from('profiles').update({ wallet_balance: newBalance, is_active: true }).eq('id', recharge.driver_id)
    await supabase.from('recharge_requests').update({ status: 'approved' }).eq('id', recharge.id)
    alert(`✅ Wallet recharged! ${recharge.profiles?.name} now has ₹${newBalance}`)
    fetchAll()
  }

  async function toggleDriver(driver) {
    await supabase.from('profiles').update({ is_active: !driver.is_active }).eq('id', driver.id)
    fetchAll()
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
          <div style={{fontSize:'12px', color:'#5a6a85'}}>Admin Panel</div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'20px'}}>
        {[
          { label:'Total Orders', value: stats.total || 0, icon:'📦', color:'#1565C0' },
          { label:'Completed', value: stats.completed || 0, icon:'✅', color:'#2E7D32' },
          { label:'My Earnings', value: `₹${stats.earnings || 0}`, icon:'💰', color:'#E65100' },
        ].map(s => (
          <div key={s.label} className="card" style={{textAlign:'center', padding:'16px'}}>
            <div style={{fontSize:'24px'}}>{s.icon}</div>
            <div style={{fontSize:'20px', fontWeight:800, color:s.color, fontFamily:"'Baloo 2',cursive"}}>{s.value}</div>
            <div style={{fontSize:'11px', color:'#5a6a85'}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex', gap:'6px', marginBottom:'20px', overflowX:'auto'}}>
        {[['overview','📊 Overview'],['drivers','🚛 Drivers'],['recharges','💳 Recharges']].map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'10px 14px', borderRadius:'8px', fontWeight:600, fontSize:'13px', whiteSpace:'nowrap',
            background: tab===t ? '#1565C0' : '#F0F4FF',
            color: tab===t ? 'white' : '#5a6a85', border:'none'
          }}>{label}</button>
        ))}
      </div>

      {loading && <div className="spinner"></div>}

      {tab === 'drivers' && !loading && drivers.map(driver => (
        <div key={driver.id} className="card" style={{marginBottom:'12px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div style={{fontWeight:700}}>{driver.name}</div>
              <div style={{fontSize:'13px', color:'#5a6a85'}}>📱 {driver.phone}</div>
              <div style={{fontSize:'13px', color:'#5a6a85'}}>💰 Wallet: ₹{driver.wallet_balance || 0}</div>
            </div>
            <button onClick={() => toggleDriver(driver)} style={{
              padding:'8px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:600,
              background: driver.is_active ? '#FFEBEE' : '#E8F5E9',
              color: driver.is_active ? '#C62828' : '#2E7D32', border:'none'
            }}>
              {driver.is_active ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </div>
      ))}

      {tab === 'recharges' && !loading && (
        <>
          {recharges.filter(r => r.status === 'pending').length > 0 && (
            <div className="alert alert-info" style={{marginBottom:'16px'}}>
              {recharges.filter(r => r.status === 'pending').length} pending recharge requests
            </div>
          )}
          {recharges.map(r => (
            <div key={r.id} className="card" style={{marginBottom:'12px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{r.profiles?.name}</div>
                  <div style={{fontSize:'13px', color:'#5a6a85'}}>📱 {r.profiles?.phone}</div>
                  <div style={{fontSize:'16px', fontWeight:800, color:'#1565C0', fontFamily:"'Baloo 2',cursive"}}>₹{r.amount}</div>
                  <div style={{fontSize:'12px', color:'#5a6a85'}}>{new Date(r.created_at).toLocaleString('en-IN')}</div>
                </div>
                {r.status === 'pending' ? (
                  <button className="btn-green" onClick={() => approveRecharge(r)}>✅ Approve</button>
                ) : (
                  <span style={{color:'#2E7D32', fontWeight:600, fontSize:'13px'}}>✅ Done</span>
                )}
              </div>
            </div>
          ))}
          {recharges.length === 0 && <div className="empty-state"><div className="icon">💳</div><p>No recharge requests yet.</p></div>}
        </>
      )}

      {tab === 'overview' && !loading && (
        <div className="card">
          <div style={{fontWeight:700, marginBottom:'16px', fontSize:'16px'}}>Recent Commissions</div>
          {commissions.slice(0,10).map(c => (
            <div key={c.id} style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #F0F4FF'}}>
              <div style={{fontSize:'13px', color:'#5a6a85'}}>{new Date(c.created_at).toLocaleString('en-IN')}</div>
              <div style={{fontWeight:700, color:'#2E7D32'}}>+₹10</div>
            </div>
          ))}
          {commissions.length === 0 && <p style={{color:'#5a6a85', fontSize:'14px'}}>No commissions yet.</p>}
        </div>
      )}
    </div>
  )
}
