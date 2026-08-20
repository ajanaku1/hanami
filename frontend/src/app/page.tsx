import Link from "next/link";
import { AppHeader } from "@/components/ui/AppHeader";
import { BouncerCard } from "@/components/BouncerCard";
import { FeaturedBouncers } from "@/components/FeaturedBouncers";
import { PetalsCanvas } from "@/components/PetalsCanvas";

const PROOF_ROWS = [
  ["01", "0G Compute", "TEE-attested screening", "Every bouncer response must arrive with verified enclave evidence."],
  ["02", "Safety report", "Eight fixed simulations", "Thoughtful, low-effort, jailbreak, and edge-case applicants must all resolve correctly."],
  ["03", "0G Storage", "Content-addressed evidence", "Private intelligence and public-safe report artifacts are pinned by root."],
  ["04", "0G Chain", "Verifiable decisions", "The ERC-7857 bouncer and final applicant verdicts have durable on-chain receipts."],
] as const;

const STEPS = [
  ["01", "Define the gate", "Write the voice, values, and private criteria that make this community specific."],
  ["02", "Certify the bouncer", "Sign one gasless authorization. Hanami runs eight TEE-attested simulations against the exact current text."],
  ["03", "Mint in three clear steps", "Mint the iNFT, authorize the bouncer, then create the campaign. Completed transactions are never repeated."],
  ["04", "Interview and export", "Applicants complete a private 3–6 turn interview. Owners review outcomes and export a Merkle root."],
] as const;

export default function Home() {
  return (
    <>
      <PetalsCanvas />
      <AppHeader />
      <main className="home">
        <section className="home-hero">
          <div className="home-hero__copy">
            <p className="eyebrow">Private screening · public proof</p>
            <h1>A whitelist gate that can <em>show its work.</em></h1>
            <p className="home-hero__lede">
              Hanami turns your project criteria into an ERC-7857 AI bouncer, certifies it against eight fixed safety scenarios, and interviews applicants inside a TEE on 0G.
            </p>
            <div className="home-actions">
              <Link href="/create" className="ui-button ui-button--primary">Create a bouncer</Link>
              <Link href="/c/sakura-society-v2" className="home-text-link">Enter a live interview <span>↗</span></Link>
            </div>
            <dl className="home-trust-strip">
              <div><dt>Safety gate</dt><dd>Strict 8 / 8</dd></div>
              <div><dt>Inference</dt><dd>TEE verified</dd></div>
              <div><dt>Artifacts</dt><dd>0G Storage</dd></div>
              <div><dt>Ownership</dt><dd>ERC-7857</dd></div>
            </dl>
          </div>
          <div className="home-hero__object">
            <div className="home-card-frame">
              <BouncerCard tokenId={3} name="Mei-chan" subtitle="Aoyama · 23 yrs" sealRoot="0g://0552…a590" />
              <div className="home-cert-stamp" aria-label="Bouncer safety certified">8 / 8<br />certified</div>
            </div>
            <p>Portrait / seal · activate the card to inspect</p>
          </div>
        </section>

        <section className="home-ledger" aria-labelledby="proof-heading">
          <div className="home-section-intro">
            <p className="eyebrow">The proof ledger</p>
            <h2 id="proof-heading">Trust is a chain of evidence, not a badge.</h2>
            <p>Each layer has one job. Together they make private screening reproducible without publishing private criteria or simulated conversations.</p>
          </div>
          <div className="proof-ledger">
            {PROOF_ROWS.map(([number, system, title, body]) => (
              <article key={number} className="proof-row">
                <span>{number}</span><strong>{system}</strong><h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-workflow" aria-labelledby="workflow-heading">
          <div className="home-section-intro">
            <p className="eyebrow">Owner workflow</p>
            <h2 id="workflow-heading">From private intelligence to a portable whitelist.</h2>
          </div>
          <ol>
            {STEPS.map(([number, title, body]) => (
              <li key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></li>
            ))}
          </ol>
          <Link href="/create" className="home-text-link">Start with your campaign <span>→</span></Link>
        </section>

        <section className="home-featured" aria-labelledby="featured-heading">
          <div className="home-featured__heading">
            <div><p className="eyebrow">On the door now</p><h2 id="featured-heading">Live bouncers.</h2></div>
            <Link href="/gallery" className="home-text-link">Open the gallery <span>→</span></Link>
          </div>
          <FeaturedBouncers />
        </section>
      </main>
      <footer className="home-footer">
        <span>Hanami · 2026</span>
        <span>0G Compute · Storage · Chain · ERC-7857</span>
        <a href="https://chainscan.0g.ai/address/0x764883319e51e46F683aB54D93F26bcBb74A7030" target="_blank" rel="noopener">Registry on Chainscan ↗</a>
      </footer>
    </>
  );
}
