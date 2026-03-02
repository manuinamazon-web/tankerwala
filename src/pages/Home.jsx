import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0D47A1 0%, #1565C0 50%, #1976D2 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center'
    }}>
      <div style={{fontSize:'72px', marginBottom:'16px'}}>🚛</div>
      <h1 style={{
        fontFamily:"'Baloo 2',cursive", fontSize:'42px', fontWeight:800,
        color:'white', marginBottom:'8px', lineHeight:1.1
      }}>
        Tanker<span style={{color:'#FFA000'}}>Wala</span>
      </h1>
      <p style={{color:'rgba(255,255,255,0.85)', fontSize:'16px', marginBottom:'8px'}}>
        Water & Sewage Tanker Booking
      </p>
      <p style={{color:'rgba(255,255,255,0.65)', fontSize:'14px', marginBottom:'40px'}}>
        Bengaluru's fastest tanker marketplace
      </p>

      <div style={{width:'100%', maxWidth:'360px', display:'flex', flexDirection:'column', gap:'14px'}}>
        <button className="btn-orange" onClick={() => navigate('/login')}>
          Login to Your Account
        </button>
        <button
          onClick={() => navigate('/register')}
          style={{
            background:'rgba(255,255,255,0.15)', color:'white',
            border:'2px solid rgba(255,255,255,0.4)',
            padding:'14px', borderRadius:'12px', fontSize:'16px', fontWeight:600
          }}>
          Create New Account
        </button>
      </div>

      <div style={{
        marginTop:'48px', display:'flex', gap:'32px',
        color:'rgba(255,255,255,0.7)', fontSize:'13px'
      }}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'24px'}}>💧</div>
          <div>Water Tankers</div>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'24px'}}>🚰</div>
          <div>Sewage Tankers</div>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'24px'}}>⚡</div>
          <div>Live Bidding</div>
        </div>
      </div>

      <p style={{marginTop:'40px', color:'rgba(255,255,255,0.4)', fontSize:'12px'}}>
        Platform connects independent contractors. Terms apply.
      </p>
    </div>
  )
}
