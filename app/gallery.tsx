"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Card {
  src: string;
  kind: "image" | "video";
  label: string;
  idx: string;
}

const CARDS: Card[] = [
  { src: "/assets/gallary/11.jpeg", kind: "image",  label: "Cyber cell briefing room",      idx: "01" },
  { src: "/assets/gallary/77.mp4",  kind: "video", label: "On-site walkthrough",             idx: "02" },
  { src: "/assets/gallary/22.JPG",  kind: "image",  label: "Evidence board mapping",          idx: "03" },
  { src: "/assets/gallary/88.mp4",  kind: "video", label: "Tower-dump review session",      idx: "04" },
  { src: "/assets/gallary/33.JPG",  kind: "image",  label: "CDR trace analysis",              idx: "05" },
  { src: "/assets/gallary/44.JPG",  kind: "image",  label: "Investigator workflow",           idx: "06" },
  { src: "/assets/gallary/99.mp4",  kind: "video", label: "Field research capture",         idx: "07" },
  { src: "/assets/gallary/55.JPG",  kind: "image",  label: "Cross-case correlation wall",     idx: "08" },
];

const SWAP_MS = 2600;

export default function Gallery() {
  const [[index, dir], setIndex] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => {
      const n = CARDS.length;
      setIndex(([prev]) => [((next % n) + n) % n, next >= prev ? 1 : -1]);
    },
    [],
  );

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex(([i]) => [i + 1, 1]), SWAP_MS);
    return () => clearInterval(id);
  }, [paused]);

  const peek = useMemo(() => {
    const n = CARDS.length;
    return [
      ((index + 1) % n + n) % n,
      ((index + 2) % n + n) % n,
    ];
  }, [index]);

  const card = (c: Card, active: boolean) =>
    c.kind === "video" ? (
      <video
        className="gal-media"
        src={c.src}
        autoPlay={active}
        muted
        loop
        playsInline
        preload="metadata"
        controls={false}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="gal-media" src={c.src} alt={c.label} loading="lazy" />
    );

  const snap = (off: number) => {
    if (off === 0) return { x: 0, y: 0, scale: 1, rotate: 0, zIndex: 50, opacity: 1 };
    if (off === 1) return { x: "-68%", y: "10%", scale: 0.82, rotate: -14, zIndex: 20, opacity: 0.55 };
    if (off === 2) return { x: "68%", y: "10%", scale: 0.82, rotate: 14, zIndex: 14, opacity: 0.45 };
    return { x: 0, y: "40%", scale: 0.5, rotate: 0, zIndex: 2, opacity: 0 };
  };

  return (
    <section className="land-section" id="gallery">
      <div className="gal-head">
        <div>
          <p className="land-eyebrow" style={{ margin: "0 0 1.25rem" }}>
            Gallery
          </p>
          <h2 className="land-h1">The visit, on camera.</h2>
        </div>
        <p className="land-sub">
          Field photos and research captures from the offline investigation environment
          where preksha was built and tested.
        </p>
      </div>

      <div
        className="gal-stage"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* — visible ghost cards — */}
        {peek.map((pi, k) => {
          const off = k + 1;
          const s = snap(off);
          return (
            <motion.div
              key={`ghost-${CARDS[pi].idx}`}
              className="gal-frame gal-frame--ghost"
              animate={s}
              initial={false}
              transition={{ type: "spring", stiffness: 140, damping: 22, mass: 0.8 }}
              aria-hidden
            >
              {card(CARDS[pi], false)}
              <div className="gal-label">{CARDS[pi].label}</div>
            </motion.div>
          );
        })}

        {/* — active card — */}
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.div
            className="gal-frame gal-frame--front"
            key={CARDS[index].idx}
            custom={dir}
            initial={{ opacity: 0, scale: 0.88, rotate: dir * 12, x: dir * 80 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, x: 0, zIndex: 60 }}
            exit={{ opacity: 0, scale: 0.88, rotate: dir * -12, x: dir * -80 }}
            transition={{ type: "spring", stiffness: 160, damping: 20, mass: 0.7 }}
          >
            {card(CARDS[index], true)}
            <div className="gal-badge">{CARDS[index].idx} / {String(CARDS.length).padStart(2, "0")}</div>
            <div className="gal-caption">{CARDS[index].label}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* — controls — */}
      <div className="gal-controls">
        <button
          className="gal-arrow"
          onClick={() => go(index - 1)}
          aria-label="Previous card"
          type="button"
        >
          &larr;
        </button>
        <div className="gal-dots">
          {CARDS.map((_, i) => (
            <button
              key={i}
              className={`gal-dot${i === index ? " is-active" : ""}`}
              onClick={() => go(i)}
              aria-label={`Go to card ${i + 1}`}
              type="button"
            />
          ))}
        </div>
        <button
          className="gal-arrow"
          onClick={() => go(index + 1)}
          aria-label="Next card"
          type="button"
        >
          &rarr;
        </button>
      </div>
    </section>
  );
}
