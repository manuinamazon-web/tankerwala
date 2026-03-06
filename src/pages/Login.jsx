import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { WaterTankerIcon, SewageTankerIcon } from '../components/TankerIcon'

export default function Login() {
  const [input, setInput] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Detect if input is phone number or email
  function isPhoneNumber(val) {
    return /^\d{10}$/.test(val.trim())
  }

  // Convert phone to fake email (same logic as Register.jsx)
  function phoneToEmail(phone) {
    return `${phone.replace(/\s+/g, '')}@tankerwala.app`
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')

    if (!input.trim()) {
      setError('Please enter your phone number or email')
      setLoading(false); return
    }
    if (!password) {
      setError('Please enter your password')
      setLoading(false); return
    }

    // Determine email to use for Supabase auth
    let emailToUse = ''
    if (isPhoneNumber(input.trim())) {
      emailToUse = phoneToEmail(input.trim())
    } else {
      emailToUse = input.trim()
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: password,
    })

    if (authError) {
      setError('Wrong phone/email or password. Please try again.')
      setLoading(false); return
    }

    if (!data.user) {
      setError('Login failed. Please try again.')
      setLoading(false); return
    }

    // Fetch profile to redirect to correct dashboard
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    setLoading(false)

    if (profile?.role === 'driver') navigate('/driver')
    else if (profile?.role === 'admin') navigate('/admin')
    else navigate('/customer')
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <WaterTankerIcon size={70} />
          <SewageTankerIcon size={70} />
        </div>
        <h1 style={{ fontFamily: "'Baloo 2',cursive", fontSize: '28px', color: '#1565C0', margin: '0' }}>
          Tanker<span style={{ color: '#FF6F00' }}>Wala</span>
        </h1>
        <p style={{ color: '#5a6a85', marginTop: '4px', fontSize: '13px' }}>Login to your account</p>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>📱 Phone Number or Email</label>
            <input
              type="text"
              placeholder="9876543210 or your@email.com"
              value={input}
              onChange={e => setInput(e.target.value)}
              required
              style={{ fontSize: '16px' }}
            />
            <div style={{ fontSize: '12px', color: '#5a6a85', marginTop: '4px' }}>
              Drivers & Customers: enter phone number · Admin: enter email
            </div>
          </div>

          <div className="form-group">
            <label>🔒 Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : '🚀 Login'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '16px', color: '#5a6a85', fontSize: '14px' }}>
          New user? <Link to="/register" style={{ color: '#1565C0', fontWeight: 600 }}>Create Account</Link>
        </p>
      </div>
    </div>
  )
}
