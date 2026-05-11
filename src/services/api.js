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
      if (s.sport === "Pickleball") return { ...s, icon: "/Pickleball.png" };
      if (s.sport === "Netball") return { ...s, icon: "/Netball.png" };
      if (s.sport === "Squash") return { ...s, icon: "/Squash.png" };
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
