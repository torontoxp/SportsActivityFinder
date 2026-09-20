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
  ageGroups: [],
  costs: [],
  tags: [],
  centres: [],
};

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

  // ── Client-side filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return schedules.filter((row) => {
      if (filters.days.length > 0 && !filters.days.includes(row.day_of_week)) return false;
      if (filters.ageGroups.length > 0 && !filters.ageGroups.includes(row.age_group)) return false;
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
      return true;
    });
  }, [schedules, filters]);

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
          onChange={setFilters}
          resultCount={filtered.length}
          schedules={schedules}
          isDistanceSortActive={isDistanceSortActive}
          onToggleDistanceSort={handleToggleDistanceSort}
          locationLoading={locationLoading}
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
          />
        )}
      </div>
    </div>
  );
}
