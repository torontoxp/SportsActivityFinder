import { useEffect, useState } from "react";
import { fetchSports } from "../services/api";
import SportTile from "../components/SportTile";
import "./HomePage.css";

export default function HomePage() {
  const [sports, setSports] = useState([]);
  const [totalCentres, setTotalCentres] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSports()
      .then(data => {
        setSports(data.sports || []);
        setTotalCentres(data.totalCentres || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="home-page">
      {/* Hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content container">
          <span className="hero-eyebrow">🏢 City of Toronto</span>
          <h1 id="hero-title" className="hero-title">
            Find a Sport Near You
          </h1>
          <p className="hero-subtitle">
            Browse free & affordable activities at Toronto community centres —
            all in one place. Pick your sport and see every available session.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{totalCentres > 0 ? `${Math.floor((totalCentres - 1) / 5) * 5}+` : '...'}</strong>
              <span>Community Centres</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <strong>{sports.length > 0 ? sports.length : '...'}</strong>
              <span>Sports &amp; Activities</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sports Grid */}
      <section className="sports-grid-section container" aria-labelledby="sports-grid-title">
        <div className="sports-grid-header">
          <h2 id="sports-grid-title" className="section-title">Choose a Sport</h2>
          <p className="section-subtitle">
            Click any sport to see all schedules and locations.
          </p>
        </div>

        {loading ? (
          <div className="spinner-wrap" aria-live="polite" aria-label="Loading sports">
            <div className="spinner" />
            <span>Loading sports…</span>
          </div>
        ) : (
          <div className="sports-grid" role="list" aria-label="Available sports">
            {sports.map((item) => (
              <div key={item.sport} role="listitem">
                <SportTile
                  sport={item.sport}
                  icon={item.icon}
                  centerCount={item.centerCount}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Info Banner */}
      <section className="info-banner container">
        <div className="info-banner-inner">
          <div className="info-banner-icon">ℹ️</div>
          <div>
            <strong>About this tool</strong>
            <p>
              Schedules are updated weekly from the City of Toronto's community
              centre program listings. All times are local (Eastern Time). For
              registration details, visit the individual centre's website.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
