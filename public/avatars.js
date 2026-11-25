// Funny Make-It-Meme-style expressive cartoon SVG avatars (zero OS emojis)
window.MEME_AVATARS = [
  {
    id: 'shocked-cat',
    label: 'חתול בשוק',
    bg: '#6c5ce7',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <polygon points="14,26 18,8 30,20" fill="#ffb86c"/>
      <polygon points="50,26 46,8 34,20" fill="#ffb86c"/>
      <circle cx="32" cy="36" r="20" fill="#ffbe76"/>
      <circle cx="24" cy="33" r="5.5" fill="#fff"/>
      <circle cx="40" cy="33" r="5.5" fill="#fff"/>
      <circle cx="24" cy="33" r="2.2" fill="#111"/>
      <circle cx="40" cy="33" r="2.2" fill="#111"/>
      <ellipse cx="32" cy="45" rx="4.5" ry="6" fill="#2d142c"/>
      <ellipse cx="32" cy="48" rx="3" ry="2.2" fill="#ff6b81"/>
      <path d="M12 36 L20 38 M12 41 L20 40 M52 36 L44 38 M52 41 L44 40" stroke="#7f4f24" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'cool-avocado',
    label: 'אבוקדו מגניב',
    bg: '#10b981',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8 C44 8, 52 28, 50 42 C48 54, 40 58, 32 58 C24 58, 16 54, 14 42 C12 28, 20 8, 32 8 Z" fill="#a3e635" stroke="#3f6212" stroke-width="2.5"/>
      <circle cx="32" cy="43" r="9" fill="#78350f"/>
      <circle cx="29" cy="40" r="2.5" fill="#a16207"/>
      <rect x="17" y="21" width="13" height="8" rx="2.5" fill="#111827"/>
      <rect x="34" y="21" width="13" height="8" rx="2.5" fill="#111827"/>
      <path d="M30 24 L34 24" stroke="#111827" stroke-width="2.5"/>
      <path d="M27 32 Q32 35 37 31" fill="none" stroke="#14532d" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'derp-frog',
    label: 'צפרדע הזויה',
    bg: '#06b6d4',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="21" cy="20" r="8" fill="#4ade80" stroke="#166534" stroke-width="2"/>
      <circle cx="43" cy="20" r="8" fill="#4ade80" stroke="#166534" stroke-width="2"/>
      <ellipse cx="32" cy="39" rx="22" ry="16" fill="#4ade80" stroke="#166534" stroke-width="2"/>
      <circle cx="21" cy="20" r="4.5" fill="#fff"/>
      <circle cx="43" cy="20" r="4.5" fill="#fff"/>
      <circle cx="19.5" cy="21" r="2" fill="#111"/>
      <circle cx="44.5" cy="19" r="2" fill="#111"/>
      <path d="M20 41 Q32 48 44 41" fill="none" stroke="#14532d" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M34 44 L36 52 Q38 54 40 51 L39 43" fill="#fb7185"/>
    </svg>`
  },
  {
    id: 'angry-falafel',
    label: 'פלאפל עצבני',
    bg: '#f59e0b',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="34" r="21" fill="#92400e" stroke="#451a03" stroke-width="2.5"/>
      <circle cx="22" cy="24" r="1.8" fill="#d97706"/><circle cx="41" cy="45" r="2" fill="#d97706"/><circle cx="20" cy="44" r="1.5" fill="#d97706"/>
      <path d="M18 25 L28 30 M46 25 L36 30" stroke="#111" stroke-width="3" stroke-linecap="round"/>
      <circle cx="24" cy="32" r="3" fill="#fff"/><circle cx="40" cy="32" r="3" fill="#fff"/>
      <circle cx="24" cy="32" r="1.5" fill="#111"/><circle cx="40" cy="32" r="1.5" fill="#111"/>
      <path d="M22 44 Q32 38 42 44" fill="none" stroke="#451a03" stroke-width="3" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'panicked-alien',
    label: 'חייזר מבוהל',
    bg: '#8b5cf6',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <line x1="32" y1="14" x2="32" y2="6" stroke="#a3e635" stroke-width="2.5"/>
      <circle cx="32" cy="6" r="3.5" fill="#fde047"/>
      <path d="M14 34 C14 18, 50 18, 50 34 C50 48, 40 56, 32 56 C24 56, 14 48, 14 34 Z" fill="#a3e635" stroke="#365314" stroke-width="2"/>
      <ellipse cx="23" cy="33" rx="5.5" ry="7" transform="rotate(-12 23 33)" fill="#111"/>
      <ellipse cx="41" cy="33" rx="5.5" ry="7" transform="rotate(12 41 33)" fill="#111"/>
      <circle cx="24" cy="31" r="1.8" fill="#fff"/><circle cx="40" cy="31" r="1.8" fill="#fff"/>
      <ellipse cx="32" cy="47" rx="4" ry="5" fill="#14532d"/>
    </svg>`
  },
  {
    id: 'smug-duck',
    label: 'ברווז חשדן',
    bg: '#ec4899',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="35" r="20" fill="#fde047" stroke="#a16207" stroke-width="2"/>
      <path d="M18 27 L29 29" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M35 29 L46 27" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="24" cy="31" r="2.2" fill="#111"/><circle cx="40" cy="31" r="2.2" fill="#111"/>
      <ellipse cx="32" cy="41" rx="10" ry="5" fill="#f97316" stroke="#9a3412" stroke-width="1.5"/>
      <path d="M25 41 Q32 44 39 41" fill="none" stroke="#7c2d12" stroke-width="1.5"/>
    </svg>`
  },
  {
    id: 'sleepy-panda',
    label: 'פנדה עייפה',
    bg: '#3b82f6',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="17" cy="18" r="7" fill="#1f2937"/><circle cx="47" cy="18" r="7" fill="#1f2937"/>
      <circle cx="32" cy="36" r="20" fill="#f9fafb" stroke="#1f2937" stroke-width="2"/>
      <ellipse cx="23" cy="34" rx="6" ry="7" transform="rotate(-15 23 34)" fill="#1f2937"/>
      <ellipse cx="41" cy="34" rx="6" ry="7" transform="rotate(15 41 34)" fill="#1f2937"/>
      <path d="M20 34 L26 34 M38 34 L44 34" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="32" cy="41" rx="3.2" ry="2.2" fill="#1f2937"/>
      <path d="M28 46 Q32 49 36 46" fill="none" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'laughing-dog',
    label: 'כלב צוחק',
    bg: '#f97316',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="30" rx="6" ry="12" transform="rotate(14 14 30)" fill="#92400e"/>
      <ellipse cx="50" cy="30" rx="6" ry="12" transform="rotate(-14 50 30)" fill="#92400e"/>
      <circle cx="32" cy="35" r="19" fill="#fcd34d" stroke="#78350f" stroke-width="2"/>
      <path d="M20 29 Q24 25 28 29 M36 29 Q40 25 44 29" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
      <ellipse cx="32" cy="36" rx="4" ry="2.8" fill="#111"/>
      <path d="M22 42 Q32 52 42 42 Z" fill="#7f1d1d"/>
      <ellipse cx="32" cy="47" rx="4" ry="4.5" fill="#fb7185"/>
    </svg>`
  },
];
