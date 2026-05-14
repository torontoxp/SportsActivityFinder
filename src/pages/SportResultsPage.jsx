import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchedules } from "../services/api";
import FilterBar from "../components/FilterBar";
import ScheduleTable from "../components/ScheduleTable";
import "./SportResultsPage.css";

const SPORT_ICONS = {
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
  "Open Gym": "🤸",
  "Multi-Sport": "🤹",
  "Dodgeball": "🤾",
  "Netball": `${import.meta.env.BASE_URL}Netball.png`,
  "Bocce": `${import.meta.env.BASE_URL}Bocce.png`,
  "Carpet Bowling": `${import.meta.env.BASE_URL}Bowling.png`,
  "Skateboarding": "🛹",
  "Ultimate": "🥏",
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

  // Resolve icon from local map
  const icon = SPORT_ICONS[sport] ?? "🏅";

  useEffect(() => {
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
    fetchSchedules(sport)
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, [sport]);

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
        />
      )}

      {/* Results */}
      <div className="results-content container">
        {loading ? (
          <div className="spinner-wrap" aria-live="polite" aria-label="Loading schedules">
            <div className="spinner" />
            <span>Loading schedules…</span>
          </div>
        ) : (
          <ScheduleTable schedules={filtered} />
        )}
      </div>
    </div>
  );
}
