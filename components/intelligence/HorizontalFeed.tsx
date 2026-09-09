"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  type MotionValue,
} from "framer-motion";
import IntelligenceCard, { type CardData } from "./IntelligenceCard";

const CARDS: CardData[] = [
  {
    id: 1,
    category: "CYBERCRIME",
    categoryColor: "#4ade80",
    headline: "India sees a new wave of coordinated cyber fraud",
    source: "CERT-In",
    time: "2h ago",
    videoId: "rz4bYYuV6rQ",
  },
  {
    id: 2,
    category: "LAW ENFORCEMENT",
    categoryColor: "#60a5fa",
    headline: "Investigators uncover a multi-state criminal network",
    source: "CBI Intel",
    time: "4h ago",
    videoId: "yP_Pb_dmUX8",
  },
  {
    id: 3,
    category: "FINANCIAL INTELLIGENCE",
    categoryColor: "#facc15",
    headline: "Following the money reveals hidden network connections",
    source: "FIU-IND",
    time: "6h ago",
    videoId: "tYJEwCgZ6u8",
  },
  {
    id: 4,
    category: "CDR INTELLIGENCE",
    categoryColor: "#f87171",
    headline: "Call-pattern analysis exposes coordinated activity",
    source: "TRAI Data",
    time: "8h ago",
    videoId: "Nyvfik3W1vE",
  },
  {
    id: 5,
    category: "THREAT INTELLIGENCE",
    categoryColor: "#c084fc",
    headline: "New threat patterns emerge across criminal networks",
    source: "NCTF",
    time: "12h ago",
    videoId: "1Z6GTNhEVJ4",
  },
  {
    id: 6,
    category: "NETWORK ANALYSIS",
    categoryColor: "#4ade80",
    headline: "Cross-case intelligence connects previously isolated suspects",
    source: "preksha",
    time: "1d ago",
    videoId: "6L51lQVDoBU",
  },
  {
    id: 7,
    category: "DARK WEB",
    categoryColor: "#fbbf24",
    headline: "Underground marketplaces flagged for monitored activity",
    source: "OSINT Desk",
    time: "3h ago",
    videoId: "xZZAEK-lCKI",
  },
  {
    id: 8,
    category: "BORDER INTELLIGENCE",
    categoryColor: "#93c5fd",
    headline: "Suspicious movement patterns detected along the corridor",
    source: "Field Intel",
    time: "9h ago",
    videoId: "9wOe71bsMHQ",
  },
  {
    id: 9,
    category: "CYBERSURVEILLANCE",
    categoryColor: "#fca5a5",
    headline: "Encrypted chatter points to coordinated phishing rings",
    source: "Unit 14",
    time: "11h ago",
    videoId: "SBJzxOSpkvY",
  },
  {
    id: 10,
    category: "CRYPTOCRIME",
    categoryColor: "#a5b4fc",
    headline: "Digital wallets linked across high-value fraud chains",
    source: "FinCrime Cell",
    time: "16h ago",
    videoId: "If0Vy8TMGoE",
  },
];

const DOUBLED = [...CARDS, ...CARDS];

const BASE_SPEED = 50;

function useMarquee(
  x: MotionValue<number>,
  isPaused: React.MutableRefObject<boolean>,
  wrap: number
) {
  const lastTime = useRef(0);

  useAnimationFrame((time, delta) => {
    if (isPaused.current) {
      lastTime.current = 0;
      return;
    }
    if (lastTime.current === 0) lastTime.current = time;
    const speed = BASE_SPEED * (delta / 1000);
    let v = x.get();
    v -= speed;
    if (wrap > 0 && v <= -wrap) v += wrap;
    x.set(v);
    lastTime.current = time;
  });
}

export default function HorizontalFeed() {
  const paused = useRef(false);
  const x = useMotionValue(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState(1800);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const update = () => {
      const width = el.scrollWidth / 2;
      if (width > 0) setWrap(width);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setPaused = useCallback((value: boolean) => {
    paused.current = value;
  }, []);

  useMarquee(x, paused, wrap);

  return (
    <div className="intel-feed-wrap">
      <div className="intel-feed-head">
        <p className="land-eyebrow" style={{ textAlign: "center", margin: "0 0 0.5rem" }}>
          Intelligence Feed
        </p>
        <h2 className="intel-feed-title">Live signals from the field</h2>
        <p className="intel-feed-sub">
          Live signals &middot; Cybercrime &middot; Network intelligence &middot; Financial activity
        </p>
      </div>

      <div
        className="intel-feed-viewport"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div className="intel-feed-track">
          <motion.div ref={trackRef} className="intel-feed-track-inner" style={{ x }}>
            {DOUBLED.map((card, i) => (
              <IntelligenceCard key={`${card.id}-${i}`} card={card} />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}