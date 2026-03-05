import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DriverOTP({ profile }) {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { requestId } = useParams()
  const navigate = useNavigate()

  async function verifyOTP() {
    if (otp.length < 4) return setError('Please enter all 4 digits')
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

    if (req.otp !== otp) {
      setError('❌ Wrong OTP. Please ask customer for the correct OTP.')
      setLoading(false)
      return
    }

    if (req.otp_verified) {
      setError('⚠️ OTP already used for this delivery.')
      setLoading(false)
      return
    }

    await supabase.from('requests').update({
      status: 'completed',
      otp_verified: true,
      delivery_status: 'completed'
    }).eq('id', requestId)

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
          Ask the customer for their 4-digit OTP
        </div>

        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={otp}
          onChange={e => {
            const val = e.target.value.replace(/[^0-9]/g, '')
            setOtp(val)
            setError('')
          }}
          placeholder="_ _ _ _"
          style={{
            width:'100%',
            padding:'20px',
            fontSize:'42px',
            fontWeight:900,
            textAlign:'center',
            letterSpacing:'20px',
            border: error ? '2.5px solid #C62828' : '2.5px solid #C5D5F0',
            borderRadius:'16px',
            outline:'none',
            fontFamily:"'Baloo 2',cursive",
            color:'#1565C0',
            background: otp.length === 4 ? '#E3F2FD' : 'white',
            boxSizing:'border-box',
            MozAppearance:'textfield',
            appearance:'textfield',
          }}
          autoFocus
        />

        {error && (
          <div style={{background:'#FFEBEE', borderRadius:'10px', padding:'12px', marginTop:'16px', fontSize:'13px', color:'#C62828', fontWeight:600}}>
            {error}
          </div>
        )}

        <button
          onClick={verifyOTP}
          disabled={loading || otp.length < 4}
          className="btn-primary"
          style={{
            width:'100%', fontSize:'16px', padding:'16px', marginTop:'24px',
            opacity: otp.length < 4 ? 0.5 : 1
          }}
        >
          {loading ? '⏳ Verifying...' : '✅ Confirm Delivery'}
        </button>

        <div style={{marginTop:'20px', background:'#FFF3E0', borderRadius:'10px', padding:'12px', fontSize:'13px', color:'#E65100'}}>
          ⚠️ Only confirm after tanker has been fully delivered.
        </div>
      </div>
    </div>
  )
}
