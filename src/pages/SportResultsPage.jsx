import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchedules } from "../services/api";
import { trackTelemetryDeckEvent, goatCounterEvent, simpleAnalyticsEvent } from "../telemetry";
import FilterBar from "../components/FilterBar";
import ScheduleTable from "../components/ScheduleTable";
import "./SportResultsPage.css";

const SPORT_ICONS = {
  "Lacrosse": "🥍",
  "Table Tennis": "🏓",
  "Badminton": "🏸",
  "Basketball": "🏀",
  "Swimming": "🏊",
  "Soccer": "⚽",
  "Yoga": "🧘",
  "Rock Wall Climbing": "🧗",
  "Rock Climbing": "🧗",
  "Pickleball": `${import.meta.env.BASE_URL}Pickleball.png`,
  "Squash": `${import.meta.env.BASE_URL}Squash.png`,
  "Volleyball": "🏐",
  "Ball Hockey": "🏑",
  "Roller Hockey": `${import.meta.env.BASE_URL}RollerHockey.png`,
  "Open Gym": "🤸",
  "Multi-Sport": "🤹",
  "Dodgeball": "🤾",
  "Netball": `${import.meta.env.BASE_URL}Netball.png`,
  "Bocce": `${import.meta.env.BASE_URL}Bocce.png`,
  "Carpet Bowling": `${import.meta.env.BASE_URL}Bowling.png`,
  "Skateboarding": "🛹",
  "Ultimate": "𥏏",
  "Archery": "🏹",
  "Baseball": "⚾",
  "Cricket": "🏏",
  "Golf": "⛳",
  "Lawn Bowling": `${import.meta.env.BASE_URL}Bowling.png`,
  "Tennis": "🎾",
};

const DEFAULT_FILTERS = {
  days: [],
  ageRange: [0, 99],
  costs: [],
  tags: [],
  centres: [],
  centreSearchText: "",
};

function parseAgeStr(ageStr) {
  if (!ageStr) return { min: 0, max: 99 };
  if (ageStr.includes('-')) {
    const parts = ageStr.split('-');
    return { min: parseInt(parts[0], 10) || 0, max: parseInt(parts[1], 10) || 99 };
  }
  if (ageStr.includes('+')) {
    return { min: parseInt(ageStr.replace('+', ''), 10) || 0, max: 99 };
  }
  return { min: 0, max: 99 };
}

export default function SportResultsPage() {
  const { sportName } = useParams();
  const sport = decodeURIComponent(sportName);

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Distance Sort & Geolocation State
  const [userLocation, setUserLocation] = useState(null);
  const [isDistanceSortActive, setIsDistanceSortActive] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Now Sort State
  const [isNowSortActive, setIsNowSortActive] = useState(false);

  // Resolve icon from local map
  const icon = SPORT_ICONS[sport] ?? "🏅";

  // Pre-warm location if permission was already granted previously
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (result.state === "granted") {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => { },
            { enableHighAccuracy: false, maximumAge: 600000, timeout: 5000 }
          );
        }
      }).catch(() => { });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
    setIsDistanceSortActive(false);
    setLocationError(null);
    trackTelemetryDeckEvent(`sport_visited:${sport}`);
    fetchSchedules(sport)
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, [sport]);

  const handleToggleDistanceSort = () => {
    if (isDistanceSortActive) {
      setIsDistanceSortActive(false);
      setLocationError(null);
      return;
    }

    setIsNowSortActive(false); // disable Now sort if Distance sort is activated

    if (userLocation) {
      setIsDistanceSortActive(true);
      setLocationError(null);
      trackTelemetryDeckEvent("sort_by_distance_enabled");
      goatCounterEvent("sort_by_distance_enabled", true);
      simpleAnalyticsEvent("sort_by_distance_enabled");
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    // Check secure context for Safari / Mobile browsers
    if (window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setLocationError(
        "Safari requires a secure HTTPS connection to request location permissions. Please access this site via HTTPS."
      );
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    const geoSuccess = (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setUserLocation(coords);
      setIsDistanceSortActive(true);
      setLocationLoading(false);
      trackTelemetryDeckEvent("sort_by_distance_enabled");
      goatCounterEvent("sort_by_distance_enabled", true);
      simpleAnalyticsEvent("sort_by_distance_enabled");
    };

    const geoError = (error) => {
      setLocationLoading(false);
      setIsDistanceSortActive(false);
      if (error.code === error.PERMISSION_DENIED) {
        setLocationError(
          "Location permission was denied. Please enable location access to use distance sorting."
        );
      } else if (error.code === error.TIMEOUT) {
        setLocationError(
          "Location request timed out. Please ensure Location Services are enabled on your device and try again."
        );
      } else {
        setLocationError(
          "Unable to determine your location. Please check your browser location settings and try again."
        );
      }
    };

    // Fast, cached location options
    const options = {
      enableHighAccuracy: false, // Fast network/Wi-Fi positioning without hardware GPS warmup delay
      timeout: 10000,
      maximumAge: 300000, // Reuse cached position from last 5 mins if available
    };

    navigator.geolocation.getCurrentPosition(geoSuccess, geoError, options);
  };

  const handleToggleNowSort = () => {
    if (!isNowSortActive) {
      setIsDistanceSortActive(false); // disable Distance sort if Now sort is activated
      setFilters(prev => ({ ...prev, days: [] })); // Reset days selection filter
      trackTelemetryDeckEvent("sort_by_now_enabled");
      goatCounterEvent("sort_by_now_enabled", true);
      simpleAnalyticsEvent("sort_by_now_enabled");
      
      // Silently request location to show distance
      if (!userLocation && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            // Ignore error, just skip distance
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      }
    }
    setIsNowSortActive(!isNowSortActive);
  };

  // ── Client-side filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const DAY_MAP = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

    function parseTimeToMinutes(timeStr) {
      if (!timeStr) return 0;
      const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
      if (!match) return 0;
      let h = parseInt(match[1], 10);
      const m = match[2] ? parseInt(match[2], 10) : 0;
      const ampm = match[3].toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }

    function isScheduleActiveOrUpcoming(row) {
      const today = new Date();
      const currentDay = today.getDay();
      const currentTotal = today.getHours() * 60 + today.getMinutes();
      const targetDay = DAY_MAP[row.day_of_week?.toUpperCase()];
      if (targetDay === undefined) return true;

      const daysDiff = targetDay - currentDay;
      if (daysDiff > 0) return true;   // future day this week
      if (daysDiff < 0) return false;   // past day this week

      // Same day — check if any slot hasn't ended yet
      for (const slot of (row.slots || [])) {
        const [, endStr] = slot.split('-');
        const endTotal = parseTimeToMinutes(endStr) || 1440;
        if (currentTotal <= endTotal) return true;
      }
      return false;
    }

    return schedules.filter((row) => {
      if (filters.days.length > 0 && !filters.days.includes(row.day_of_week)) return false;
      if (filters.ageRange) {
        const { min: schedMin, max: schedMax } = parseAgeStr(row.age_group);
        const userMin = filters.ageRange[0];
        const userMax = filters.ageRange[1];
        if (schedMin > userMax || schedMax < userMin) {
          return false;
        }
      }
      if (filters.costs.length > 0) {
        const costStr = row.isFree ? "Free" : "Paid";
        if (!filters.costs.includes(costStr)) return false;
      }
      if (filters.tags && filters.tags.length > 0) {
        const hasMatch = filters.tags.some(t => row.tags && row.tags.includes(t));
        if (!hasMatch) return false;
      }
      if (filters.centres && filters.centres.length > 0) {
        if (!filters.centres.includes(row.community_center_id)) return false;
      }
      if (filters.centreSearchText) {
        if (!row.name || !row.name.toLowerCase().includes(filters.centreSearchText.toLowerCase())) {
          return false;
        }
      }
      // When Now is active, hide past activities
      if (isNowSortActive && !isScheduleActiveOrUpcoming(row)) {
        return false;
      }
      return true;
    });
  }, [schedules, filters, isNowSortActive]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    if (isNowSortActive) {
      setIsNowSortActive(false);
    }
  };

  return (
    <div className="results-page">
      {/* Page Header */}
      <header className="results-header">
        <div className="results-header-inner container">
          {/* Breadcrumb */}
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/" className="breadcrumb-link">All Sports</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">{sport}</span>
          </nav>

          <div className="results-title-row">
            <span className="results-sport-icon" aria-hidden="true">
              {icon?.endsWith('.png') ? <img src={icon} alt={`${sport} icon`} className="results-sport-img" /> : icon}
            </span>
            <div>
              <h1 className="results-sport-name">{sport}</h1>
              <p className="results-sport-meta">
                {loading
                  ? "Finding sessions…"
                  : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} across Toronto`}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      {!loading && (
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          resultCount={filtered.length}
          schedules={schedules}
          isDistanceSortActive={isDistanceSortActive}
          onToggleDistanceSort={handleToggleDistanceSort}
          locationLoading={locationLoading}
          isNowSortActive={isNowSortActive}
          onToggleNowSort={handleToggleNowSort}
        />
      )}

      {/* Results */}
      <div className="results-content container">
        {locationError && (
          <div className="location-error-banner" role="alert">
            <span className="location-error-icon">⚠️</span>
            <span className="location-error-text">{locationError}</span>
            <button
              className="location-error-close"
              onClick={() => setLocationError(null)}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="spinner-wrap" aria-live="polite" aria-label="Loading schedules">
            <div className="spinner" />
            <span>Loading schedules…</span>
          </div>
        ) : (
          <ScheduleTable
            schedules={filtered}
            userLocation={userLocation}
            isDistanceSortActive={isDistanceSortActive}
            isNowSortActive={isNowSortActive}
          />
        )}
      </div>
    </div>
  );
}
