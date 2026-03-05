const VAPID_PUBLIC_KEY = 'BHoZen-Y01F8ggJiEhw40rjq5D99NRF8KbX7yikHtbthewdP51GUtZGKJwZYcsnE99ZVyit3ubs_iGauR95tyko'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

export async function registerPushNotifications(driverId, supabase) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications not supported')
      return false
    }

    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // Request permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('Notification permission denied')
      return false
    }

    // Subscribe to push
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    // Save subscription to database
    await supabase.from('push_subscriptions').upsert({
      driver_id: driverId,
      subscription: subscription.toJSON()
    }, { onConflict: 'driver_id' })

    console.log('Push notifications registered!')
    return true
  } catch (err) {
    console.error('Push registration failed:', err)
    return false
  }
}

export async function sendPushToDriver(driverId, title, body) {
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ driver_id: driverId, title, body })
    })
  } catch (err) {
    console.error('Push send failed:', err)
  }
}

export async function setDriverOnline(driverId, isOnline, supabase) {
  await supabase.from('profiles').update({
    is_online: isOnline,
    last_seen: new Date().toISOString()
  }).eq('id', driverId)
}
