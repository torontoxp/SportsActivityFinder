import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import SportResultsPage from "./pages/SportResultsPage";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
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
              <a href="https://crafesign.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
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
