import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import SportResultsPage from "./pages/SportResultsPage";
import { trackTelemetryDeckEvent, goatCounterEvent, simpleAnalyticsEvent } from "./telemetry";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="app">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sport/:sportName" element={<SportResultsPage />} />
        </Routes>
        <footer className="footer">
          <p className="footer-text">
            Designed & developed by
            <span className="footer-logo-wrap">
              <a href="https://crafesign.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}
                onClick={() => {
                  trackTelemetryDeckEvent('footer_crafesign_clicked');
                  goatCounterEvent('footer_crafesign_clicked', true);
                  simpleAnalyticsEvent('footer_crafesign_clicked');
                }}
              >
                <img
                  className="footer-logo"
                  alt="Crafesign logo"
                  src={`${import.meta.env.BASE_URL}CrafesignLogo.svg`}
                />
              </a>
            </span>
          </p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
