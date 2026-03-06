import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { WaterTankerIcon, SewageTankerIcon } from '../components/TankerIcon'

export default function Register() {
  const [form, setForm] = useState({
    name: '', phone: '', password: '', role: 'customer',
    tanker_type: 'water', area: '', service_radius: 10
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function update(field, val) { setForm(f => ({ ...f, [field]: val })) }

  // We generate a fake email from phone number so Supabase auth works
  function phoneToEmail(phone) {
    return `${phone.replace(/\s+/g, '')}@tankerwala.app`
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true); setError('')

    if (!form.phone || form.phone.length < 10) {
      setError('Please enter a valid 10-digit phone number')
      setLoading(false); return
    }
    if (!form.name.trim()) {
      setError('Please enter your full name')
      setLoading(false); return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false); return
    }
    if (form.role === 'driver' && !form.area.trim()) {
      setError('Please enter your base area')
      setLoading(false); return
    }

    // Check if phone already registered
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', form.phone)
      .single()

    if (existing) {
      setError('This phone number is already registered. Please login.')
      setLoading(false); return
    }

    const fakeEmail = phoneToEmail(form.phone)

    const { data, error: authError } = await supabase.auth.signUp({
      email: fakeEmail,
      password: form.password,
    })

    if (authError) { setError(authError.message); setLoading(false); return }
    if (!data.user) { setError('Registration failed. Please try again.'); setLoading(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      name: form.name,
      phone: form.phone,
      email: fakeEmail,
      role: form.role,
      tanker_type: form.role === 'driver' ? form.tanker_type : null,
      area: form.role === 'driver' ? form.area : null,
      driver_lat: null,
      driver_lng: null,
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
    <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          {form.role === 'driver' ? (
            form.tanker_type === 'water' ? <WaterTankerIcon size={90} /> : <SewageTankerIcon size={90} />
          ) : (
            <><WaterTankerIcon size={70} /><SewageTankerIcon size={70} /></>
          )}
        </div>
        <h1 style={{ fontFamily: "'Baloo 2',cursive", fontSize: '28px', color: '#1565C0', margin: '0' }}>
          Tanker<span style={{ color: '#FF6F00' }}>Wala</span>
        </h1>
        <p style={{ color: '#5a6a85', marginTop: '4px', fontSize: '13px' }}>Create your account</p>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Role Selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {['customer', 'driver'].map(r => (
            <button key={r} onClick={() => update('role', r)} style={{
              flex: 1, padding: '12px', borderRadius: '10px', fontSize: '15px', fontWeight: 600,
              background: form.role === r ? '#1565C0' : '#F0F4FF',
              color: form.role === r ? 'white' : '#5a6a85',
              border: form.role === r ? 'none' : '2px solid #C5D5F0'
            }}>
              {r === 'customer' ? '🏠 Customer' : '🚛 Driver'}
            </button>
          ))}
        </div>

        {/* Driver-only fields */}
        {form.role === 'driver' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#1a2a4a' }}>Select Your Tanker Type</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => update('tanker_type', 'water')} style={{
                  flex: 1, padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  background: form.tanker_type === 'water' ? '#E3F2FD' : '#F0F4FF',
                  color: form.tanker_type === 'water' ? '#1565C0' : '#5a6a85',
                  border: form.tanker_type === 'water' ? '2px solid #1565C0' : '2px solid #C5D5F0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                }}>
                  <WaterTankerIcon size={60} />
                  💧 Water Tanker
                </button>
                <button onClick={() => update('tanker_type', 'sewage')} style={{
                  flex: 1, padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  background: form.tanker_type === 'sewage' ? '#E8F5E9' : '#F0F4FF',
                  color: form.tanker_type === 'sewage' ? '#2E7D32' : '#5a6a85',
                  border: form.tanker_type === 'sewage' ? '2px solid #2E7D32' : '2px solid #C5D5F0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                }}>
                  <SewageTankerIcon size={60} />
                  🚽 Sewage Tanker
                </button>
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 600, fontSize: '14px', color: '#1a2a4a' }}>📍 Your Base Location</label>
              <input
                placeholder="e.g. Horamavu, Whitefield, Byrathikhane..."
                value={form.area}
                onChange={e => update('area', e.target.value)}
                required
              />
              <div style={{ fontSize: '12px', color: '#2E7D32', marginTop: '4px', fontWeight: 600 }}>
                ✅ Type your area name. Live GPS will be used automatically when you go online.
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 600, fontSize: '14px', color: '#1a2a4a' }}>🚛 How far can you travel?</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[5, 10, 15, 20].map(r => (
                  <button key={r} type="button" onClick={() => update('service_radius', r)} style={{
                    flex: 1, minWidth: '60px', padding: '12px 8px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                    background: form.service_radius === r ? '#1565C0' : '#F0F4FF',
                    color: form.service_radius === r ? 'white' : '#5a6a85',
                    border: form.service_radius === r ? 'none' : '2px solid #C5D5F0'
                  }}>{r}km</button>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: '#5a6a85', marginTop: '6px' }}>
                You will receive requests within {form.service_radius}km of your live location
              </div>
            </div>

            <div className="alert alert-info" style={{ marginBottom: '16px' }}>
              Drivers must recharge ₹100 wallet to start bidding. ₹10 is deducted per accepted bid.
            </div>
          </>
        )}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>👤 Full Name</label>
            <input
              placeholder="Ramesh Kumar"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>📱 Phone Number</label>
            <input
              type="tel"
              placeholder="9876543210"
              value={form.phone}
              onChange={e => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              required
            />
            <div style={{ fontSize: '12px', color: '#5a6a85', marginTop: '4px' }}>
              You will use this number to login
            </div>
          </div>

          <div className="form-group">
            <label>🔒 Password</label>
            <input
              type="password"
              placeholder="Choose a password (min 6 characters)"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '16px', color: '#5a6a85', fontSize: '14px' }}>
          Already have an account? <Link to="/login" style={{ color: '#1565C0', fontWeight: 600 }}>Login</Link>
        </p>
      </div>
    </div>
  )
}

