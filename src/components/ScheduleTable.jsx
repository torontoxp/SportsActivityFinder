import "./ScheduleTable.css";

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_FULL = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  if (/am|pm/i.test(timeStr)) {
    // If it's already 12h format, clean up leading zeros
    return timeStr.replace(/^0/, '').trim();
  }
  const [h, m] = timeStr.split(":");
  let hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

function formatSlot12h(slot) {
  if (!slot || !slot.includes("-")) return slot;
  const [start, end] = slot.split("-");
  return `${formatTime12h(start.trim())} - ${formatTime12h(end.trim())}`;
}

export default function ScheduleTable({ schedules }) {
  if (schedules.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔍</div>
        <h3>No results found</h3>
        <p>Try adjusting your filters to see more schedules.</p>
      </div>
    );
  }

  const sorted = [...schedules].sort(
    (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
  );

  return (
    <div className="schedule-table-wrap">
      <div className="schedule-table-scroll">
        <table className="schedule-table" role="table" aria-label="Activity schedules">
          <thead>
            <tr>
              <th scope="col">Community Centre</th>
              <th scope="col">Day</th>
              <th scope="col">Time Slots</th>
              <th scope="col">Age Group</th>
              <th scope="col">Drop-in</th>
              <th scope="col">Free</th>
              <th scope="col" className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="schedule-row">
                {/* Centre name */}
                <td className="td-center-name">
                  <a
                    href={row.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="center-name-link"
                    title={`Visit ${row.name} website`}
                  >
                    {row.name}
                  </a>
                  {row.tags && row.tags.length > 0 && (
                     <div className="tags-container" style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                       {row.tags.map(tag => (
                          <span key={tag} style={{ fontSize: "0.7rem", background: "var(--primary-xlight)", color: "var(--primary)", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>{tag}</span>
                       ))}
                     </div>
                  )}
                  <span className="td-address">{row.address}</span>
                </td>

                {/* Day */}
                <td>
                  <span className={`day-chip day-chip--${row.day_of_week.toLowerCase()}`}>
                    {DAY_FULL[row.day_of_week]}
                  </span>
                </td>

                {/* Slots */}
                <td>
                  <div className="slots-list">
                    {row.slots.map((slot, si) => (
                      <span key={si} className="slot-chip">{formatSlot12h(slot)}</span>
                    ))}
                  </div>
                </td>

                {/* Age Group */}
                <td>
                  <span className="age-chip">{row.age_group}</span>
                </td>

                {/* Drop-in */}
                <td className="td-center">
                  {row.is_drop_in ? (
                    <span className="badge badge-dropin">✓ Drop-in</span>
                  ) : (
                    <span className="badge badge-reg">Register</span>
                  )}
                </td>

                {/* Free */}
                <td className="td-center">
                  {row.isFree ? (
                    <span className="badge badge-free">Free</span>
                  ) : (
                    <span className="badge badge-paid">Paid</span>
                  )}
                </td>

                {/* Actions */}
                <td className="td-center col-actions">
                  <div className="action-buttons">
                    <a
                      href={row.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-btn"
                      aria-label={`Open ${row.name} in Google Maps`}
                      title="Open in Google Maps"
                    >
                      <span className="action-btn-icon">📍</span>
                      <span className="action-btn-text">Maps</span>
                    </a>
                    {row.phone && (
                      <a
                        href={`tel:${row.phone.replace(/[^0-9+]/g, '')}`}
                        className="action-btn"
                        aria-label={`Call ${row.name} at ${row.phone}`}
                        title={`Call ${row.phone}`}
                      >
                        <span className="action-btn-icon">📞</span>
                        <span className="action-btn-text">Call</span>
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
