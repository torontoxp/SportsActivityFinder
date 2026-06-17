import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

let cachedSportsData = null;

export async function fetchSports() {
  if (cachedSportsData) {
    return cachedSportsData;
  }
  const { data } = await axios.get(`${API_BASE}/sports`);
  if (data && Array.isArray(data.sports)) {
    data.sports = data.sports.map(s => {
      if (s.icon && s.icon.startsWith('/')) {
        return { ...s, icon: `${import.meta.env.BASE_URL}${s.icon.slice(1)}` };
      }
      return s;
    });
  }
  cachedSportsData = data;
  return data;
}

// ── Schedules for a sport ────────────────────────────────────────────────────
export async function fetchSchedules(sport) {
  const { data } = await axios.get(`${API_BASE}/sports/${encodeURIComponent(sport)}/schedules`);
  return data;
}
