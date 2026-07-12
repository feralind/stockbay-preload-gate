// @ts-check
/** Trader profile — name + avatar (persists across desk resets) */

const PROFILE_KEY = 'stockway_profile_v1';
const DEFAULT_NAME = 'Paper Trader';
const DEFAULT_COSMETICS = {
  dashboard: null,
  background: null,
  badge: null,
  title: null,
};

let profile = {
  name: DEFAULT_NAME,
  avatar: null, // data URL or null
  cosmetics: { ...DEFAULT_COSMETICS },
};

function sanitizeCosmetics(raw) {
  const out = { ...DEFAULT_COSMETICS };
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(DEFAULT_COSMETICS).forEach((slot) => {
    const v = raw[slot];
    out[slot] = (typeof v === 'string' && v.trim()) ? v.trim() : null;
  });
  return out;
}

export function getProfile() {
  return {
    ...profile,
    cosmetics: sanitizeCosmetics(profile.cosmetics),
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return getProfile();
    const data = JSON.parse(raw);
    if (data?.name && typeof data.name === 'string') {
      profile.name = data.name.trim().slice(0, 32) || DEFAULT_NAME;
    }
    if (typeof data?.avatar === 'string' && data.avatar.startsWith('data:image')) {
      profile.avatar = data.avatar;
    }
    profile.cosmetics = sanitizeCosmetics(data?.cosmetics);
  } catch (_) {}
  return getProfile();
}

export function saveProfile(next = {}) {
  if (next.name != null) {
    const n = String(next.name).trim().slice(0, 32);
    profile.name = n || DEFAULT_NAME;
  }
  if (next.avatar !== undefined) {
    profile.avatar = next.avatar || null;
  }
  if (next.cosmetics && typeof next.cosmetics === 'object') {
    profile.cosmetics = sanitizeCosmetics({
      ...profile.cosmetics,
      ...next.cosmetics,
    });
  }
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('Profile save failed', e);
  }
  return getProfile();
}

export function setProfileCosmetic(slot, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_COSMETICS, slot)) return getProfile();
  return saveProfile({
    cosmetics: {
      [slot]: (typeof value === 'string' && value.trim()) ? value.trim() : null,
    },
  });
}

export function clearAvatar() {
  return saveProfile({ avatar: null });
}

export function profileInitials(name = profile.name) {
  const parts = String(name || DEFAULT_NAME).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compress image file to a small square data URL for localStorage */
export function fileToAvatarDataUrl(file, size = 128) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Pick an image file'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('Image too large (max 4MB)'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
