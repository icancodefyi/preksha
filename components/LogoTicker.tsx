"use client";

const LOGOS = Array.from(
  { length: 15 },
  (_, i) => `/assets/logos/${i + 1}${i + 1 === 6 || i + 1 === 10 ? ".png" : ".jpeg"}`
);

export default function LogoTicker() {
  const doubled = [...LOGOS, ...LOGOS];

  return (
    <section className="logo-ticker">
      <div className="logo-ticker-inner">
        <p className="land-eyebrow" style={{ textAlign: "center", margin: "0 0 0.75rem" }}>
          Partner Cyber Cells
        </p>
        <h2 className="logo-ticker-title">Connected across every cyber cell</h2>
        <div className="logo-ticker-window">
          <div className="logo-ticker-track">
            {doubled.map((src, i) => (
              <div key={i} className="logo-ticker-item">
                <img src={src} alt="" className="logo-ticker-img" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}