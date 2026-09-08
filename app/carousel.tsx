"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SLIDES = [
  {
    index: "01",
    label: "Ingestion",
    title: "Every source, one pipeline",
    desc: "FIRs, CDR, IPDR, financial records, tower dumps and CCTV metadata — ingested in parallel, storable forever.",
    img: "/assets/WarpSpeed___1_.png",
    alt: "",
  },
  {
    index: "02",
    label: "Extraction",
    title: "Machine & handwriting, Indic scripts",
    desc: "OCR for printed and handwritten Hindi and English documents, with human confirmation of low-confidence text.",
    img: "/assets/SAP_Migration_-_Progress_Bars_-_Homepage_4x.png",
    alt: "",
  },
  {
    index: "03",
    label: "Investigation Graph",
    title: "The network behind the case",
    desc: "Persons, phones, devices, accounts, vehicles, locations and events — assembled into one connected graph.",
    img: "/assets/MMDP_cover_image.png",
    alt: "",
  },
  {
    index: "04",
    label: "Analytics",
    title: "Deterministic, reproducible leads",
    desc: "Community detection, centrality, shortest paths and financial flow — computed, cited, never invented.",
    img: "/assets/Asset_2_4x.png",
    alt: "",
  },
];

export default function Carousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const n = SLIDES.length;
    const idx = ((i % n) + n) % n;
    const slide = track.children[idx] as HTMLElement | undefined;
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: "smooth" });
      setActive(idx);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => goTo(active + 1), 5000);
    return () => window.clearInterval(id);
  }, [active, goTo]);

  return (
    <div className="land-carousel">
      <div className="land-carousel-head">
        <button className="land-carousel-seeall" type="button" onClick={() => goTo(3)}>
          See All Capabilities
        </button>
        <div className="land-carousel-arrows">
          <button
            className="land-carousel-arrow"
            type="button"
            aria-label="Previous slide"
            onClick={() => goTo(active - 1)}
          >
            ←
          </button>
          <button
            className="land-carousel-arrow"
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(active + 1)}
          >
            →
          </button>
        </div>
      </div>

      <div className="land-carousel-track" ref={trackRef}>
        {SLIDES.map((s, i) => (
          <div className="land-carousel-slide" key={s.index}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="land-carousel-media" src={s.img} alt={s.alt} loading="lazy" />
            <span className="land-carousel-tag">{s.label}</span>
            <div className="land-carousel-meta">
              <span className="land-carousel-index">
                <strong>{s.index}</strong> / 04 — {s.label}
              </span>
              <h3 className="land-carousel-title">{s.title}</h3>
              <p className="land-carousel-desc">{s.desc}</p>
            </div>
            {i === SLIDES.length - 1 && (
              <style>{`
                .land-carousel-slide:last-child .land-carousel-tag {
                  opacity: 1;
                  transform: translateY(0);
                }
              `}</style>
            )}
          </div>
        ))}
      </div>

      <div className="land-carousel-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.index}
            className={`land-carousel-dot${i === active ? " is-active" : ""}`}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}