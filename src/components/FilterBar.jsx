import { useState, useMemo, useRef, useEffect } from "react";
import "./FilterBar.css";
import { trackTelemetryDeckEvent, goatCounterEvent, simpleAnalyticsEvent } from "../telemetry";

const SORTED_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABELS = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };

export default function FilterBar({
  filters,
  onChange,
  resultCount,
  schedules = [],
  isDistanceSortActive = false,
  onToggleDistanceSort,
  locationLoading = false,
  isNowSortActive = false,
  onToggleNowSort,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { availableDays, availableTags, availableCentres } = useMemo(() => {
    const dSet = new Set(), tSet = new Set(), cMap = new Map();
    schedules.forEach(s => {
      if (s.day_of_week) dSet.add(s.day_of_week);
      if (s.tags) s.tags.forEach(t => tSet.add(t));
      if (s.name && s.community_center_id) cMap.set(s.community_center_id, s.name);
    });

    const today = new Date();
    // Calculate Monday of the current week (assuming week starts on Monday)
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);

    const jsDayMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayOrder = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayOrder[jsDayMap[d.getDay()]] = { index: i, date: d.getDate() };
    }

    return {
      availableDays: Object.keys(dayOrder).filter(d => dSet.has(d)).sort((a, b) => dayOrder[a].index - dayOrder[b].index).map(d => ({ day: d, date: dayOrder[d].date })),
      availableTags: Array.from(tSet).sort(),
      availableCentres: Array.from(cMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [schedules]);

  const [centreSearch, setCentreSearch] = useState("");
  const [centreDropdownOpen, setCentreDropdownOpen] = useState(false);
  const centreDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (centreDropdownRef.current && !centreDropdownRef.current.contains(e.target)) {
        setCentreDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-collapse filter bar when scrolling down while expanded
  useEffect(() => {
    if (!isExpanded) return;

    let lastScrollY = window.scrollY;

    function handleScroll() {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY + 10) {
        setIsExpanded(false);
      } else if (currentScrollY < lastScrollY) {
        lastScrollY = currentScrollY;
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isExpanded]);
  const toggle = (key, value) => {
    const current = filters[key];
    const isAdding = !current.includes(value);
    const next = isAdding
      ? [...current, value]
      : current.filter((v) => v !== value);
    onChange({ ...filters, [key]: next });

    const action = isAdding ? 'filter_applied' : 'filter_removed';
    trackTelemetryDeckEvent(`${action}:${key}:${value}`);
    goatCounterEvent(`${action}/${key}/${value}`, true);
    simpleAnalyticsEvent(action, { filterType: key, filterValue: value });
  };

  const clearAll = () => {
    onChange({ days: [], ageRange: [0, 99], costs: [], tags: [], centres: [], centreSearchText: "" });
    setCentreSearch("");
  };

  const hasFilters =
    filters.days.length > 0 ||
    (filters.ageRange && (filters.ageRange[0] !== 0 || filters.ageRange[1] !== 99)) ||
    filters.costs.length > 0 ||
    (filters.tags && filters.tags.length > 0) ||
    (filters.centres && filters.centres.length > 0) ||
    (filters.centreSearchText && filters.centreSearchText.trim() !== "");

  const filteredCentres = availableCentres.filter(c =>
    c.name.toLowerCase().includes(centreSearch.toLowerCase())
  );

  const selectedCentreCount = filters.centres?.length || 0;

  return (
    <div className="filter-bar" role="search" aria-label="Filter schedules">
      <div className="filter-bar-inner container">
        {/* Row 1: header + sort + result count */}
        <div className="filter-bar-header" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: "pointer", userSelect: "none", marginBottom: isExpanded ? "12px" : "0" }}>
          <span className="filter-label-main" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Filters
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>

          <button
            type="button"
            className={`filter-sort-btn ${isDistanceSortActive ? "active" : ""} ${locationLoading ? "loading" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDistanceSort && onToggleDistanceSort();
            }}
            aria-label="Sort by distance"
            title="Sort community centres by distance from your location"
          >
            <span>📍</span>
            <span>
              {locationLoading
                ? "Locating…"
                : isDistanceSortActive
                  ? "Closest"
                  : "Sort"}
            </span>
          </button>

          <span className="filter-result-count">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
          {hasFilters && (
            <button className="filter-clear-btn" onClick={(e) => { e.stopPropagation(); clearAll(); }} aria-label="Clear all filters">
              Clear all
            </button>
          )}
        </div>

        {/* Row 2: filter groups */}
        <div className={`filter-groups ${isExpanded ? "expanded" : "collapsed"}`}>
          {/* Day of Week */}
          <div className="filter-group">
            <span className="filter-group-label" style={{ marginRight: '4px' }}>Day(s)</span>
            <div className="filter-pills" role="group" aria-label="Filter by day" style={{ gap: '10px' }}>
              {availableDays.map(({ day, date }) => (
                <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-medium)', fontWeight: 600 }}>{DAY_LABELS[day]}</span>
                  <button
                    id={`filter-day-${day}`}
                    className={`filter-pill ${filters.days.includes(day) ? "active" : ""}`}
                    onClick={() => toggle("days", day)}
                    aria-pressed={filters.days.includes(day)}
                    style={{ padding: '4px 10px', minWidth: '36px', textAlign: 'center', borderRadius: '8px' }}
                  >
                    {date}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Age Group */}
          <div className="filter-group">
            <span className="filter-group-label">Age Range</span>
            <div className="multi-range-slider-wrap">
              <div className="multi-range-labels">
                <span>{filters.ageRange ? filters.ageRange[0] : 0} yrs</span>
                <span>{filters.ageRange && filters.ageRange[1] === 99 ? '99+ yrs' : `${filters.ageRange ? filters.ageRange[1] : 99} yrs`}</span>
              </div>
              <div className="multi-range-slider">
                <div className="slider-track"></div>
                <div className="slider-range" style={{
                  left: `${((filters.ageRange ? filters.ageRange[0] : 0) / 99) * 100}%`,
                  right: `${100 - ((filters.ageRange ? filters.ageRange[1] : 99) / 99) * 100}%`
                }}></div>
                <input
                  type="range"
                  min="0"
                  max="99"
                  value={filters.ageRange ? filters.ageRange[0] : 0}
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value), (filters.ageRange ? filters.ageRange[1] : 99) - 1);
                    onChange({ ...filters, ageRange: [val, filters.ageRange ? filters.ageRange[1] : 99] });
                  }}
                  aria-label="Minimum age"
                />
                <input
                  type="range"
                  min="0"
                  max="99"
                  value={filters.ageRange ? filters.ageRange[1] : 99}
                  onChange={(e) => {
                    const val = Math.max(Number(e.target.value), (filters.ageRange ? filters.ageRange[0] : 0) + 1);
                    onChange({ ...filters, ageRange: [filters.ageRange ? filters.ageRange[0] : 0, val] });
                  }}
                  aria-label="Maximum age"
                />
              </div>
            </div>
          </div>

          {/* Community Centre(s) - Hidden for now */}
          {/* <div className="filter-group" ref={centreDropdownRef}>
            <span className="filter-group-label">Community Centre(s)</span>
            <div className="centre-dropdown-wrapper">
              <button
                className={`centre-dropdown-trigger ${selectedCentreCount > 0 ? "active" : ""}`}
                onClick={() => setCentreDropdownOpen(!centreDropdownOpen)}
                type="button"
              >
                {selectedCentreCount > 0
                  ? `${selectedCentreCount} centre(s) selected`
                  : "Select centre(s)"}
                <span className="centre-dropdown-arrow" style={{ display: 'flex', alignItems: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', transform: centreDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              {centreDropdownOpen && (
                <div className="centre-dropdown-panel">
                  <div className="centre-search-wrap">
                    <input
                      type="text"
                      className="centre-search-input"
                      placeholder="Search centres…"
                      value={centreSearch}
                      onChange={(e) => setCentreSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <ul className="centre-list">
                    {filteredCentres.length === 0 && (
                      <li className="centre-list-empty">No centres found</li>
                    )}
                    {filteredCentres.map((c) => (
                      <li key={c.id} className="centre-list-item">
                        <label className="centre-checkbox-label">
                          <input
                            type="checkbox"
                            className="centre-checkbox"
                            checked={filters.centres?.includes(c.id) || false}
                            onChange={() => toggle("centres", c.id)}
                          />
                          <span className="centre-checkbox-name">{c.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div> */}

          {/* Cost */}
          <div className="filter-group">
            <span className="filter-group-label">Cost</span>
            <div className="filter-pills" role="group" aria-label="Filter by cost">
              {["Free", "Paid"].map((c) => (
                <button
                  key={c}
                  id={`filter-cost-${c}`}
                  className={`filter-pill ${filters.costs?.includes(c) ? "active" : ""}`}
                  onClick={() => toggle("costs", c)}
                  aria-pressed={filters.costs?.includes(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Program Options (Tags) */}
          {availableTags.length > 0 && (
            <div className="filter-group">
              <span className="filter-group-label">Program Options</span>
              <div className="filter-pills" role="group" aria-label="Filter by program options">
                {availableTags.map((t) => (
                  <button
                    key={t}
                    id={`filter-tag-${t.replace(/\\s+/g, "-")}`}
                    className={`filter-pill ${filters.tags?.includes(t) ? "active" : ""}`}
                    onClick={() => toggle("tags", t)}
                    aria-pressed={filters.tags?.includes(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Row 3: Always visible global text search for centres and Now button */}
        <div className="filter-global-search" style={{ marginTop: isExpanded ? "12px" : "12px", display: 'flex', gap: '8px' }}>
          <div className="filter-search-input-wrapper" style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", opacity: 0.5, pointerEvents: "none" }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by community centre name..."
              value={filters.centreSearchText || ""}
              onChange={(e) => onChange({ ...filters, centreSearchText: e.target.value })}
              className="centre-search-input"
              style={{ width: "100%", padding: "9px 12px 9px 36px", fontSize: "0.85rem", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: "8px", boxSizing: "border-box" }}
              aria-label="Search by community centre name"
            />
          </div>
          <button
            type="button"
            className={`filter-sort-btn ${isNowSortActive ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleNowSort && onToggleNowSort();
            }}
            aria-label="Sort by upcoming time"
            title="Sort by soonest upcoming activities"
            style={{ borderRadius: '8px', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}
          >
            <span>⏰</span>
            <span style={{ marginLeft: '4px' }}>NOW</span>
          </button>
        </div>
      </div>
    </div>
  );
}
