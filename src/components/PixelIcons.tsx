import type { ItemId, TimePhase, WeatherType } from '../game/types';

export function ItemIcon({ id, className = 'w-6 h-6' }: { id: ItemId; className?: string }) {
  switch (id) {
    case 'hoe':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="16" width="4" height="4" fill="#6b4528" />
          <rect x="7" y="13" width="4" height="4" fill="#8c5a35" />
          <rect x="10" y="10" width="4" height="4" fill="#8c5a35" />
          <rect x="13" y="7" width="4" height="4" fill="#8c5a35" />
          <rect x="13" y="4" width="7" height="3" fill="#aeb6bf" />
          <rect x="17" y="7" width="3" height="4" fill="#8a929a" />
        </svg>
      );
    case 'watering_can':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="9" width="10" height="10" fill="#4f8fba" />
          <rect x="9" y="10" width="8" height="3" fill="#77b5de" />
          <rect x="10" y="5" width="6" height="4" fill="#3a6d91" />
          <rect x="4" y="11" width="4" height="3" fill="#4f8fba" />
          <rect x="3" y="9" width="2" height="4" fill="#77b5de" />
          <rect x="18" y="11" width="3" height="6" fill="#3a6d91" />
        </svg>
      );
    case 'axe':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="16" width="4" height="4" fill="#6b4528" />
          <rect x="8" y="13" width="4" height="4" fill="#8c5a35" />
          <rect x="11" y="10" width="4" height="4" fill="#8c5a35" />
          <rect x="13" y="4" width="6" height="7" fill="#9ca4ad" />
          <rect x="17" y="5" width="3" height="6" fill="#dce3eb" />
        </svg>
      );
    case 'wheat_seed':
    case 'carrot_seed':
    case 'tomato_seed':
    case 'strawberry_seed':
    case 'pumpkin_seed':
    case 'bean_seed':
    case 'corn_seed':
    case 'watermelon_seed':
    case 'lavender_seed': {
      const accent =
        id === 'wheat_seed'
          ? '#e6b84c'
          : id === 'carrot_seed'
          ? '#e8782b'
          : id === 'tomato_seed'
          ? '#d93829'
          : id === 'strawberry_seed'
          ? '#e03e52'
          : id === 'bean_seed'
          ? '#6cb84d'
          : id === 'corn_seed'
          ? '#eab308'
          : id === 'watermelon_seed'
          ? '#22c55e'
          : id === 'lavender_seed'
          ? '#9333ea'
          : '#de6f1f';
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="6" width="12" height="14" rx="1" fill="#d9be8c" stroke="#6b4528" strokeWidth="2" />
          <rect x="8" y="4" width="8" height="3" fill="#b89863" />
          <rect x="9" y="10" width="6" height="6" fill={accent} />
          <rect x="10" y="9" width="4" height="2" fill="#4e963e" />
        </svg>
      );
    }
    case 'fertilizer':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="7" width="14" height="14" rx="2" fill="#5c3d24" stroke="#362213" strokeWidth="1.5" />
          <rect x="8" y="4" width="8" height="3" fill="#7d5333" />
          <rect x="9" y="11" width="6" height="6" fill="#4ade80" />
          <rect x="11" y="9" width="2" height="4" fill="#22c55e" />
        </svg>
      );
    case 'wheat':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="11" y="11" width="2" height="9" fill="#c99a32" />
          <rect x="9" y="5" width="6" height="7" fill="#e6b84c" />
          <rect x="10" y="4" width="4" height="4" fill="#f7de8a" />
        </svg>
      );
    case 'carrot':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="9" y="4" width="6" height="5" fill="#5fa845" />
          <rect x="9" y="9" width="6" height="7" fill="#e8782b" />
          <rect x="10" y="16" width="4" height="4" fill="#d4621a" />
        </svg>
      );
    case 'tomato':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="10" y="5" width="4" height="3" fill="#4e913d" />
          <rect x="6" y="8" width="12" height="10" rx="2" fill="#d93829" />
          <rect x="8" y="10" width="3" height="3" fill="#f27d72" />
        </svg>
      );
    case 'strawberry':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="9" y="5" width="6" height="3" fill="#4e913d" />
          <rect x="7" y="8" width="10" height="8" fill="#e03e52" />
          <rect x="9" y="16" width="6" height="3" fill="#c72c3f" />
          <rect x="9" y="10" width="2" height="2" fill="#fff5d6" />
          <rect x="13" y="12" width="2" height="2" fill="#fff5d6" />
        </svg>
      );
    case 'pumpkin':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="11" y="4" width="2" height="4" fill="#477d34" />
          <rect x="5" y="8" width="14" height="11" rx="2" fill="#de6f1f" />
          <rect x="9" y="9" width="6" height="9" fill="#f7a541" />
        </svg>
      );
    case 'bean':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="10" y="4" width="4" height="3" fill="#387d32" />
          <rect x="6" y="7" width="5" height="12" rx="2" fill="#5fa845" />
          <rect x="13" y="8" width="5" height="12" rx="2" fill="#5fa845" />
          <rect x="7" y="9" width="3" height="7" fill="#b7e378" />
          <rect x="14" y="10" width="3" height="7" fill="#b7e378" />
        </svg>
      );
    case 'corn':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="9" y="5" width="6" height="12" rx="2" fill="#eab308" />
          <rect x="10" y="6" width="4" height="9" fill="#fef08a" />
          <rect x="6" y="12" width="4" height="8" fill="#4e913d" />
          <rect x="14" y="12" width="4" height="8" fill="#4e913d" />
        </svg>
      );
    case 'watermelon':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="10" y="4" width="4" height="3" fill="#387d32" />
          <rect x="5" y="7" width="14" height="12" rx="4" fill="#16a34a" />
          <rect x="8" y="8" width="2" height="10" fill="#14532d" />
          <rect x="14" y="8" width="2" height="10" fill="#14532d" />
        </svg>
      );
    case 'lavender':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="11" y="13" width="2" height="7" fill="#4e913d" />
          <rect x="8" y="6" width="3" height="8" fill="#9333ea" />
          <rect x="13" y="7" width="3" height="8" fill="#9333ea" />
          <rect x="10" y="4" width="4" height="8" fill="#c084fc" />
        </svg>
      );
    case 'fence':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="5" width="4" height="15" fill="#8c5a33" />
          <rect x="15" y="5" width="4" height="15" fill="#8c5a33" />
          <rect x="3" y="9" width="18" height="3" fill="#6b4426" />
          <rect x="3" y="14" width="18" height="3" fill="#6b4426" />
        </svg>
      );
    case 'scarecrow':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="11" y="9" width="2" height="12" fill="#6b4528" />
          <rect x="5" y="11" width="14" height="2" fill="#6b4528" />
          <rect x="8" y="10" width="8" height="7" fill="#4c6e91" />
          <rect x="9" y="5" width="6" height="5" fill="#e0b879" />
          <rect x="7" y="4" width="10" height="2" fill="#c9933b" />
        </svg>
      );
    case 'lantern':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="7" y="18" width="10" height="3" fill="#6e757a" />
          <rect x="10" y="13" width="4" height="5" fill="#6e757a" />
          <rect x="8" y="8" width="8" height="5" fill="#ffe073" />
          <rect x="6" y="5" width="12" height="3" fill="#8f969c" />
        </svg>
      );
    case 'flowerbed':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="11" width="16" height="9" fill="#734b2e" />
          <rect x="6" y="9" width="12" height="4" fill="#4e963e" />
          <rect x="7" y="7" width="3" height="3" fill="#e86884" />
          <rect x="11" y="8" width="3" height="3" fill="#f5d259" />
          <rect x="15" y="7" width="3" height="3" fill="#78b8eb" />
        </svg>
      );
    case 'stone_path':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="5" width="7" height="6" fill="#9ea6ad" />
          <rect x="13" y="5" width="7" height="6" fill="#889096" />
          <rect x="4" y="13" width="8" height="6" fill="#889096" />
          <rect x="14" y="13" width="6" height="6" fill="#9ea6ad" />
        </svg>
      );
    case 'wood':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="9" width="16" height="6" fill="#7d4e2d" />
          <rect x="5" y="10" width="12" height="3" fill="#9e663d" />
          <rect x="17" y="10" width="3" height="4" fill="#d9b07e" />
        </svg>
      );
    case 'stone':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="10" width="14" height="9" fill="#7c8288" />
          <rect x="7" y="7" width="9" height="6" fill="#a0a8b0" />
          <rect x="8" y="8" width="4" height="3" fill="#c5ccd4" />
        </svg>
      );
    case 'sprinkler':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="7" y="14" width="10" height="6" fill="#5e6870" />
          <rect x="10" y="9" width="4" height="6" fill="#8895a1" />
          <rect x="5" y="7" width="14" height="3" fill="#2b5a8a" />
          <rect x="6" y="7" width="12" height="2" fill="#4aa3e8" />
          <rect x="4" y="10" width="2" height="2" fill="#99e1ff" />
          <rect x="18" y="10" width="2" height="2" fill="#99e1ff" />
        </svg>
      );
    case 'sensor':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="10" y="11" width="4" height="10" fill="#6b4528" />
          <rect x="7" y="7" width="10" height="7" fill="#3a4c59" />
          <rect x="9" y="9" width="6" height="3" fill="#3be083" />
          <rect x="11" y="3" width="2" height="4" fill="#98a8b5" />
          <rect x="10" y="2" width="4" height="2" fill="#54f29c" />
        </svg>
      );
    case 'compost':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="9" width="16" height="11" fill="#6b4528" />
          <rect x="6" y="11" width="12" height="3" fill="#402818" />
          <rect x="6" y="8" width="12" height="3" fill="#4f9c3e" />
          <rect x="10" y="5" width="4" height="3" fill="#77c756" />
          <rect x="4" y="15" width="16" height="2" fill="#8c5a35" />
        </svg>
      );
    case 'egg':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="6" width="8" height="12" rx="3" fill="#faf0dc" stroke="#c9b086" strokeWidth="1.5" />
          <rect x="9" y="8" width="3" height="4" fill="#ffffff" />
        </svg>
      );
    case 'nasa_station':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="11" y="9" width="2" height="11" fill="#cbd5e1" />
          <rect x="8" y="18" width="8" height="2" fill="#64748b" />
          <rect x="6" y="4" width="10" height="6" rx="1" fill="#f8fafc" />
          <rect x="8" y="5" width="6" height="4" fill="#38bdf8" />
          <rect x="14" y="11" width="6" height="4" fill="#1e40af" />
          <rect x="11" y="2" width="2" height="2" fill="#4ade80" />
        </svg>
      );
    case 'rain_tank':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="6" width="12" height="14" rx="1" fill="#355873" />
          <rect x="7" y="4" width="10" height="3" fill="#4f7fa3" />
          <rect x="9" y="9" width="6" height="9" fill="#1a2b38" />
          <rect x="10" y="12" width="4" height="5" fill="#38bdf8" />
        </svg>
      );
    case 'shade_net':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="8" width="2" height="12" fill="#6b4528" />
          <rect x="18" y="8" width="2" height="12" fill="#6b4528" />
          <rect x="3" y="5" width="18" height="7" fill="#1e5f74" />
          <rect x="5" y="7" width="4" height="3" fill="#38a3a5" />
          <rect x="11" y="7" width="4" height="3" fill="#38a3a5" />
          <rect x="17" y="7" width="2" height="3" fill="#38a3a5" />
        </svg>
      );
    case 'drip_sprinkler':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="3" y="13" width="18" height="3" fill="#334155" />
          <rect x="9" y="8" width="6" height="6" fill="#0ea5e9" />
          <rect x="10" y="6" width="4" height="2" fill="#eab308" />
          <rect x="5" y="17" width="2" height="3" fill="#7dd3fc" />
          <rect x="17" y="17" width="2" height="3" fill="#7dd3fc" />
        </svg>
      );
    case 'beehive':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="7" y="16" width="2" height="4" fill="#6b4528" />
          <rect x="15" y="16" width="2" height="4" fill="#6b4528" />
          <rect x="5" y="7" width="14" height="10" rx="2" fill="#d99226" />
          <rect x="6" y="5" width="12" height="3" fill="#f2b84b" />
          <rect x="5" y="11" width="14" height="2" fill="#a86514" />
          <rect x="10" y="13" width="4" height="4" fill="#2b1c12" />
          <rect x="17" y="4" width="3" height="2" fill="#fde047" />
        </svg>
      );
    case 'honey':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="4" width="8" height="3" fill="#8c5a35" />
          <rect x="6" y="7" width="12" height="13" rx="2" fill="#f59e0b" stroke="#92400e" strokeWidth="1.5" />
          <rect x="8" y="9" width="4" height="7" fill="#fde047" />
          <rect x="9" y="13" width="6" height="3" fill="#fef3c7" />
        </svg>
      );
    case 'milk':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="4" width="8" height="3" fill="#60a5fa" />
          <rect x="7" y="7" width="10" height="13" rx="1" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
          <rect x="9" y="11" width="6" height="4" fill="#bfdbfe" />
        </svg>
      );
    case 'wool':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="8" width="12" height="9" rx="3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="8" y="6" width="8" height="4" rx="2" fill="#ffffff" />
          <rect x="9" y="11" width="6" height="4" fill="#e2e8f0" />
        </svg>
      );
    case 'cheese':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 16L13 6l7 4v6H4z" fill="#facc15" stroke="#b45309" strokeWidth="1.5" />
          <circle cx="11" cy="13" r="1.5" fill="#d97706" />
          <circle cx="16" cy="12" r="1.2" fill="#d97706" />
        </svg>
      );
    case 'strawberry_jam':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="4" width="8" height="3" fill="#e2e8f0" />
          <rect x="6" y="7" width="12" height="13" rx="2" fill="#e11d48" stroke="#881337" strokeWidth="1.5" />
          <rect x="8" y="10" width="8" height="5" fill="#fda4af" />
          <rect x="10" y="11" width="4" height="3" fill="#be123c" />
        </svg>
      );
    case 'fish':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="10" width="4" height="4" fill="#38bdf8" />
          <rect x="7" y="8" width="11" height="8" rx="3" fill="#0ea5e9" />
          <rect x="10" y="10" width="6" height="4" fill="#bae6fd" />
          <rect x="15" y="10" width="2" height="2" fill="#0f172a" />
        </svg>
      );
    case 'cheese_press':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="12" width="14" height="8" fill="#8c5a35" />
          <rect x="7" y="9" width="10" height="4" fill="#facc15" />
          <rect x="11" y="4" width="2" height="7" fill="#64748b" />
          <rect x="8" y="4" width="8" height="2" fill="#94a3b8" />
        </svg>
      );
    case 'jam_maker':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2" fill="#7c2d12" />
          <rect x="7" y="7" width="10" height="4" fill="#e11d48" />
          <rect x="9" y="4" width="6" height="3" fill="#94a3b8" />
          <rect x="8" y="14" width="8" height="3" fill="#fb923c" />
        </svg>
      );
    case 'windmill':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="8" y="10" width="8" height="11" fill="#d9be8c" />
          <rect x="9" y="7" width="6" height="4" fill="#b34b39" />
          <rect x="4" y="9" width="16" height="2" fill="#6b4528" />
          <rect x="11" y="2" width="2" height="16" fill="#6b4528" />
        </svg>
      );
    case 'wishing_fountain':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="14" width="16" height="6" rx="1" fill="#94a3b8" />
          <rect x="6" y="12" width="12" height="3" fill="#38bdf8" />
          <rect x="10" y="7" width="4" height="7" fill="#cbd5e1" />
          <rect x="11" y="4" width="2" height="3" fill="#fde047" />
        </svg>
      );
  }
}

export function WeatherIcon({ weather, className = 'w-5 h-5' }: { weather: WeatherType; className?: string }) {
  if (weather === 'Clear') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="#f7c844" />
        <rect x="11" y="2" width="2" height="3" fill="#f7c844" />
        <rect x="11" y="19" width="2" height="3" fill="#f7c844" />
        <rect x="2" y="11" width="3" height="2" fill="#f7c844" />
        <rect x="19" y="11" width="3" height="2" fill="#f7c844" />
      </svg>
    );
  }
  if (weather === 'Heatwave') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="9" r="5" fill="#ff5722" />
        <circle cx="12" cy="9" r="3" fill="#ffb74d" />
        <path d="M5 17q2-2 4 0t4 0t4 0t4 0" fill="none" stroke="#ff7043" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 21q2-2 4 0t4 0t4 0" fill="none" stroke="#ffab40" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (weather === 'Drought') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="10" r="5" fill="#eb6c34" />
        <rect x="4" y="18" width="16" height="2" fill="#f2a649" />
        <rect x="6" y="21" width="12" height="2" fill="#eb6c34" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="6" width="14" height="7" rx="3" fill="#8da4bd" />
      <rect x="8" y="4" width="8" height="4" rx="2" fill="#b3c6db" />
      <rect x="7" y="15" width="2" height="5" fill="#63b3ed" />
      <rect x="12" y="16" width="2" height="5" fill="#63b3ed" />
      <rect x="16" y="14" width="2" height="5" fill="#63b3ed" />
    </svg>
  );
}

export function TimeIcon({ phase, className = 'w-4 h-4' }: { phase: TimePhase; className?: string }) {
  if (phase === 'Day') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="6" fill="#ffd859" />
      </svg>
    );
  }
  if (phase === 'Sunset') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M5 16h14v2H5z" fill="#e87a46" />
        <path d="M7 16a5 5 0 0 1 10 0z" fill="#f5a142" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 4a7 7 0 1 0 6 10 6 6 0 0 1-6-10z" fill="#b7ccff" />
    </svg>
  );
}

export function HeartIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 20s-7-4.5-8.5-9.2C2.3 7.1 5 4 8.3 4c1.7 0 3.1.9 3.7 2.2C12.6 4.9 14 4 15.7 4 19 4 21.7 7.1 20.5 10.8 19 15.5 12 20 12 20z" fill="#e04848" stroke="#451212" strokeWidth="1.5" />
    </svg>
  );
}

export function BoltIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M13 2L5 14h6l-1 8 9-12h-6l0-8z" fill="#f2c038" stroke="#4f3808" strokeWidth="1.5" />
    </svg>
  );
}

export function CoinIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="#f2c038" stroke="#6b4a0c" strokeWidth="2" />
      <rect x="11" y="7" width="2" height="10" fill="#fff0a6" />
    </svg>
  );
}

export function ChickenIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="10" width="10" height="8" fill="#f7f1e1" />
      <rect x="13" y="6" width="5" height="6" fill="#f7f1e1" />
      <rect x="14" y="4" width="3" height="2" fill="#d93829" />
      <rect x="18" y="8" width="2" height="2" fill="#f2a634" />
      <rect x="15" y="7" width="2" height="2" fill="#26180f" />
      <rect x="9" y="18" width="2" height="3" fill="#e8942e" />
      <rect x="13" y="18" width="2" height="3" fill="#e8942e" />
    </svg>
  );
}

export function CowIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="9" width="13" height="9" rx="1" fill="#f8fafc" />
      <rect x="7" y="11" width="4" height="4" fill="#334155" />
      <rect x="13" y="13" width="3" height="3" fill="#334155" />
      <rect x="15" y="6" width="6" height="6" fill="#f8fafc" />
      <rect x="17" y="10" width="4" height="3" fill="#f4a2b8" />
      <rect x="7" y="18" width="2" height="3" fill="#334155" />
      <rect x="14" y="18" width="2" height="3" fill="#334155" />
    </svg>
  );
}

export function SheepIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="8" width="12" height="9" rx="3" fill="#f8fafc" />
      <rect x="7" y="6" width="8" height="4" rx="2" fill="#ffffff" />
      <rect x="15" y="9" width="5" height="5" fill="#334155" />
      <rect x="7" y="17" width="2" height="3" fill="#334155" />
      <rect x="13" y="17" width="2" height="3" fill="#334155" />
    </svg>
  );
}

export function DogIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="11" width="11" height="7" fill="#c27a3d" />
      <rect x="13" y="6" width="6" height="6" fill="#c27a3d" />
      <rect x="13" y="5" width="2" height="3" fill="#7c471e" />
      <rect x="17" y="9" width="3" height="2" fill="#26180f" />
      <rect x="13" y="11" width="4" height="2" fill="#ef4444" />
      <rect x="6" y="18" width="2" height="3" fill="#925828" />
      <rect x="13" y="18" width="2" height="3" fill="#925828" />
    </svg>
  );
}
