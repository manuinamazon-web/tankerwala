import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import CustomerDashboard from './pages/CustomerDashboard'
import DriverDashboard from './pages/DriverDashboard'
import AdminDashboard from './pages/AdminDashboard'
import PostRequest from './pages/PostRequest'
import ViewBids from './pages/ViewBids'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    let retries = 5
    while (retries > 0) {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (data) {
        setProfile(data)
        setLoading(false)
        return
      }
      retries--
      await new Promise(r => setTimeout(r, 800))
    }
    setLoading(false)
  }

  if (loading) return <div className="spinner" style={{marginTop:'40vh'}}></div>

  function getHome() {
    if (!user || !profile) return <Home />
    if (profile.role === 'admin') return <Navigate to="/admin" />
    if (profile.role === 'driver') return <Navigate to="/driver" />
    if (profile.role === 'customer') return <Navigate to="/customer" />
    return <Home />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={getHome()} />
        <Route path="/login" element={!user ? <Login /> : getHome()} />
        <Route path="/register" element={!user ? <Register /> : getHome()} />
        <Route path="/customer" element={user && profile?.role === 'customer' ? <CustomerDashboard profile={profile} /> : <Navigate to="/" />} />
        <Route path="/customer/post" element={user && profile?.role === 'customer' ? <PostRequest profile={profile} /> : <Navigate to="/" />} />
        <Route path="/customer/bids/:requestId" element={user && profile?.role === 'customer' ? <ViewBids profile={profile} /> : <Navigate to="/" />} />
        <Route path="/driver" element={user && profile?.role === 'driver' ? <DriverDashboard profile={profile} setProfile={setProfile} /> : <Navigate to="/" />} />
        <Route path="/admin" element={user && profile?.role === 'admin' ? <AdminDashboard profile={profile} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
