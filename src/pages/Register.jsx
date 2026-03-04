import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Register() {
  const [form, setForm] = useState({ name:'', phone:'', email:'', password:'', role:'customer', tanker_type:'water', area:'', service_radius:10 })
  const [locating, setLocating] = useState(false)
  const [driverLat, setDriverLat] = useState(null)
  const [driverLng, setDriverLng] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function update(field, val) { setForm(f => ({...f, [field]: val})) }

  function detectLocation() {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setDriverLat(pos.coords.latitude)
        setDriverLng(pos.coords.longitude)
        setLocating(false)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`, {
          headers: { 'User-Agent': 'TankerWala/1.0' }
        })
          .then(r => r.json())
          .then(data => {
            const a = data.address || {}
            const area = a.neighbourhood || a.suburb || a.village || a.city_district || a.city || 'Current Location'
            update('area', area)
          })
          .catch(() => update('area', `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`))
      },
      () => { setLocating(false); alert('Could not get location. Please type your area.') }
    )
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true); setError('')

    if (form.role === 'driver' && !form.area) {
      setError('Please enter your base area')
      setLoading(false); return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (authError) { setError(authError.message); setLoading(false); return }
    if (!data.user) { setError('Registration failed. Please try again.'); setLoading(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      name: form.name,
      phone: form.phone,
      email: form.email,
      role: form.role,
      tanker_type: form.role === 'driver' ? form.tanker_type : null,
      area: form.role === 'driver' ? form.area : null,
      driver_lat: form.role === 'driver' ? driverLat : null,
      driver_lng: form.role === 'driver' ? driverLng : null,
      service_radius: form.role === 'driver' ? form.service_radius : null,
      wallet_balance: form.role === 'driver' ? 0 : null,
      is_active: form.role === 'driver' ? false : true,
    })

    if (profileError) { setError(profileError.message); setLoading(false); return }

    setLoading(false)
    if (form.role === 'customer') navigate('/customer')
    else if (form.role === 'driver') navigate('/driver')
  }

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh'}}>
      <div style={{textAlign:'center', marginBottom:'24px'}}>
        <h1 style={{fontFamily:"'Baloo 2',cursive", fontSize:'28px', color:'#1565C0'}}>
          Tanker<span style={{color:'#FF6F00'}}>Wala</span>
        </h1>
        <p style={{color:'#5a6a85'}}>Create your account</p>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{display:'flex', gap:'8px', marginBottom:'20px'}}>
          {['customer','driver'].map(r => (
            <button key={r} onClick={() => update('role', r)} style={{
              flex:1, padding:'12px', borderRadius:'10px', fontSize:'15px', fontWeight:600,
              background: form.role===r ? '#1565C0' : '#F0F4FF',
              color: form.role===r ? 'white' : '#5a6a85',
              border: form.role===r ? 'none' : '2px solid #C5D5F0'
            }}>
              {r === 'customer' ? '🏠 Customer' : '🚛 Driver'}
            </button>
          ))}
        </div>

        {form.role === 'driver' && (
          <>
            <div style={{marginBottom:'16px'}}>
              <div style={{fontWeight:600, fontSize:'14px', marginBottom:'8px', color:'#1a2a4a'}}>Select Your Tanker Type</div>
              <div style={{display:'flex', gap:'8px'}}>
                <button onClick={() => update('tanker_type', 'water')} style={{
                  flex:1, padding:'14px', borderRadius:'10px', fontSize:'14px', fontWeight:600,
                  background: form.tanker_type==='water' ? '#E3F2FD' : '#F0F4FF',
                  color: form.tanker_type==='water' ? '#1565C0' : '#5a6a85',
                  border: form.tanker_type==='water' ? '2px solid #1565C0' : '2px solid #C5D5F0'
                }}>💧 Water Tanker</button>
                <button onClick={() => update('tanker_type', 'sewage')} style={{
                  flex:1, padding:'14px', borderRadius:'10px', fontSize:'14px', fontWeight:600,
                  background: form.tanker_type==='sewage' ? '#E8F5E9' : '#F0F4FF',
                  color: form.tanker_type==='sewage' ? '#2E7D32' : '#5a6a85',
                  border: form.tanker_type==='sewage' ? '2px solid #2E7D32' : '2px solid #C5D5F0'
                }}>🚽 Sewage Tanker</button>
              </div>
            </div>

            <div className="form-group">
              <label style={{fontWeight:600, fontSize:'14px', color:'#1a2a4a'}}>📍 Your Base Location</label>
              <input
                placeholder="e.g. Horamavu, Whitefield..."
                value={form.area}
                onChange={e => update('area', e.target.value)}
                style={{marginBottom:'8px'}}
                required
              />
              <button type="button" onClick={detectLocation} disabled={locating} style={{
                width:'100%', background:'#E3F2FD', color:'#1565C0', border:'2px solid #BBDEFB',
                padding:'10px', borderRadius:'10px', fontWeight:600, cursor:'pointer', fontSize:'13px'
              }}>
                {locating ? '⏳ Detecting...' : '📍 Auto-detect my location'}
              </button>
              {driverLat && <div style={{fontSize:'12px', color:'#2E7D32', marginTop:'4px'}}>✅ GPS location captured</div>}
            </div>

            <div className="form-group">
              <label style={{fontWeight:600, fontSize:'14px', color:'#1a2a4a'}}>🚛 How far can you travel?</label>
              <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                {[5, 10, 15, 20].map(r => (
                  <button key={r} type="button" onClick={() => update('service_radius', r)} style={{
                    flex:1, minWidth:'60px', padding:'12px 8px', borderRadius:'10px', fontSize:'14px', fontWeight:600,
                    background: form.service_radius===r ? '#1565C0' : '#F0F4FF',
                    color: form.service_radius===r ? 'white' : '#5a6a85',
                    border: form.service_radius===r ? 'none' : '2px solid #C5D5F0'
                  }}>
                    {r}km
                  </button>
                ))}
              </div>
              <div style={{fontSize:'12px', color:'#5a6a85', marginTop:'6px'}}>
                You will receive requests within {form.service_radius}km of your base location
              </div>
            </div>

            <div className="alert alert-info" style={{marginBottom:'16px'}}>
              Drivers must recharge ₹100 wallet to start bidding. ₹10 is deducted per accepted bid.
            </div>
          </>
        )}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Full Name</label>
            <input placeholder="Ramesh Kumar" value={form.name} onChange={e=>update('name',e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input placeholder="9876543210" value={form.phone} onChange={e=>update('phone',e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="your@email.com" value={form.email} onChange={e=>update('email',e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="Min 6 characters" value={form.password} onChange={e=>update('password',e.target.value)} required />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        <p style={{textAlign:'center', marginTop:'16px', color:'#5a6a85', fontSize:'14px'}}>
          Already have an account? <Link to="/login" style={{color:'#1565C0', fontWeight:600}}>Login</Link>
        </p>
      </div>
    </div>
  )
}
