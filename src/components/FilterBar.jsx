import { useState, useMemo, useRef, useEffect } from "react";
import "./FilterBar.css";
import { trackTelemetryDeckEvent, goatCounterEvent, simpleAnalyticsEvent } from "../telemetry";

const SORTED_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABELS = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };

export default function FilterBar({ filters, onChange, resultCount, schedules = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { availableDays, availableAges, availableTags, availableCentres } = useMemo(() => {
    const dSet = new Set(), aSet = new Set(), tSet = new Set(), cMap = new Map();
    schedules.forEach(s => {
      if (s.day_of_week) dSet.add(s.day_of_week);
      if (s.age_group) aSet.add(s.age_group);
      if (s.tags) s.tags.forEach(t => tSet.add(t));
      if (s.name && s.community_center_id) cMap.set(s.community_center_id, s.name);
    });
    return {
      availableDays: SORTED_DAYS.filter(d => dSet.has(d)),
      availableAges: Array.from(aSet).sort(),
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
    onChange({ days: [], ageGroups: [], costs: [], tags: [], centres: [] });
    setCentreSearch("");
  };

  const hasFilters =
    filters.days.length > 0 ||
    filters.ageGroups.length > 0 ||
    filters.costs.length > 0 ||
    (filters.tags && filters.tags.length > 0) ||
    (filters.centres && filters.centres.length > 0);

  const filteredCentres = availableCentres.filter(c =>
    c.name.toLowerCase().includes(centreSearch.toLowerCase())
  );

  const selectedCentreCount = filters.centres?.length || 0;

  return (
    <div className="filter-bar" role="search" aria-label="Filter schedules">
      <div className="filter-bar-inner container">
        {/* Row 1: header + result count */}
        <div className="filter-bar-header" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: "pointer", userSelect: "none", marginBottom: isExpanded ? "12px" : "0" }}>
          <span className="filter-label-main" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Filters
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
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
            <span className="filter-group-label">Day(s)</span>
            <div className="filter-pills" role="group" aria-label="Filter by day">
              {availableDays.map((d) => (
                <button
                  key={d}
                  id={`filter-day-${d}`}
                  className={`filter-pill ${filters.days.includes(d) ? "active" : ""}`}
                  onClick={() => toggle("days", d)}
                  aria-pressed={filters.days.includes(d)}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Age Group */}
          <div className="filter-group">
            <span className="filter-group-label">Age Group</span>
            <div className="filter-pills" role="group" aria-label="Filter by age group">
              {availableAges.map((g) => (
                <button
                  key={g}
                  id={`filter-age-${g.replace(/\s+/g, "-")}`}
                  className={`filter-pill ${filters.ageGroups.includes(g) ? "active" : ""}`}
                  onClick={() => toggle("ageGroups", g)}
                  aria-pressed={filters.ageGroups.includes(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Community Centre(s) */}
          <div className="filter-group" ref={centreDropdownRef}>
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
          </div>

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
      </div>
    </div>
  );
}
