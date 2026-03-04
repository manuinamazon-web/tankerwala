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
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nearbyDrivers, setNearbyDrivers] = useState(null)
  const [searchRadius, setSearchRadius] = useState(null)
  const [gpsStatus, setGpsStatus] = useState('📍 Getting GPS...')
  const [savedAddresses, setSavedAddresses] = useState([])
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const navigate = useNavigate()

  function update(field, val) { setForm(f => ({...f, [field]: val})) }

  useEffect(() => {
    // Load saved addresses
    if (profile.saved_addresses) {
      setSavedAddresses(profile.saved_addresses)
    }

    // Silently get GPS in background
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setGpsStatus('✅ GPS captured')
        checkNearbyDrivers(pos.coords.latitude, pos.coords.longitude, form.tanker_type)
      },
      () => setGpsStatus('⚠️ GPS unavailable'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  useEffect(() => {
    if (lat && lng) checkNearbyDrivers(lat, lng, form.tanker_type)
  }, [form.tanker_type])

  async function checkNearbyDrivers(customerLat, customerLng, tankerType) {
    const { data: drivers } = await supabase
      .from('profiles')
      .select('driver_lat, driver_lng')
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

  function selectSavedAddress(saved) {
    update('address', saved.address)
    if (saved.lat) setLat(saved.lat)
    if (saved.lng) setLng(saved.lng)
  }

  async function saveAddress() {
    if (!form.address.trim()) return
    const label = saveLabel.trim() || 'Home'
    const newAddress = {
      label,
      address: form.address,
      lat, lng,
      id: Date.now()
    }
    const updated = [...savedAddresses, newAddress]
    setSavedAddresses(updated)
    setShowSavePrompt(false)
    setSaveLabel('')
    await supabase.from('profiles').update({ saved_addresses: updated }).eq('id', profile.id)
    alert(`✅ Address saved as "${label}"!`)
  }

  async function deleteAddress(id) {
    const updated = savedAddresses.filter(a => a.id !== id)
    setSavedAddresses(updated)
    await supabase.from('profiles').update({ saved_addresses: updated }).eq('id', profile.id)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.capacity) { setError('Please select tank capacity'); return }
    if (!form.address.trim()) { setError('Please type your delivery location'); return }
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
            <label>📍 Delivery Location <span style={{color:'red'}}>*</span></label>

            {savedAddresses.length > 0 && (
              <div style={{marginBottom:'10px'}}>
                <div style={{fontSize:'12px', color:'#5a6a85', marginBottom:'6px', fontWeight:600}}>
                  🏠 Saved Addresses — tap to select:
                </div>
                {savedAddresses.map(saved => (
                  <div key={saved.id} style={{display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px'}}>
                    <button type="button" onClick={() => selectSavedAddress(saved)} style={{
                      flex:1, padding:'10px 12px', borderRadius:'8px', fontSize:'13px', fontWeight:600,
                      background: form.address===saved.address ? '#E3F2FD' : '#F0F4FF',
                      color: form.address===saved.address ? '#1565C0' : '#333',
                      border: form.address===saved.address ? '2px solid #1565C0' : '1px solid #E8EEF8',
                      textAlign:'left', cursor:'pointer'
                    }}>
                      {saved.label === 'Home' ? '🏠' : saved.label === 'Office' ? '🏢' : saved.label === 'Site' ? '🏗️' : '📍'} {saved.label} — {saved.address}
                    </button>
                    <button type="button" onClick={() => deleteAddress(saved.id)} style={{
                      padding:'8px', borderRadius:'8px', background:'#FFEBEE',
                      border:'none', color:'#C62828', cursor:'pointer', fontSize:'14px'
                    }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}

            <input
              placeholder="Type your exact area e.g. Horamavu Agara, near Big Bazaar"
              value={form.address}
              onChange={e => update('address', e.target.value)}
              required
              style={{marginBottom:'8px'}}
            />

            <div style={{
              background: lat ? '#E8F5E9' : '#FFF8E1',
              border: `1px solid ${lat ? '#A5D6A7' : '#FFE082'}`,
              borderRadius:'8px', padding:'8px 12px', fontSize:'12px',
              color: lat ? '#2E7D32' : '#F57F17', marginBottom:'8px'
            }}>
              {gpsStatus}
            </div>

            {form.address.trim() && !showSavePrompt && (
              <button type="button" onClick={() => setShowSavePrompt(true)} style={{
                width:'100%', padding:'10px', borderRadius:'8px', fontSize:'13px', fontWeight:600,
                background:'#F0F4FF', color:'#1565C0', border:'1.5px solid #C5D5F0', cursor:'pointer'
              }}>
                💾 Save this address for next time
              </button>
            )}

            {showSavePrompt && (
              <div style={{background:'#F0F4FF', borderRadius:'10px', padding:'12px', marginTop:'8px'}}>
                <div style={{fontSize:'13px', fontWeight:600, marginBottom:'8px', color:'#1a2a4a'}}>Save as:</div>
                <div style={{display:'flex', gap:'6px', marginBottom:'8px'}}>
                  {['Home', 'Office', 'Site', 'Other'].map(l => (
                    <button key={l} type="button" onClick={() => setSaveLabel(l)} style={{
                      flex:1, padding:'8px 4px', borderRadius:'8px', fontSize:'12px', fontWeight:600,
                      background: saveLabel===l ? '#1565C0' : 'white',
                      color: saveLabel===l ? 'white' : '#5a6a85',
                      border: saveLabel===l ? 'none' : '1px solid #C5D5F0', cursor:'pointer'
                    }}>{l === 'Home' ? '🏠' : l === 'Office' ? '🏢' : l === 'Site' ? '🏗️' : '📍'} {l}</button>
                  ))}
                </div>
                <div style={{display:'flex', gap:'8px'}}>
                  <button type="button" onClick={saveAddress} style={{
                    flex:1, padding:'10px', borderRadius:'8px', background:'#1565C0',
                    color:'white', border:'none', fontWeight:600, cursor:'pointer'
                  }}>✅ Save</button>
                  <button type="button" onClick={() => setShowSavePrompt(false)} style={{
                    flex:1, padding:'10px', borderRadius:'8px', background:'#F0F4FF',
                    color:'#5a6a85', border:'none', fontWeight:600, cursor:'pointer'
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {nearbyDrivers !== null && lat && (
            <div style={{
              background: nearbyDrivers > 0 ? '#E8F5E9' : '#FFF3E0',
              border: `1px solid ${nearbyDrivers > 0 ? '#A5D6A7' : '#FFCC80'}`,
              borderRadius:'8px', padding:'10px', marginBottom:'16px', fontSize:'13px'
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
            </div>
          )}

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
