import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        <Link to="/" className="navbar-brand">
          <img src="/TorontoXP_logo.png" alt="Toronto Life Logo" className="navbar-logo" />
          <div className="navbar-brand-text">
            <span className="navbar-title">TorontoXP - Sports Finder</span>
            <span className="navbar-tagline">Community Centre Activity Search</span>
          </div>
        </Link>

        {!isHome && (
          <Link to="/" className="navbar-back-btn">
            ← All Sports
          </Link>
        )}
      </div>
    </nav>
  );
}
