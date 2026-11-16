import { partnerCompanies } from "../data/partnerCompanies.js";

export function PartnerSection({ partners = partnerCompanies }) {
  return (
    <section className="partner-section" aria-labelledby="partner-section-title">
      <div className="partner-section-heading">
        <span className="eyebrow">PARTNER NETWORK PREVIEW</span>
        <h2 id="partner-section-title">Sample partner brands</h2>
        {partners.some((partner) => partner.isDemo) ? (
          <p className="partner-demo-note" role="note">
            Fictional demo brands for preview only; these are not real partners.
          </p>
        ) : null}
      </div>
      {partners.length > 0 ? (
        <PartnerMarquee partners={partners} />
      ) : (
        <p className="partner-empty-state" role="status">
          No partners yet. Confirmed company names and logos will appear here.
        </p>
      )}
    </section>
  );
}

function PartnerMarquee({ partners }) {
  return (
    <div
      className="partner-marquee"
      role="group"
      aria-label="Sample company logos. Hover or focus to pause."
      tabIndex={0}
    >
      <div className="partner-marquee-track">
        <PartnerBrandList partners={partners} />
        <PartnerBrandList partners={partners} isDuplicate />
      </div>
    </div>
  );
}

function PartnerBrandList({ partners, isDuplicate = false }) {
  return (
    <ul className="partner-marquee-group" aria-hidden={isDuplicate || undefined}>
      {partners.map((partner) => (
        <li className="partner-brand" key={partner.name}>
          <img src={partner.logo} alt={`${partner.name} logo`} />
          <span>{partner.name}</span>
        </li>
      ))}
    </ul>
  );
}
