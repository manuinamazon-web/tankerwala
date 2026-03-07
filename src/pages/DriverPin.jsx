import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { WaterTankerIcon, SewageTankerIcon } from '../components/TankerIcon'

export default function DriverPin({ profile }) {
  const [mode, setMode] = useState(null) // 'set' or 'verify'
  const [pin, setPin] = useState(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', ''])
  const [step, setStep] = useState('enter') // 'enter' or 'confirm'
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockTimer, setLockTimer] = useState(0)
  const inputRefs = useRef([])
  const confirmRefs = useRef([])
  const navigate = useNavigate()

  useEffect(() => {
    // Check if driver already has a PIN
    if (profile.driver_pin) {
      setMode('verify')
    } else {
      setMode('set')
    }
  }, [profile])

  useEffect(() => {
    if (locked && lockTimer > 0) {
      const t = setTimeout(() => setLockTimer(t => t - 1), 1000)
      return () => clearTimeout(t)
    }
    if (lockTimer === 0 && locked) {
      setLocked(false)
      setAttempts(0)
    }
  }, [locked, lockTimer])

  function handlePinInput(val, idx, isConfirm) {
    const digits = isConfirm ? [...confirmPin] : [...pin]
    digits[idx] = val.replace(/\D/g, '').slice(-1)
    if (isConfirm) setConfirmPin(digits)
    else setPin(digits)

    if (val && idx < 3) {
      const refs = isConfirm ? confirmRefs : inputRefs
      refs.current[idx + 1]?.focus()
    }

    // Auto submit when all 4 digits filled
    const filled = digits.every(d => d !== '')
    if (filled) {
      setTimeout(() => {
        if (mode === 'verify') {
          verifyPin(digits.join(''))
        } else if (mode === 'set') {
          if (step === 'enter') {
            setStep('confirm')
            setTimeout(() => confirmRefs.current[0]?.focus(), 100)
          } else {
            savePin(pin.join(''), digits.join(''))
          }
        }
      }, 100)
    }
  }

  function handleKeyDown(e, idx, isConfirm) {
    if (e.key === 'Backspace') {
      const digits = isConfirm ? [...confirmPin] : [...pin]
      if (!digits[idx] && idx > 0) {
        const refs = isConfirm ? confirmRefs : inputRefs
        refs.current[idx - 1]?.focus()
      }
    }
  }

  async function verifyPin(enteredPin) {
    if (locked) return
    if (enteredPin === profile.driver_pin) {
      // PIN correct - proceed to dashboard
      navigate('/driver')
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin(['', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)

      if (newAttempts >= 3) {
        setLocked(true)
        setLockTimer(30)
        setError('Too many wrong attempts! Wait 30 seconds.')
      } else {
        setError(`Wrong PIN! ${3 - newAttempts} attempt${3 - newAttempts === 1 ? '' : 's'} left.`)
      }
    }
  }

  async function savePin(newPin, confirmed) {
    if (newPin !== confirmed) {
      setError('PINs do not match! Try again.')
      setPin(['', '', '', ''])
      setConfirmPin(['', '', '', ''])
      setStep('enter')
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
      return
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ driver_pin: newPin })
      .eq('id', profile.id)

    if (updateError) {
      setError('Failed to save PIN. Try again.')
      return
    }
    navigate('/driver')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function resetPin(idx, isConfirm) {
    const digits = isConfirm ? [...confirmPin] : [...pin]
    digits[idx] = ''
    if (isConfirm) setConfirmPin(digits)
    else setPin(digits)
  }

  if (!mode) return <div className="page" style={{display:'flex',justifyContent:'center',alignItems:'center'}}><div className="spinner"></div></div>

  const tankerColor = profile.tanker_type === 'water' ? '#1565C0' : '#2E7D32'
  const currentPin = step === 'confirm' ? confirmPin : pin
  const currentRefs = step === 'confirm' ? confirmRefs : inputRefs

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh'}}>

      {/* Header */}
      <div style={{textAlign:'center', marginBottom:'32px'}}>
        <div style={{display:'flex', justifyContent:'center', marginBottom:'12px'}}>
          {profile.tanker_type === 'water' ? <WaterTankerIcon size={80} /> : <SewageTankerIcon size={80} />}
        </div>
        <h1 style={{fontFamily:"'Baloo 2',cursive", fontSize:'28px', color:'#1565C0', margin:0}}>
          Tanker<span style={{color:'#FF6F00'}}>Wala</span>
        </h1>
        <div style={{fontSize:'14px', color:'#5a6a85', marginTop:'4px'}}>Driver Security</div>
      </div>

      <div className="card" style={{textAlign:'center'}}>

        {/* Driver photo + name */}
        <div style={{marginBottom:'24px'}}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="Driver" style={{
              width:'72px', height:'72px', borderRadius:'50%',
              objectFit:'cover', border:`3px solid ${tankerColor}`,
              margin:'0 auto 10px', display:'block'
            }} />
          ) : (
            <div style={{
              width:'72px', height:'72px', borderRadius:'50%',
              background:'#E3F2FD', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:'32px',
              margin:'0 auto 10px'
            }}>👤</div>
          )}
          <div style={{fontWeight:700, fontSize:'16px', color:'#1a2a4a'}}>{profile.name}</div>
          <div style={{fontSize:'12px', color:tankerColor, fontWeight:600}}>
            {profile.tanker_type === 'water' ? '💧 Water Tanker' : '🚽 Sewage Tanker'}
          </div>
        </div>

        {/* Title */}
        <div style={{fontSize:'20px', fontWeight:800, color:'#1a2a4a', marginBottom:'6px'}}>
          {mode === 'set'
            ? step === 'enter' ? '🔐 Set Your PIN' : '🔐 Confirm Your PIN'
            : locked ? '🔒 Account Locked' : '🔐 Enter Your PIN'}
        </div>
        <div style={{fontSize:'13px', color:'#5a6a85', marginBottom:'24px'}}>
          {mode === 'set'
            ? step === 'enter'
              ? 'Choose a 4-digit PIN to secure your account'
              : 'Re-enter your PIN to confirm'
            : locked
              ? `Too many wrong attempts. Wait ${lockTimer}s`
              : 'Enter your 4-digit PIN to continue'}
        </div>

        {/* Error */}
        {error && !locked && (
          <div className="alert alert-error" style={{marginBottom:'16px'}}>{error}</div>
        )}

        {/* PIN dots */}
        {!locked && (
          <div style={{display:'flex', gap:'12px', justifyContent:'center', marginBottom:'28px'}}>
            {currentPin.map((digit, idx) => (
              <div key={idx} style={{position:'relative'}}>
                <input
                  ref={el => currentRefs.current[idx] = el}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinInput(e.target.value, idx, step === 'confirm')}
                  onKeyDown={e => handleKeyDown(e, idx, step === 'confirm')}
                  onFocus={() => resetPin(idx, step === 'confirm')}
                  style={{
                    width:'56px', height:'64px', textAlign:'center',
                    fontSize: digit ? '0px' : '20px',
                    fontWeight:800, borderRadius:'12px',
                    border: digit ? `2px solid ${tankerColor}` : '2px solid #C5D5F0',
                    background: digit ? '#E3F2FD' : '#F8FAFF',
                    outline:'none', caretColor:'transparent',
                    color: tankerColor
                  }}
                />
                {/* Show filled dot */}
                {digit && (
                  <div style={{
                    position:'absolute', top:'50%', left:'50%',
                    transform:'translate(-50%, -50%)',
                    width:'14px', height:'14px', borderRadius:'50%',
                    background: tankerColor, pointerEvents:'none'
                  }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Lock countdown */}
        {locked && (
          <div style={{
            fontSize:'48px', fontWeight:800, color:'#C62828',
            fontFamily:"'Baloo 2',cursive", marginBottom:'24px'
          }}>
            {lockTimer}s
          </div>
        )}

        {/* Attempt dots */}
        {mode === 'verify' && !locked && (
          <div style={{display:'flex', gap:'8px', justifyContent:'center', marginBottom:'20px'}}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width:'10px', height:'10px', borderRadius:'50%',
                background: i < attempts ? '#C62828' : '#E8EEF8'
              }} />
            ))}
          </div>
        )}

        {/* Logout link */}
        <button onClick={handleLogout} style={{
          background:'none', border:'none', color:'#5a6a85',
          fontSize:'13px', cursor:'pointer', textDecoration:'underline', marginTop:'8px'
        }}>
          Not {profile.name}? Logout
        </button>
      </div>
    </div>
  )
}
