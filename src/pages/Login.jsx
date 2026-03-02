import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh'}}>
      <div style={{textAlign:'center', marginBottom:'32px'}}>
        <div style={{fontSize:'48px', marginBottom:'8px'}}>🚛</div>
        <h1 style={{fontFamily:"'Baloo 2',cursive", fontSize:'32px', color:'#1565C0'}}>
          Tanker<span style={{color:'#FF6F00'}}>Wala</span>
        </h1>
        <p style={{color:'#5a6a85', marginTop:'4px'}}>Login to continue</p>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p style={{textAlign:'center', marginTop:'20px', color:'#5a6a85', fontSize:'14px'}}>
          No account? <Link to="/register" style={{color:'#1565C0', fontWeight:600}}>Register here</Link>
        </p>
      </div>
    </div>
  )
}
