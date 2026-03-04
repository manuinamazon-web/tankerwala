import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PostRequest({ profile }) {
  const [form, setForm] = useState({ tanker_type:'water', capacity:'', address:'', notes:'' })
  const [locating, setLocating] = useState(false)
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function update(field, val) { setForm(f => ({...f, [field]: val})) }

  function getLocation() {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocating(false)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
          .then(r => r.json())
          .then(data => {
            const area = data.address?.suburb || data.address?.neighbourhood || data.address?.village || data.address?.county || 'Current Location'
            const city = data.address?.city || data.address?.town || ''
            update('address', `${area}${city ? ', ' + city : ''}`)
          })
      },
      () => {
        setLocating(false)
        setError('Could not get location. Please type your address.')
      }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.capacity) { setError('Please select tank capacity'); return }
    if (!form.address) { setError('Please enter your location'); return }
    setLoading(true); setError('')

    const { error } = await supabase.from('requests').insert({
      customer_id: profile.id,
      customer_name: profile.name,
      customer_phone: profile.phone,
      tanker_type: form.tanker_type,
      capacity: form.capacity,
      location_text: form.address,
      location_lat: lat,
      location_lng: lng,
      notes: form.notes,
      status: 'pending'
    })

    if (error) { setError(error.message); setLoading(false); return }
    navigate('/customer')
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => navigate('/customer')} style={{background:'#F0F4FF', border:'none', padding:'8px 16px', borderRadius:'8px', fontWeight:600, color:'#1565C0'}}>
          ← Back
        </button>
        <div className="topbar-logo">Post Request</div>
        <div></div>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tanker Type</label>
            <div style={{display:'flex', gap:'10px'}}>
              {['water','sewage'].map(t => (
                <button key={t} type="button" onClick={() => update('tanker_type', t)} style={{
                  flex:1, padding:'14px', borderRadius:'10px', fontSize:'15px', fontWeight:600,
                  background: form.tanker_type===t ? (t==='water' ? '#1565C0' : '#2E7D32') : '#F0F4FF',
                  color: form.tanker_type===t ? 'white' : '#5a6a85',
                  border: 'none'
                }}>
                  {t === 'water' ? '💧 Water' : '🚽 Sewage'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Tank Capacity (Litres)</label>
            <select value={form.capacity} onChange={e=>update('capacity',e.target.value)} required>
              <option value="">Select capacity</option>
              <option value="3000">3,000 Litre
