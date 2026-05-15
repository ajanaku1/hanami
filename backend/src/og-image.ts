import "dotenv/config";
import { OG_ROUTER_BASE, OG_ROUTER_KEY, chat } from "./og-compute.js";

const IMAGE_MODEL = process.env.OG_ROUTER_IMAGE_MODEL ?? "z-image";

// House style for the Hanami collection. Every Hanami bouncer is a robot oracle / temple
// keeper — a still, slightly austere figure you have to convince to get passage. Persona text
// drives the trait variation (hair, robe, sigil, background color) but the oracle aesthetic
// is locked. This keeps the collection coherent the way Azuki or BAYC traits sit inside one
// base aesthetic, while killing the techbro/editorial-character vibe that earlier prompts
// landed on by accident.
const HANAMI_STYLE_PREAMBLE = [
  "Half-body portrait of a Hanami bouncer — a robot oracle / temple keeper who decides who passes.",
  "Flat-vector editorial illustration. Modern minimal geometric style. ZERO shading inside the figure, ZERO brush texture, ZERO outlines.",
  "The figure: a single seated or standing android-oracle, centered, frontal, head and shoulders only. Smooth porcelain or ceramic face, perfectly symmetrical. Eyes are softly closed OR downcast — never looking at the viewer, never welcoming. Expression is unreadable, still, slightly austere. The face may carry one small geometric symbol or sigil between the brows (a single thin shape — a circle, triangle, or glyph — never a logo, never text).",
  "Body: ceremonial garb — a high-collared robe, a draped cloak, a layered haori, OR a plated ceremonial chestpiece. Always covers the shoulders fully. One single contrasting accent inside the collar or neckline (a thin band of sakura pink, gold, or cobalt). NO casual clothing, NO t-shirts, NO modern shirts, NO hoodies.",
  "Hair or head covering: ONE of — a smooth dark hime cut, a top knot bound with ribbon, a hood pulled forward with shadow inside, a circlet across the forehead, or short close-cropped synthetic hair. One solid color shape, no strands, no flow.",
  "Background: warm parchment, warm olive, deep indigo, dusk pink, or charcoal — ONE solid color or a single subtle vertical gradient. Nothing else in the background. No scenery. No light effects. No glow.",
  "CRITICAL — DO NOT INCLUDE: NO laptops, NO phones, NO tablets, NO any electronic device. NO earbuds, NO headphones, NO glasses, NO sunglasses, NO monocle. NO cigarettes, NO joints, NO smoke. NO cups, NO tea, NO food, NO bottles. NO weapons, NO swords, NO katanas. NO branches, NO flowers in frame, NO petals drifting. NO hands raised, NO hands visible holding anything. NO logos, NO text, NO captions, NO numbers. NO modern accessories of any kind. NO photoreal, NO 3D render, NO ink wash, NO sumi-e, NO ukiyo-e, NO watercolor.",
  "Composition: clean half-body, centered, generous negative space. The figure is the only thing in frame. 1024x1024 square.",
].join(" ");

const SUBJECT_FALLBACK = "A composed gatekeeper figure with simple dark hair, indigo top, neutral serene expression.";

// Hanami trait palette. Every bouncer is a robot oracle inside the locked HANAMI_STYLE_PREAMBLE,
// but within that frame the figure can be customized to suit the persona. The summarizer
// LLM picks one option per category. No props, no electronics, no modern accessories — the
// figure is always alone in frame.
const TRAIT_PALETTE = `
Pick ONE option from each of the five categories below to suit the persona. Choices should feel earned (a refined gatekeeper gets a circlet of pearl; a stern judge gets a high black collar; a forgiving oracle gets warm parchment background and gold trim).

BACKGROUND: warm parchment / warm olive / deep indigo / dusk pink / charcoal / pale wisteria
HEAD: smooth dark hime cut / top knot bound with ribbon / hood pulled forward (shadow inside, only chin visible) / forged circlet across the forehead / short close-cropped synthetic hair / coiled side braid pinned with a single bar
GARB: high-collared dark robe / draped twilight cloak / layered haori / plated ceremonial chestpiece / stitched temple keeper's mantle / silver-threaded inner-court robe
COLLAR_ACCENT: thin sakura-pink band / thin gold band / thin cobalt band / thin oxblood band (one color only, inside the neckline)
SIGIL_BETWEEN_BROWS: small circle / small downward triangle / small upward triangle / vertical line / single small dot / no sigil
EXPRESSION: eyes softly closed, mouth neutral / eyes downcast, mouth neutral / eyes softly closed, mouth in faintest hint of a smile / eyes downcast, mouth pressed thin
`;

type ImageResponse = {
  data: Array<{ b64_json?: string; url?: string }>;
};

async function summarizeSubject(personaText: string): Promise<string> {
  // One short call: turn an arbitrary persona blurb into a visual portrait spec
  // that includes 2–3 traits from the Hanami trait palette. We never trust persona
  // text to be safe to splice into an image prompt — this also sanitizes any
  // prompt-injection attempts targeted at the image model.
  try {
    const { content } = await chat([
      {
        role: "system",
        content: `You write a SHORT visual portrait spec for an illustrator drawing a Hanami bouncer. Every Hanami bouncer is a robot oracle / temple keeper rendered in flat-vector, with closed or downcast eyes and ceremonial garb — never a casual modern character, never holding anything. The figure is always alone in frame.

Read the persona, then output ONE paragraph (3 sentences max, under 90 words) covering, in order:
1) BACKGROUND color
2) HEAD (hair or head covering)
3) GARB (the ceremonial robe / cloak / chestpiece)
4) COLLAR_ACCENT (the thin contrasting band inside the neckline)
5) SIGIL_BETWEEN_BROWS (a small shape between the brows, or none)
6) EXPRESSION (eyes + mouth, always closed or downcast)

Pick exactly ONE option per category from the palette below. Choose options that fit the persona's spirit — a refined curator gets parchment + circlet + warm tones, a stern degen-detector gets charcoal + cropped synthetic + cobalt. Do not invent new options outside the palette. Do not mention props, hands, or anything outside the figure.

${TRAIT_PALETTE}

Output ONLY the paragraph. No commentary. No quotes. No markdown. No headings. No lists. No mention of "the persona" or "the character" — write it as if briefing the illustrator directly. Do not name electronics, weapons, food, drink, smoke, hands, or any modern accessory under any condition.`,
      },
      { role: "user", content: personaText.slice(0, 1600) },
    ]);
    const cleaned = content.trim().replace(/^["']|["']$/g, "");
    return cleaned.length > 12 ? cleaned : SUBJECT_FALLBACK;
  } catch {
    return SUBJECT_FALLBACK;
  }
}

export async function generatePortrait(personaText: string): Promise<Buffer> {
  const subject = await summarizeSubject(personaText);
  const prompt = `${HANAMI_STYLE_PREAMBLE} Subject: ${subject}`;

  const res = await fetch(`${OG_ROUTER_BASE}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OG_ROUTER_KEY}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) throw new Error(`image router ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as ImageResponse;
  const b64 = body.data[0]?.b64_json;
  if (!b64) throw new Error("router returned no image data");
  return Buffer.from(b64, "base64");
}
