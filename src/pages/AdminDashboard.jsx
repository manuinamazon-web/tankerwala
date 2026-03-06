import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

let audioCtx = null
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function playAlert(freq, vol, repeat) {
  try {
    const ctx = getAudioContext()
    for (let i = 0; i < repeat; i++) {
      setTimeout(() => {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.frequency.value = freq
        g.gain.value = vol
        o.type = 'sine'
        o.start(); o.stop(ctx.currentTime + 0.3)
      }, i * 400)
    }
  } catch(e) {}
}

export default function AdminDashboard({ profile }) {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState({})
  const [drivers, setDrivers] = useState([])
  const [customers, setCustomers] = useState([])
  const [recharges, setRecharges] = useState([])
  const [commissions, setCommissions] = useState([])
  const [requests, setRequests] = useState([])
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const navigate = useNavigate()
  const audioUnlocked = useRef(false)

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 5000)
  }

  useEffect(() => {
    // Unlock audio on first interaction
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
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })

    fetchAll()

    // ✅ Realtime channel
    const channel = supabase.channel('admin-live-v2', {
      config: { broadcast: { self: true } }
    })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recharge_requests' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          showNotification('💳 New recharge request! Tap to approve.')
          playAlert(880, 0.4, 3)
        }
        fetchAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          showNotification('📦 New customer request!')
          playAlert(660, 0.3, 2)
        }
        fetchAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, () => {
        fetchAll()
      })
      .subscribe((status) => {
        console.log('Admin realtime status:', status)
      })

    // ✅ Backup polling every 15 seconds
    const pollInterval = setInterval(() => {
      fetchAll()
    }, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  useEffect(() => { fetchAll() }, [tab])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: allRequests },
      { data: allDrivers },
      { data: allCustomers },
      { data: allRecharges },
      { data: allCommissions },
      { data: allBids }
    ] = await Promise.all([
      supabase.from('requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'driver').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'customer').order('created_at', { ascending: false }),
      supabase.from('recharge_requests').select('*, profiles(name,phone)').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*').order('created_at', { ascending: false }),
      supabase.from('bids').select('*').eq('status', 'completed')
    ])
    const total = allRequests?.length || 0
    const completed = allRequests?.filter(r => r.status === 'completed' || r.status === 'accepted').length || 0
    setStats({ total, completed, earnings: (allCommissions?.length || 0) * 10 })
    setDrivers(allDrivers || [])
    setCustomers(allCustomers || [])
    setRecharges(allRecharges || [])
    setCommissions(allCommissions || [])
    setRequests(allRequests || [])
    setBids(allBids || [])
    setLoading(false)
  }

  async function approveRecharge(recharge) {
    const { data: driver } = await supabase.from('profiles').select('wallet_balance').eq('id', recharge.driver_id).single()
    const newBalance = (driver.wallet_balance || 0) + recharge.amount
    await supabase.from('profiles').update({ wallet_balance: newBalance, is_active: true }).eq('id', recharge.driver_id)
    await supabase.from('recharge_requests').update({ status: 'approved' }).eq('id', recharge.id)
    showNotification(`✅ ₹${recharge.amount} recharged for ${recharge.profiles?.name}!`)
    fetchAll()
  }

  async function toggleDriver(driver) {
    await supabase.from('profiles').update({ is_active: !driver.is_active }).eq('id', driver.id)
    showNotification(driver.is_active ? `🔴 ${driver.name} suspended` : `🟢 ${driver.name} activated`)
    fetchAll()
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  // ── WhatsApp alert to a specific driver ──────────────────────────────────
  function alertDriverOnWhatsApp(driver, areaName, pendingCount) {
    const message =
      `🚛 *TankerWala Demand Alert!*\n\n` +
      `Hello ${driver.name}! 👋\n\n` +
      `📍 *${areaName}* area has *${pendingCount} customers* waiting for water tanker right now.\n\n` +
      `Please go online on TankerWala app to receive these requests!\n\n` +
      `🌐 tankerwala.vercel.app\n\n` +
      `_- TankerWala Admin_`
    const clean = driver.phone.replace(/\D/g, '').replace(/^(0|91)/, '')
    window.open(`https://wa.me/91${clean}?text=${encodeURIComponent(message)}`, '_blank')
  }

  // Alert ALL offline drivers about high demand area
  function alertAllDriversWhatsApp(areaName, pendingCount) {
    const offlineDrivers = drivers.filter(d => !d.is_online && d.is_active)
    if (offlineDrivers.length === 0) {
      alert('No offline drivers to alert!')
      return
    }
    // Open WhatsApp for first driver — admin can repeat for others
    alertDriverOnWhatsApp(offlineDrivers[0], areaName, pendingCount)
    if (offlineDrivers.length > 1) {
      showNotification(`Opened WhatsApp for ${offlineDrivers[0].name}. Tap again for more drivers.`)
    }
  }

  // ── Analytics calculations ────────────────────────────────────────────────

  // Area demand
  const areaDemand = requests.reduce((acc, req) => {
    const area = req.location_text || 'Unknown'
    if (!acc[area]) acc[area] = { area, total: 0, water: 0, sewage: 0, completed: 0, pending: 0 }
    acc[area].total++
    if (req.tanker_type === 'water') acc[area].water++
    if (req.tanker_type === 'sewage') acc[area].sewage++
    if (req.status === 'completed' || req.status === 'accepted') acc[area].completed++
    if (req.status === 'pending') acc[area].pending++
    return acc
  }, {})
  const areaDemandList = Object.values(areaDemand).sort((a, b) => b.total - a.total)

  // Drivers per area
  const driversPerArea = drivers.reduce((acc, d) => {
    const area = d.area || 'Unknown'
    if (!acc[area]) acc[area] = { total: 0, online: 0 }
    acc[area].total++
    if (d.is_online) acc[area].online++
    return acc
  }, {})

  // Demand vs driver gap
  const demandGaps = areaDemandList.map(area => {
    const driverInfo = driversPerArea[area.area] || { total: 0, online: 0 }
    const gap = area.pending - driverInfo.online
    return { ...area, driversTotal: driverInfo.total, driversOnline: driverInfo.online, gap }
  }).sort((a, b) => b.gap - a.gap)

  // Driver performance
  const driverPerformance = drivers.map(driver => {
    const driverBids = bids.filter(b => b.driver_id === driver.id)
    const driverRequests = requests.filter(r => r.driver_id === driver.id && (r.status === 'completed' || r.status === 'accepted'))
    return { ...driver, completedDeliveries: driverRequests.length, totalBids: driverBids.length }
  }).sort((a, b) => b.completedDeliveries - a.completedDeliveries)

  // Pending requests
  const pendingRequests = requests.filter(r => r.status === 'pending')

  // Daily sales
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    return d.toISOString().split('T')[0]
  }).reverse()

  const dailySales = last7Days.map(date => {
    const dayReqs = requests.filter(r => r.created_at?.startsWith(date))
    const completed = dayReqs.filter(r => r.status === 'completed' || r.status === 'accepted')
    return {
      date, label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      total: dayReqs.length, completed: completed.length, earnings: completed.length * 10
    }
  })
  const maxDailyTotal = Math.max(...dailySales.map(d => d.total), 1)

  // Tanker type split
  const waterReqs = requests.filter(r => r.tanker_type === 'water').length
  const sewageReqs = requests.filter(r => r.tanker_type === 'sewage').length
  const totalReqs = requests.length || 1

  const pendingRecharges = recharges.filter(r => r.status === 'pending')

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="topbar-logo">Tanker<span>Wala</span></div>
          <div style={{ fontSize: '12px', color: '#5a6a85' }}>Admin Panel</div>
        </div>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </div>

      {notification && (
        <div style={{
          background: notification.includes('✅') ? '#2E7D32' : notification.includes('📦') ? '#1565C0' : '#FF6F00',
          color: 'white', padding: '12px 16px', borderRadius: '10px', marginBottom: '12px',
          fontWeight: 600, fontSize: '13px', textAlign: 'center'
        }}>{notification}</div>
      )}

      {pendingRecharges.length > 0 && (
        <div onClick={() => setTab('recharges')} style={{
          background: '#FF6F00', color: 'white', borderRadius: '12px',
          padding: '14px 16px', marginBottom: '12px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>💳 {pendingRecharges.length} pending recharge{pendingRecharges.length > 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 700 }}>Tap to approve →</span>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div onClick={() => setTab('pending')} style={{
          background: '#C62828', color: 'white', borderRadius: '12px',
          padding: '14px 16px', marginBottom: '12px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>📦 {pendingRequests.length} unserved customer request{pendingRequests.length > 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 700 }}>View →</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Total Orders', value: stats.total || 0, icon: '📦', color: '#1565C0' },
          { label: 'Completed', value: stats.completed || 0, icon: '✅', color: '#2E7D32' },
          { label: 'My Earnings', value: `₹${stats.earnings || 0}`, icon: '💰', color: '#E65100' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '24px' }}>{s.icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: s.color, fontFamily: "'Baloo 2',cursive" }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#5a6a85' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto' }}>
        {[
          ['overview', '📊 Overview'],
          ['demand', '🗺️ Demand'],
          ['pending', '📦 Pending'],
          ['performance', '🏆 Drivers'],
          ['customers', '👥 Customers'],
          ['recharges', '💳 Recharges'],
        ].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '12px',
            whiteSpace: 'nowrap', position: 'relative',
            background: tab === t ? '#1565C0' : '#F0F4FF',
            color: tab === t ? 'white' : '#5a6a85', border: 'none'
          }}>
            {label}
            {t === 'recharges' && pendingRecharges.length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#C62828', color: 'white', borderRadius: '50%',
                width: '18px', height: '18px', fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{pendingRecharges.length}</span>
            )}
            {t === 'pending' && pendingRequests.length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#C62828', color: 'white', borderRadius: '50%',
                width: '18px', height: '18px', fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{pendingRequests.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="spinner"></div>}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && !loading && (
        <>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>📅 Last 7 Days Orders</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px' }}>
              {dailySales.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#1565C0', fontWeight: 700 }}>{d.total}</div>
                  <div style={{
                    width: '100%', borderRadius: '4px 4px 0 0',
                    background: 'linear-gradient(135deg, #1565C0, #42A5F5)',
                    height: `${Math.max((d.total / maxDailyTotal) * 70, 4)}px`
                  }} />
                  <div style={{ fontSize: '9px', color: '#5a6a85', textAlign: 'center' }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '12px' }}>🚛 Tanker Type Split</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, background: '#E3F2FD', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#1565C0', fontFamily: "'Baloo 2',cursive" }}>{waterReqs}</div>
                <div style={{ fontSize: '12px', color: '#1565C0', fontWeight: 600 }}>💧 Water</div>
                <div style={{ fontSize: '11px', color: '#5a6a85' }}>{Math.round((waterReqs / totalReqs) * 100)}%</div>
              </div>
              <div style={{ flex: 1, background: '#E8F5E9', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2E7D32', fontFamily: "'Baloo 2',cursive" }}>{sewageReqs}</div>
                <div style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600 }}>🚽 Sewage</div>
                <div style={{ fontSize: '11px', color: '#5a6a85' }}>{Math.round((sewageReqs / totalReqs) * 100)}%</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Today', value: dailySales[6]?.total || 0, earn: dailySales[6]?.earnings || 0 },
              { label: 'This Week', value: dailySales.reduce((s, d) => s + d.total, 0), earn: dailySales.reduce((s, d) => s + d.earnings, 0) },
              { label: 'Total Drivers', value: drivers.length, earn: null, sub: `${drivers.filter(d => d.is_online).length} online now` },
              { label: 'Total Customers', value: customers.length, earn: null, sub: 'registered' },
            ].map(s => (
              <div key={s.label} style={{ background: '#F0F4FF', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#5a6a85', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#1565C0', fontFamily: "'Baloo 2',cursive" }}>{s.value}</div>
                {s.earn !== null && <div style={{ fontSize: '12px', color: '#2E7D32', fontWeight: 600 }}>₹{s.earn} earned</div>}
                {s.sub && <div style={{ fontSize: '12px', color: '#5a6a85' }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: '16px', fontSize: '15px' }}>💰 Recent Earnings</div>
            {commissions.slice(0, 10).map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F4FF' }}>
                <div style={{ fontSize: '13px', color: '#5a6a85' }}>{new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div style={{ fontWeight: 700, color: '#2E7D32' }}>+₹10</div>
              </div>
            ))}
            {commissions.length === 0 && <p style={{ color: '#5a6a85', fontSize: '14px' }}>No commissions yet.</p>}
          </div>
        </>
      )}

      {/* ── DEMAND & GAP ANALYSIS ─────────────────────────────────────────── */}
      {tab === 'demand' && !loading && (
        <>
          {/* Demand vs Driver gap */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>⚠️ Demand vs Driver Gap</div>
            <div style={{ fontSize: '12px', color: '#5a6a85', marginBottom: '16px' }}>Areas with high demand but low driver coverage</div>
            {demandGaps.filter(a => a.pending > 0).length === 0 && (
              <div style={{ textAlign: 'center', color: '#2E7D32', fontWeight: 600, padding: '20px' }}>
                ✅ All areas are well covered!
              </div>
            )}
            {demandGaps.filter(a => a.pending > 0).map(area => (
              <div key={area.area} style={{
                background: area.gap > 2 ? '#FFEBEE' : area.gap > 0 ? '#FFF3E0' : '#E8F5E9',
                borderRadius: '10px', padding: '12px 14px', marginBottom: '10px',
                border: `1.5px solid ${area.gap > 2 ? '#FFCDD2' : area.gap > 0 ? '#FFE0B2' : '#A5D6A7'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {area.gap > 2 ? '🔴' : area.gap > 0 ? '🟡' : '🟢'} {area.area}
                    </div>
                    <div style={{ fontSize: '12px', color: '#5a6a85', marginTop: '2px' }}>
                      📦 {area.pending} waiting • 🚛 {area.driversOnline} drivers online
                    </div>
                  </div>
                  {area.gap > 0 && (
                    <span style={{
                      background: '#C62828', color: 'white', padding: '4px 10px',
                      borderRadius: '20px', fontSize: '12px', fontWeight: 700
                    }}>
                      -{area.gap} drivers needed
                    </span>
                  )}
                </div>
                {area.gap > 0 && (
                  <button onClick={() => alertAllDriversWhatsApp(area.area, area.pending)} style={{
                    width: '100%', padding: '10px', background: '#25D366', color: 'white',
                    border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                    💬 Alert Offline Drivers on WhatsApp
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Full area demand list */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>🗺️ All Area Demand Ranking</div>
            {areaDemandList.length === 0 && <p style={{ color: '#5a6a85' }}>No data yet.</p>}
            {areaDemandList.map((area, idx) => (
              <div key={area.area} style={{
                background: idx === 0 ? '#E3F2FD' : idx === 1 ? '#E8F5E9' : '#F0F4FF',
                borderRadius: '10px', padding: '12px 14px', marginBottom: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {area.area}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#1565C0', fontFamily: "'Baloo 2',cursive" }}>{area.total} orders</div>
                </div>
                <div style={{ background: '#E0E0E0', borderRadius: '4px', height: '6px', marginBottom: '6px' }}>
                  <div style={{
                    background: 'linear-gradient(90deg, #1565C0, #42A5F5)',
                    borderRadius: '4px', height: '6px',
                    width: `${(area.total / (areaDemandList[0]?.total || 1)) * 100}%`
                  }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#1565C0', fontWeight: 600 }}>💧 Water: {area.water}</span>
                  <span style={{ color: '#2E7D32', fontWeight: 600 }}>🚽 Sewage: {area.sewage}</span>
                  <span style={{ color: '#E65100', fontWeight: 600 }}>⏳ Pending: {area.pending}</span>
                  <span style={{ color: '#2E7D32', fontWeight: 600 }}>✅ Done: {area.completed}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PENDING REQUESTS ─────────────────────────────────────────────── */}
      {tab === 'pending' && !loading && (
        <>
          <div style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '12px' }}>
            {pendingRequests.length} unserved requests waiting for drivers
          </div>
          {pendingRequests.length === 0 && (
            <div className="empty-state">
              <div className="icon">✅</div>
              <p>All requests are being served!</p>
            </div>
          )}
          {pendingRequests.map(req => {
            const waitMins = Math.floor((Date.now() - new Date(req.created_at)) / 60000)
            const waitText = waitMins < 60 ? `${waitMins} min ago` : `${Math.floor(waitMins / 60)}h ago`
            return (
              <div key={req.id} className="card" style={{ marginBottom: '12px', borderLeft: `4px solid ${waitMins > 30 ? '#C62828' : '#FF6F00'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {req.tanker_type === 'water' ? '💧 Water Tanker' : '🚽 Sewage Tanker'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#5a6a85' }}>👤 {req.customer_name || 'Customer'}</div>
                    <div style={{ fontSize: '13px', color: '#333', fontWeight: 600 }}>📍 {req.location_text}</div>
                    <div style={{ fontSize: '12px', color: '#5a6a85' }}>{req.capacity}L</div>
                  </div>
                  <span style={{
                    background: waitMins > 30 ? '#FFEBEE' : '#FFF3E0',
                    color: waitMins > 30 ? '#C62828' : '#E65100',
                    padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700
                  }}>⏱ {waitText}</span>
                </div>
                {req.customer_phone && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={`tel:${req.customer_phone}`} style={{
                      flex: 1, background: '#1565C0', color: 'white', padding: '8px',
                      borderRadius: '8px', textAlign: 'center', fontWeight: 700,
                      fontSize: '13px', textDecoration: 'none'
                    }}>📞 Call Customer</a>
                    <button onClick={() => alertAllDriversWhatsApp(req.location_text, 1)} style={{
                      flex: 1, background: '#25D366', color: 'white', padding: '8px',
                      borderRadius: '8px', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer'
                    }}>💬 Alert Driver</button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── DRIVER PERFORMANCE ───────────────────────────────────────────── */}
      {tab === 'performance' && !loading && (
        <>
          <div style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '12px' }}>
            {drivers.length} drivers • {drivers.filter(d => d.is_online).length} online now
          </div>
          {driverPerformance.map((driver, idx) => (
            <div key={driver.id} className="card" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px' }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}</span>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{driver.name}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#5a6a85' }}>📱 {driver.phone}</div>
                  <div style={{ fontSize: '13px', color: '#5a6a85' }}>📍 {driver.area} • {driver.tanker_type === 'water' ? '💧 Water' : '🚽 Sewage'}</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{ background: '#E3F2FD', color: '#1565C0', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                      ✅ {driver.completedDeliveries} deliveries
                    </span>
                    <span style={{ background: driver.wallet_balance >= 10 ? '#E8F5E9' : '#FFEBEE', color: driver.wallet_balance >= 10 ? '#2E7D32' : '#C62828', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                      💰 ₹{driver.wallet_balance || 0}
                    </span>
                    <span style={{ background: driver.is_online ? '#E8F5E9' : '#F0F4FF', color: driver.is_online ? '#2E7D32' : '#5a6a85', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                      {driver.is_online ? '🟢 Online' : '🔴 Offline'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                  <button onClick={() => toggleDriver(driver)} style={{
                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                    background: driver.is_active ? '#FFEBEE' : '#E8F5E9',
                    color: driver.is_active ? '#C62828' : '#2E7D32', border: 'none', cursor: 'pointer'
                  }}>{driver.is_active ? 'Suspend' : 'Activate'}</button>
                  {!driver.is_online && (
                    <button onClick={() => alertDriverOnWhatsApp(driver, driver.area, areaDemand[driver.area]?.pending || 0)} style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                      background: '#25D366', color: 'white', border: 'none', cursor: 'pointer'
                    }}>💬 Alert</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {drivers.length === 0 && <div className="empty-state"><div className="icon">🚛</div><p>No drivers yet.</p></div>}
        </>
      )}

      {/* ── CUSTOMERS ────────────────────────────────────────────────────── */}
      {tab === 'customers' && !loading && (
        <>
          <div style={{ fontSize: '13px', color: '#5a6a85', marginBottom: '12px' }}>
            {customers.length} registered customers
          </div>
          {customers.map(customer => {
            const custRequests = requests.filter(r => r.customer_id === customer.id || r.customer_phone === customer.phone)
            return (
              <div key={customer.id} className="card" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{customer.name}</div>
                    <div style={{ fontSize: '13px', color: '#5a6a85' }}>📱 {customer.phone}</div>
                    <div style={{ fontSize: '13px', color: '#5a6a85' }}>📧 {customer.email}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <span style={{ background: '#E3F2FD', color: '#1565C0', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                        📦 {custRequests.length} orders
                      </span>
                      <span style={{ background: '#E8F5E9', color: '#2E7D32', padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                        ✅ {custRequests.filter(r => r.status === 'completed').length} completed
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#5a6a85', marginTop: '4px' }}>
                      Joined: {new Date(customer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <a href={`tel:${customer.phone}`} style={{
                    background: '#1565C0', color: 'white', padding: '8px 12px',
                    borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none'
                  }}>📞 Call</a>
                </div>
              </div>
            )
          })}
          {customers.length === 0 && <div className="empty-state"><div className="icon">👥</div><p>No customers yet.</p></div>}
        </>
      )}

      {/* ── RECHARGES ────────────────────────────────────────────────────── */}
      {tab === 'recharges' && !loading && (
        <>
          {recharges.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.profiles?.name || 'Driver'}</div>
                  <div style={{ fontSize: '13px', color: '#5a6a85' }}>📱 {r.profiles?.phone}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1565C0', fontFamily: "'Baloo 2',cursive" }}>₹{r.amount}</div>
                  <div style={{ fontSize: '12px', color: '#5a6a85' }}>{new Date(r.created_at).toLocaleString('en-IN')}</div>
                </div>
                {r.status === 'pending' ? (
                  <button className="btn-green" onClick={() => approveRecharge(r)}>✅ Approve</button>
                ) : (
                  <span style={{ color: '#2E7D32', fontWeight: 600, fontSize: '13px' }}>✅ Done</span>
                )}
              </div>
            </div>
          ))}
          {recharges.length === 0 && <div className="empty-state"><div className="icon">💳</div><p>No recharge requests yet.</p></div>}
        </>
      )}
    </div>
  )
}
