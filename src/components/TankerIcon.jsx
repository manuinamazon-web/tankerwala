export function WaterTankerIcon({ size = 40 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="50" rx="65" ry="22" fill="#1976D2"/>
      <rect x="15" y="30" width="130" height="22" fill="#1976D2"/>
      <ellipse cx="80" cy="30" rx="65" ry="14" fill="#1E88E5"/>
      <ellipse cx="60" cy="26" rx="35" ry="6" fill="white" opacity="0.2"/>
      <path d="M20 46 Q35 40 50 46 Q65 52 80 46 Q95 40 110 46 Q125 52 140 46"
        stroke="#90CAF9" strokeWidth="2" fill="none" opacity="0.7"/>
      <path d="M72 32 Q80 20 88 32 Q92 40 80 43 Q68 40 72 32Z" fill="white" opacity="0.9"/>
      <rect x="15" y="50" width="130" height="35" fill="#1565C0" rx="4"/>
      <rect x="145" y="58" width="25" height="8" fill="#0D47A1" rx="3"/>
      <circle cx="172" cy="62" r="5" fill="#0D47A1"/>
      <circle cx="172" cy="62" r="2" fill="#42A5F5"/>
      <rect x="145" y="50" width="40" height="35" fill="#1565C0" rx="4"/>
      <rect x="150" y="53" width="30" height="18" fill="#90CAF9" rx="3" opacity="0.8"/>
      <rect x="152" y="55" width="12" height="8" fill="white" rx="2" opacity="0.4"/>
      <circle cx="40" cy="88" r="12" fill="#212121"/>
      <circle cx="40" cy="88" r="7" fill="#424242"/>
      <circle cx="40" cy="88" r="3" fill="#BDBDBD"/>
      <circle cx="95" cy="88" r="12" fill="#212121"/>
      <circle cx="95" cy="88" r="7" fill="#424242"/>
      <circle cx="95" cy="88" r="3" fill="#BDBDBD"/>
      <circle cx="158" cy="88" r="12" fill="#212121"/>
      <circle cx="158" cy="88" r="7" fill="#424242"/>
      <circle cx="158" cy="88" r="3" fill="#BDBDBD"/>
    </svg>
  )
}

export function SewageTankerIcon({ size = 40 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="50" rx="65" ry="22" fill="#388E3C"/>
      <rect x="15" y="30" width="130" height="22" fill="#388E3C"/>
      <ellipse cx="80" cy="30" rx="65" ry="14" fill="#43A047"/>
      <ellipse cx="60" cy="26" rx="35" ry="6" fill="white" opacity="0.15"/>
      <ellipse cx="80" cy="22" rx="15" ry="6" fill="#2E7D32"/>
      <ellipse cx="80" cy="22" rx="12" ry="4.5" fill="#1B5E20"/>
      <rect x="76" y="19" width="8" height="2" fill="#4CAF50" rx="1"/>
      <rect x="76" y="23" width="8" height="2" fill="#4CAF50" rx="1"/>
      <rect x="145" y="56" width="28" height="10" fill="#1B5E20" rx="3"/>
      <circle cx="175" cy="61" r="6" fill="#1B5E20"/>
      <circle cx="175" cy="61" r="3" fill="#33691E"/>
      <rect x="15" y="62" width="130" height="5" fill="#FDD835" opacity="0.35"/>
      <rect x="15" y="50" width="130" height="35" fill="#2E7D32" rx="4"/>
      <rect x="145" y="50" width="40" height="35" fill="#2E7D32" rx="4"/>
      <rect x="150" y="53" width="30" height="18" fill="#A5D6A7" rx="3" opacity="0.8"/>
      <rect x="152" y="55" width="12" height="8" fill="white" rx="2" opacity="0.3"/>
      <circle cx="80" cy="40" r="8" fill="#1B5E20" opacity="0.8"/>
      <text x="80" y="44" fontFamily="Arial" fontSize="10" fill="#A5D6A7"
        textAnchor="middle" fontWeight="bold">S</text>
      <circle cx="40" cy="88" r="12" fill="#212121"/>
      <circle cx="40" cy="88" r="7" fill="#424242"/>
      <circle cx="40" cy="88" r="3" fill="#BDBDBD"/>
      <circle cx="95" cy="88" r="12" fill="#212121"/>
      <circle cx="95" cy="88" r="7" fill="#424242"/>
      <circle cx="95" cy="88" r="3" fill="#BDBDBD"/>
      <circle cx="158" cy="88" r="12" fill="#212121"/>
      <circle cx="158" cy="88" r="7" fill="#424242"/>
      <circle cx="158" cy="88" r="3" fill="#BDBDBD"/>
    </svg>
  )
}

export function TankerIcon({ type = 'water', size = 40 }) {
  return type === 'water'
    ? <WaterTankerIcon size={size} />
    : <SewageTankerIcon size={size} />
}
