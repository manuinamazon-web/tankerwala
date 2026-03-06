import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TankerIcon } from '../components/TankerIcon'
import { sendPushToDriver } from '../lib/pushNotifications'

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

const QUICK_CAPACITIES = [3000, 5000, 8000, 10000, 12000, 15000, 20000]

export default function PostRequest({ profile }) {
  const [form, setForm] = useState({ tanker_type:'water', capacity:'', address:'', notes:'' })
  const [customCapacity, setCustomCapacity] = useState('')
  const [useCustom, setUseCustom] = useState(false)
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
    if (profile.saved_addresses) setSavedAddresses(profile.saved_addresses)
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
    const newAddress = { label, address: form.address, lat, lng, id: Date.now() }
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

  function getFinalCapacity() {
    if (useCustom) return customCapacity
    return form.capacity
  }

  // ✅ Send push notifications to all nearby online drivers
  async function notifyNearbyDrivers(requestLat, requestLng, tankerType, locationText, capacity) {
    try {
      // Get all online drivers with push subscriptions
      const { data: drivers } = await supabase
        .from('profiles')
        .select('id, driver_lat, driver_lng, service_radius')
        .eq('role', 'driver')
        .eq('tanker_type', tankerType)
        .eq('is_active', true)
        .eq('is_online', true)
        .not('driver_lat', 'is', null)

      if (!drivers || drivers.length === 0) return

      // Filter drivers within their service radius
      const nearbyDriverIds = drivers
        .filter(d => {
          const dist = getDistance(requestLat, requestLng, d.driver_lat, d.driver_lng)
          const radius = d.service_radius || 10
          return !dist || parseFloat(dist) <= radius
        })
        .map(d => d.id)

      // Send push to each nearby driver
      const tankerLabel = tankerType === 'water' ? '💧 Water' : '🚽 Sewage'
      for (const driverId of nearbyDriverIds) {
        await sendPushToDriver(
          driverId,
          `🔔 New ${tankerLabel} Tanker Request!`,
          `${capacity}L needed at ${locationText}. Open app to bid now!`
        )
      }
    } catch (err) {
      console.error('Push notification error:', err)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const finalCapacity = getFinalCapacity()
    if (!finalCapacity) { setError('Please select or enter tank capacity'); return }
    if (parseInt(finalCapacity) < 500) { setError('Minimum capacity is 500 litres'); return }
    if (!form.address.trim()) { setError('Please type your delivery location'); return }
    setLoading(true); setError('')

    const { error } = await supabase.from('requests').insert({
      customer_id: profile.id,
      customer_name: profile.name,
      customer_phone: profile.phone,
      tanker_type: form.tanker_type,
      capacity: parseInt(finalCapacity),
      location_text: form.address,
      location_lat: lat,
      location_lng: lng,
      notes: form.notes,
      status: 'pending'
    })

    if (error) { setError(error.message); setLoading(false); return }

    // ✅ Send push notifications to nearby online drivers
    if (lat && lng) {
      await notifyNearbyDrivers(lat, lng, form.tanker_type, form.address, parseInt(finalCapacity))
    }

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

          {/* Tanker Type */}
          <div className="form-group">
            <label>Tanker Type</label>
            <div style={{display:'flex', gap:'10px'}}>
              {['water','sewage'].map(t => (
                <button key={t} type="button" onClick={() => update('tanker_type', t)} style={{
                  flex:1, padding:'14px', borderRadius:'10px', fontSize:'15px', fontWeight:600,
                  background: form.tanker_type===t ? (t==='water' ? '#1565C0' : '#2E7D32') : '#F0F4FF',
                  color: form.tanker_type===t ? 'white' : '#5a6a85',
                  border: 'none', display:'flex', flexDirection:'column', alignItems:'center', gap:'6px'
                }}>
                  <TankerIcon type={t} size={50} />
                  {t === 'water' ? '💧 Water' : '🚽 Sewage'}
                </button>
              ))}
            </div>
          </div>

          {/* Capacity */}
          <div className="form-group">
            <label>Tank Capacity (Litres)</label>
            {!useCustom && (
              <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'10px'}}>
                {QUICK_CAPACITIES.map(c => (
                  <button key={c} type="button"
                    onClick={() => { update('capacity', String(c)); setUseCustom(false) }}
                    style={{
                      padding:'10px 14px', borderRadius:'10px', fontSize:'13px', fontWeight:700,
                      background: form.capacity===String(c) ? '#1565C0' : '#F0F4FF',
                      color: form.capacity===String(c) ? 'white' : '#333',
                      border: form.capacity===String(c) ? 'none' : '1.5px solid #C5D5F0',
                      cursor:'pointer'
                    }}>
                    {c >= 1000 ? `${c/1000}K` : c}L
                  </button>
                ))}
                <button type="button"
                  onClick={() => { setUseCustom(true); update('capacity', '') }}
                  style={{
                    padding:'10px 14px', borderRadius:'10px', fontSize:'13px', fontWeight:700,
                    background: useCustom ? '#FF6F00' : '#F0F4FF',
                    color: useCustom ? 'white' : '#333',
                    border: useCustom ? 'none' : '1.5px solid #C5D5F0',
                    cursor:'pointer'
                  }}>
                  ✏️ Custom
                </button>
              </div>
            )}

            {useCustom && (
              <div>
                <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px'}}>
                  <input
                    type="number"
                    placeholder="Enter litres e.g. 25000"
                    value={customCapacity}
                    onChange={e => setCustomCapacity(e.target.value)}
                    style={{flex:1, padding:'12px', borderRadius:'8px', border:'1.5px solid #FF6F00', fontSize:'16px', fontWeight:700, color:'#FF6F00'}}
                    autoFocus
                  />
                  <span style={{fontSize:'14px', color:'#5a6a85', fontWeight:600}}>Litres</span>
                </div>
                <button type="button" onClick={() => { setUseCustom(false); setCustomCapacity('') }} style={{
                  fontSize:'12px', color:'#1565C0', background:'none', border:'none',
                  cursor:'pointer', fontWeight:600, padding:'0'
                }}>
                  ← Back to quick select
                </button>
              </div>
            )}

            {(form.capacity || customCapacity) && (
              <div style={{
                background:'#E3F2FD', borderRadius:'8px', padding:'8px 12px',
                fontSize:'13px', color:'#1565C0', fontWeight:700, marginTop:'8px'
              }}>
                ✅ Selected: {parseInt(getFinalCapacity()).toLocaleString()} Litres
              </div>
            )}
          </div>

          {/* Location */}
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
                  {['Home','Office','Site','Other'].map(l => (
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

          {/* Nearby drivers */}
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

          {/* Notes */}
          <div className="form-group">
            <label>Additional Notes (Optional)</label>
            <textarea
              placeholder="E.g. Gate code, landmark, best time to deliver..."
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
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
