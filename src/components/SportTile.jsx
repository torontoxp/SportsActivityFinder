import { useNavigate } from "react-router-dom";
import "./SportTile.css";

export default function SportTile({ sport, icon, centerCount }) {
  const navigate = useNavigate();

  return (
    <button
      className="sport-tile"
      onClick={() => navigate(`/sport/${encodeURIComponent(sport)}`)}
      aria-label={`Browse ${sport} — available at ${centerCount} centres`}
    >
      <div className="sport-tile-glow" aria-hidden="true" />
      <div className="sport-tile-icon" aria-hidden="true">
        {icon?.endsWith('.png') ? <img src={icon} alt={`${sport} icon`} className="sport-tile-img" /> : icon}
      </div>
      <h3 className="sport-tile-name">{sport}</h3>
      <p className="sport-tile-count">
        {centerCount} {centerCount === 1 ? "centre" : "centres"}
      </p>
      <div className="sport-tile-arrow" aria-hidden="true">→</div>
    </button>
  );
}
