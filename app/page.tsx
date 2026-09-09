"use client";

import Link from "next/link";
import Nav from "./nav";
import Carousel from "./carousel";
import HorizontalFeed from "../components/intelligence/HorizontalFeed";
import { useEffect, useRef, type VideoHTMLAttributes, type ReactNode } from "react";

function PlayOnView({
  className,
  children,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & { children?: ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.play().catch(() => {});
          } else {
            el.pause();
          }
        });
      },
      { threshold: 0.25 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      preload="metadata"
      {...props}
    >
      {children}
    </video>
  );
}

export default function Home() {
  return (
    <main>
      <Nav />

      {/* ——— Hero ——— */}
      <header className="land-hero" id="top">
        <video
          className="land-hero-media"
          src="/assets/PAL_HERO_REEL_v1.9.mp4"
          poster="/assets/PAL_HERO_REEL_StaticFrame_v1.2.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div className="land-hero-scrim" />
        <div className="land-hero-copy">
         
          <h1 className="land-hero-title">
            Sovereign AI for Every Investigation
          </h1>
          <p className="land-hero-sub">
            I&apos;m the real product. We connect every record — calls,
            transactions, devices, locations, documents — into one
            evidence-grounded network you can explore, query, and cite.
          </p>
        </div>
        <div className="land-scroll-hint">Scroll to Explore</div>
      </header>

      {/* ——— Intelligence Feed ——— */}
      <section className="land-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <HorizontalFeed />
      </section>

      {/* ——— Capabilities carousel ——— */}
      <section className="land-section" id="use-cases">
        <div className="land-sec-head" style={{ marginBottom: "clamp(2rem, 5vw, 3.5rem)" }}>
          <div>
            <p className="land-eyebrow" style={{ margin: "0 0 1.25rem" }}>
              Capabilities
            </p>
            <h2 className="land-h1">What can you do with preksha?</h2>
          </div>
          <p className="land-sub">
            Four core movements, one pipeline — from raw evidence to a cited,
            analytical lead.
          </p>
        </div>
        <Carousel />
      </section>

      {/* ——— What is preksha ——— */}
      <section className="land-section" id="what">
        <div className="land-sec-head">
          <div>
            <p className="land-eyebrow" style={{ margin: "0 0 1.25rem" }}>
              What is preksha
            </p>
            <h2 className="land-h1">One system. Every source the case produces.</h2>
          </div>
          <p className="land-sub">
            Law enforcement work spans FIR narratives, call records, money
            trails, tower presence and CCTV sightings — separate formats,
            different languages, often by hand. preksha ingests all of it,
            resolves the people and devices behind each record, and assembles a
            single case-scoped network that investigators can explore, query,
            and cite.
          </p>
        </div>

        <div className="land-row" style={{ paddingTop: "clamp(3rem, 6vw, 5rem)" }}>
          <div className="land-row-media">
            <PlayOnView src="/assets/homepage_-_Foundry.mp4" />
          </div>
          <div className="land-row-copy">
            <h3 className="land-h3">Ingest &amp; reveal the complete record</h3>
            <p>
              Upload FIRs, CDR, IPDR, financial and UPI transactions, tower
              dumps and CCTV metadata. Artifacts are stored immutably as
              legal-of-record, ingestion is asynchronous and resumable, and
              nothing is lost.
            </p>
            <ul className="land-check-list">
              <li>Scanned, handwritten and text documents in Hindi and English.</li>
              <li>OCR and NER with explainable confidence, human review loop.</li>
              <li>Deterministic entity resolution first — reviewed, reversible merges.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ——— Platform ——— */}
      <section className="land-section" id="platform">
        <div className="land-sec-head">
          <div>
            <p className="land-eyebrow" style={{ margin: "0 0 1.25rem" }}>
              Platform
            </p>
            <h2 className="land-h1">From raw artifacts to analytical leads.</h2>
          </div>
          <p className="land-sub">
            An event-authoritative POLE graph — Person, Object, Location, Event —
            case-scoped by construction, preserving every record and timestamp.
            Analytics are computed deterministically and labelled as indicators,
            never auto-verdicts.
          </p>
        </div>

        <div className="land-row land-row--flip">
          <div className="land-row-media">
            <PlayOnView src="/assets/homepage_-_Gotham.mp4" />
          </div>
          <div className="land-row-copy">
            <h3 className="land-h3">Follow the network, not the paper trail</h3>
            <p>
              Every call, transfer, tower ping and CCTV sighting becomes an
              event in the graph. preksha aggregates them into derived
              relationships — who communicates with whom, whose money lands
              where, who was present when — while keeping each source record
              intact and attributable.
            </p>
            <ul className="land-check-list">
              <li>Bounded, paginated exploration of dense real-world networks.</li>
              <li>Timeline, geospatial and financial views on the same entities.</li>
              <li>Cross-case correlation on the authorized intersection of cases.</li>
            </ul>
          </div>
        </div>

        <div className="land-row">
          <div className="land-row-media">
            <PlayOnView src="/assets/homepage_-_AIP.mp4" />
          </div>
          <div className="land-row-copy">
            <h3 className="land-h3">Ask in plain language. Get cited answers.</h3>
            <p>
              “How is the money moving?”, “What happened in the 24 hours before
              the robbery?”, “Who appears in more than one FIR?” — each question
              is routed to the right engine. Deterministic questions are
              answered deterministically; the local model only explains
              retrieved, case-scoped evidence.
            </p>
            <ul className="land-check-list">
              <li>Every answer carries structured citations to the exact record.</li>
              <li>Fabricated references are rejected before they reach you.</li>
              <li>No external cloud dependency — designed for on-premise operation.</li>
            </ul>
          </div>
        </div>

        <div className="land-row land-row--flip">
          <div className="land-row-media">
            <PlayOnView src="/assets/homepage_-_Apollo.mp4" />
          </div>
          <div className="land-row-copy">
            <h3 className="land-h3">Reports, evidence and audit, by design</h3>
            <p>
              Generate investigative working copies with source references and
              full provenance. Every access, merge, query and generation is
              recorded in a chained audit log.
            </p>
            <ul className="land-check-list">
              <li>Traceable reports built for review — not inflated claims.</li>
              <li>Append-only audit chains with daily anchors.</li>
              <li>Reversible entity merges with complete provenance.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ——— Security ——— */}
      <section className="land-section" style={{ paddingTop: 0 }} id="security">
        <div className="land-sec-head">
          <div>
            <p className="land-eyebrow" style={{ margin: "0 0 1.25rem" }}>
              Security &amp; Sovereignty
            </p>
            <h2 className="land-h1">Sensitive data stays inside the perimeter.</h2>
          </div>
          <p className="land-sub">
            Criminal-intelligence data cannot leave sovereign infrastructure.
            RBAC and case ACL with deny-by-default, authorization before
            retrieval at the data plane, on-premise model plane, prompt-injection
            defenses and tamper-evident artifacts.
          </p>
        </div>

        <div className="land-industries">
          <div className="land-industry">
            <h3 className="land-industry-title">Case-Level Access</h3>
            <p className="land-industry-copy">
              Least privilege on every case, enforced before any retrieval.
            </p>
          </div>
          <div className="land-industry">
            <h3 className="land-industry-title">On-Premise Model Plane</h3>
            <p className="land-industry-copy">
              Local retrieval-then-answer; no data egress in the chain.
            </p>
          </div>
          <div className="land-industry">
            <h3 className="land-industry-title">Air-Gap Ready</h3>
            <p className="land-industry-copy">
              Designed to run fully offline on sovereign infrastructure.
            </p>
          </div>
          <div className="land-industry">
            <h3 className="land-industry-title">Evidence Integrity</h3>
            <p className="land-industry-copy">
              Immutable artifacts, chained audit, reversible merges.
            </p>
          </div>
        </div>
      </section>

      {/* ——— Video showcase ——— */}
      <section className="land-section">
        <div className="land-edge" style={{ maxWidth: "960px" }}>
          <p className="land-eyebrow" style={{ textAlign: "center", margin: "0 0 1.25rem" }}>
            See preksha in action
          </p>
          <h2 className="land-h1" style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            A first look at the platform
          </h2>
          <p
            className="land-sub"
            style={{ textAlign: "center", margin: "0 auto 2.25rem", maxWidth: "34rem" }}
          >
            From raw evidence to the analytical network, right on screen.
          </p>
          <div className="land-video-frame">
            <PlayOnView
              src="/assets/hero1.mp4"
              playsInline
              loop
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            >
              Your browser does not support the video tag.
            </PlayOnView>
          </div>
        </div>
      </section>

      {/* ——— CTA ——— */}
      <section className="land-section" style={{ paddingTop: 0 }} id="contact">
        <div className="land-edge" style={{ maxWidth: "720px" }}>
          <h2 className="land-h1" style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            Ready to see the whole network?
          </h2>
          <p
            className="land-sub"
            style={{ textAlign: "center", margin: "0 auto 2.25rem", maxWidth: "32rem" }}
          >
            Explore the platform with the full sample dataset — upload a file,
            watch the graph build, run analytics, ask a question, export a
            report.
          </p>
          <div className="land-hero-actions">
            <a className="land-btn" href="/dashboard">
              Explore the Platform
            </a>
          </div>
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer className="land-footer">
        <div className="land-footer-inner">
          <div className="land-footer-top">
            <div className="land-footer-brand">
              <a href="#top" className="land-nav-wordmark">
                preksha
              </a>
              <p>
                Sovereign AI for every investigation — evidence-grounded network
                analysis for law enforcement.
              </p>
            </div>
            <div className="land-footer-cols">
              <div className="land-footer-col">
                <h4>Platform</h4>
                <Link href="#what">Overview</Link>
                <Link href="#platform">Capabilities</Link>
                <Link href="#platform">Knowledge Graph</Link>
                <Link href="#platform">Evidence Q&amp;A</Link>
              </div>
              <div className="land-footer-col">
                <h4>Security</h4>
                <Link href="#security">On-Prem &amp; Air-Gap</Link>
                <Link href="#security">Access Control</Link>
                <Link href="#security">Audit &amp; Provenance</Link>
              </div>
              <div className="land-footer-col">
                <h4>Company</h4>
                <Link href="#what">About</Link>
                <Link href="#use-cases">Use Cases</Link>
                <Link href="#contact">Contact</Link>
              </div>
            </div>
          </div>
          <div className="land-footer-bottom">
            <span>© 2026 preksha.</span>
            <span>Investigative working copy — not a claim of legal admissibility.</span>
          </div>
        </div>

        {/* Giant wordmark at the very bottom */}
        <div className="land-footer-giant" aria-hidden="true">
          {"PREKSHA".split("").map((ch, i) => (
            <span key={i} className="land-giant-letter">
              {ch}
            </span>
          ))}
        </div>
      </footer>
    </main>
  );
}