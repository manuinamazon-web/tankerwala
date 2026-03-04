import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
}

export default function PostRequest({ profile }) {
  const [form, setForm] = useState({ tanker_type:'water', capacity:'', address:'', notes:'' })
  const [locating, setLocating] = useState(false)
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nearbyDrivers, setNearbyDrivers] = useState(null)
  const [searchRadius, setSearchRadius] = useState(null)
  const navigate = useNavigate()

  function update(field, val) { setForm(f => ({...f, [field]: val})) }

  useEffect(() => {
    if (lat && lng) checkNearbyDrivers(lat, lng, form.tanker_type)
  }, [lat, lng, form.tanker_type])

  async function checkNearbyDrivers(customerLat, customerLng, tankerType) {
    const { data: drivers } = await supabase
      .from('profiles')
      .select('driver_lat, driver_lng, last_seen')
      .eq('role', 'driver')
      .eq('tanker_type', tankerType)
      .eq('is_active', true)
      .not('driver_lat', 'is', null)

    if (!drivers) return

    const fiveKm = drivers.filter(d => {
      const dist = getDistance(customerLat, customerLng, d.driver_lat, d.driver_lng)
      return dist && parseFloat(dist) <= 5
    })

    if (fiveKm.length > 0) {
      setNearbyDrivers(fiveKm.length)
      setSearchRadius(5)
    } else {
      const tenKm = drivers.filter(d => {
        const dist = getDistance(customerLat, customerLng, d.driver_lat, d.driver_lng)
        return dist && parseFloat(dist) <= 10
      })
      setNearbyDrivers(tenKm.length)
      setSearchRadius(10)
    }
  }

  function getLocation() {
    setLocating(true)
    update('address', 'Fetching area name...')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocating(false)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=en`, {
  headers: { 'User-Agent': 'TankerWala App' }
})
  .then(r => r.json())
  .then(data => {
    const a = data.address
    const area = a?.neighbourhood || a?.suburb || a?.quarter || a?.village || a?.town || a?.city_district || 'Current Location'
    const city = a?.city || a?.town || ''
    update('address', `${area}${city && city !== area ? ', ' + city : ''}`)
  })
  .catch(() => {
    update('address', `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
  })
          .catch(() => {
            update('address', `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
          })
      },
      () => {
        setLocating(false)
        update('address', '')
        setError('Could not get location. Please type your address.')
      }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.capacity) { setError('Please select tank capacity'); return }
    if (!form.address || form.address === 'Fetching area name...') { setError('Please wait for location or type your area'); return }
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
              width:'100%', background:'#E3F2FD', color:'#1565C0', border:'2px solid #BBDEFB',
              padding:'12px', borderRadius:'10px', fontWeight:600, marginBottom:'8px', cursor:'pointer'
            }}>
              {locating ? '⏳ Getting location...' : '📍 Use My Current Location'}
            </button>

            {nearbyDrivers !== null && lat && (
              <div style={{
                background: nearbyDrivers > 0 ? '#E8F5E9' : '#FFF3E0',
                border: `1px solid ${nearbyDrivers > 0 ? '#A5D6A7' : '#FFCC80'}`,
                borderRadius:'8px', padding:'10px', marginBottom:'8px', fontSize:'13px'
              }}>
                {nearbyDrivers > 0 ? (
                  <span style={{color:'#2E7D32'}}>
                    ✅ <strong>{nearbyDrivers} {form.tanker_type} tanker driver{nearbyDrivers > 1 ? 's' : ''}</strong> available within {searchRadius}km!
                  </span>
                ) : (
                  <span style={{color:'#E65100'}}>
                    ⚠️ No {form.tanker_type} tanker drivers found within 10km. Your request will still be posted.
                  </span>
                )}
                {searchRadius === 10 && nearbyDrivers > 0 && (
                  <div style={{fontSize:'12px', color:'#E65100', marginTop:'4px'}}>
                    ⚠️ No drivers within 5km. Showing drivers within 10km.
                  </div>
                )}
              </div>
            )}

            <input
              placeholder="Or type your area (e.g. Bellandur, Bengaluru)"
              value={form.address}
              onChange={e => update('address', e.target.value)}
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
