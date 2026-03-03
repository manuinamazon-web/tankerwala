import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PostRequest({ profile }) {
  const [form, setForm] = useState({ type:'water', capacity:'', address:'', notes:'' })
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
    if (!form.capacity) { setError('Please enter tank capacity'); return }
    setLoading(true); setError('')

    const { error } = await supabase.from('requests').insert({
      customer_id: profile.id,
      customer_name: profile.name,
      customer_phone: profile.phone,
      type: form.type,
      capacity: form.capacity,
      address: form.address,
      lat, lng,
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
                <button key={t} type="button" onClick={() => update('type', t)} style={{
                  flex:1, padding:'14px', borderRadius:'10px', fontSize:'15px', fontWeight:600,
                  background: form.type===t ? (t==='water'?'#1565C0':'#E65100') : '#F0F4FF',
                  color: form.type===t ? 'white' : '#5a6a85',
                  border: 'none'
                }}>
                  {t === 'water' ? '💧 Water' : '🚰 Sewage'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Tank Capacity (Litres)</label>
            <select value={form.capacity} onChange={e=>update('capacity',e.target.value)} required>
              <option value="">Select capacity</option>
              <option value="3000">3,000 Litres</option>
              <option value="5000">5,000 Litres</option>
              <option value="6000">6,000 Litres</option>
              <option value="8000">8,000 Litres</option>
              <option value="10000">10,000 Litres</option>
              <option value="12000">12,000 Litres</option>
            </select>
          </div>

          <div className="form-group">
            <label>Your Location</label>
            <button type="button" onClick={getLocation} disabled={locating} style={{
              background:'#E3F2FD', color:'#1565C0', border:'2px solid #BBDEFB',
              padding:'12px', borderRadius:'10px', fontWeight:600, marginBottom:'8px'
            }}>
              {locating ? '📍 Getting location...' : '📍 Use My Current Location'}
            </button>
            <input
              placeholder="Or type your area (e.g. Bellandur, Bengaluru)"
              value={form.address}
              onChange={e=>update('address',e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Additional Notes (Optional)</label>
            <textarea
              placeholder="E.g. Gate code, landmark, best time to deliver..."
              value={form.notes}
              onChange={e=>update('notes',e.target.value)}
              style={{height:'80px', resize:'none'}}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Posting...' : '🚀 Post Request — Get Bids'}
          </button>
        </form>
      </div>
    </div>
  )
}
