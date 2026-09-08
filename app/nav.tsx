"use client";

import { useEffect, useState } from "react";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`land-nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="land-nav-brand">
        <a href="#top" className="land-nav-wordmark">
          PREKSHA
        </a>
      </div>
      <div className="land-nav-links">
        <a className="land-nav-link" href="#what">
          What is preksha
        </a>
        <a className="land-nav-link" href="#platform">
          Platform
        </a>
        <a className="land-nav-link" href="#use-cases">
          Capabilities
        </a>
        <a className="land-nav-link" href="#security">
          Security
        </a>
      </div>
      <a className="land-nav-cta land-btn" href="#contact">
        Get Started
      </a>
    </nav>
  );
}