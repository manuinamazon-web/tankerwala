import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DriverOTP({ profile }) {
  const [otp, setOtp] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { requestId } = useParams()
  const navigate = useNavigate()

  function handleInput(val, idx) {
    const newOtp = [...otp]
    newOtp[idx] = val.slice(-1)
    setOtp(newOtp)
    if (val && idx < 3) {
      document.getElementById(`otp-${idx+1}`)?.focus()
    }
  }

  function handleKeyDown(e, idx) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      document.getElementById(`otp-${idx-1}`)?.focus()
    }
  }

  async function verifyOTP() {
    const enteredOtp = otp.join('')
    if (enteredOtp.length < 4) return setError('Please enter all 4 digits')
    setLoading(true)
    setError('')

    const { data: req, error: fetchError } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchError || !req) {
      setError('Request not found')
      setLoading(false)
      return
    }

    if (req.otp !== enteredOtp) {
      setError('❌ Wrong OTP. Please ask customer for the correct OTP.')
      setLoading(false)
      return
    }

    if (req.otp_verified) {
      setError('⚠️ OTP already used for this delivery.')
      setLoading(false)
      return
    }

    // Mark delivery complete
    await supabase.from('requests').update({
      status: 'completed',
      otp_verified: true
    }).eq('id', requestId)

    // Mark bid as completed
    await supabase.from('bids').update({
      status: 'completed'
    }).eq('request_id', requestId).eq('driver_id', profile.id)

    navigate('/driver')
    alert('🎉 Delivery completed successfully!')
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => navigate('/driver')} style={{background:'#F0F4FF', border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:600, color:'#1565C0'}}>
          ← Back
        </button>
        <div className="topbar-logo">Verify OTP</div>
        <div></div>
      </div>

      <div className="card" style={{textAlign:'center', marginTop:'20px'}}>
        <div style={{fontSize:'48px', marginBottom:'12px'}}>🔐</div>
        <div style={{fontWeight:800, fontSize:'20px', color:'#1a2a4a', marginBottom:'8px'}}>
          Enter Delivery OTP
        </div>
        <div style={{fontSize:'14px', color:'#5a6a85', marginBottom:'32px'}}>
          Ask the customer for the 4-digit OTP to confirm delivery
        </div>

        <div style={{display:'flex', gap:'12px', justifyContent:'center', marginBottom:'24px'}}>
          {otp.map((digit, idx) => (
            <input
              key={idx}
              id={`otp-${idx}`}
              type="number"
              value={digit}
              onChange={e => handleInput(e.target.value, idx)}
              onKeyDown={e => handleKeyDown(e, idx)}
              maxLength={1}
              style={{
                width:'56px', height:'64px', textAlign:'center',
                fontSize:'28px', fontWeight:800, fontFamily:"'Baloo 2',cursive",
                border: error ? '2px solid #C62828' : '2px solid #C5D5F0',
                borderRadius:'12px', outline:'none',
                background: digit ? '#E3F2FD' : 'white',
                color:'#1565C0'
              }}
            />
          ))}
        </div>

        {error && (
          <div style={{background:'#FFEBEE', borderRadius:'10px', padding:'12px', marginBottom:'16px', fontSize:'13px', color:'#C62828', fontWeight:600}}>
            {error}
          </div>
        )}

        <button
          onClick={verifyOTP}
          disabled={loading || otp.join('').length < 4}
          className="btn-primary"
          style={{width:'100%', fontSize:'16px', padding:'16px', opacity: otp.join('').length < 4 ? 0.5 : 1}}
        >
          {loading ? '⏳ Verifying...' : '✅ Confirm Delivery'}
        </button>

        <div style={{marginTop:'20px', background:'#FFF3E0', borderRadius:'10px', padding:'12px', fontSize:'13px', color:'#E65100'}}>
          ⚠️ Only enter OTP after tanker has been delivered to the customer's location.
        </div>
      </div>
    </div>
  )
}
