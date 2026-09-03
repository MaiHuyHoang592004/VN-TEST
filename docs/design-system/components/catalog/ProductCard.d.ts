/**
 * Buyer-facing product card for the catalog grid. Photography sits in a cream
 * well — GWP catalogs are warm, not grey.
 *
 * ── DOMAIN-BOUND ────────────────────────────────────────────────────────────
 * NOT VERIFIED against any backend source. No reviews, ratings or pricing
 * entity was found in `fulfillment-system-be-prod`. Therefore:
 *
 *  · `rating` / `reviews` are OFF unless passed, and must not be passed until a
 *    reviews entity is confirmed to exist. Never render placeholder ratings —
 *    a fabricated star row is a business claim, not a visual detail.
 *  · `price` is a pre-formatted string the caller supplies. This component
 *    asserts no pricing rule, currency, tax or discount behaviour.
 *  · `badge` copy ("Bestseller", "New") implies a merchandising rule that is
 *    also unverified. Pass it only where the rule exists.
 *
 * Verified: the product families themselves (wood/acrylic/ceramic ornaments,
 * mugs, tumblers, phone cases, canvas, tote bags) appear in the approved
 * reference boards and in the frontend product catalog module.
 * ────────────────────────────────────────────────────────────────────────────
 */
export interface ProductCardProps {
  name: React.ReactNode;
  /** DOMAIN-BOUND. Pre-formatted price string, e.g. "$12.99". No pricing rule is implied. */
  price?: React.ReactNode;
  /**
   * Short qualifier that sits on the price's baseline — "bậc 4 từ $6.10", "chưa
   * gồm ship". Keeps the number itself unqualified so it can stay large, and
   * gives the card one merchandising line without inventing a badge rule.
   * Two or three words; never a sentence.
   */
  priceNote?: React.ReactNode;
  /** An `<img>` node of the real product photograph. */
  image?: React.ReactNode;
  /** DOMAIN-BOUND merchandising label — "Bestseller", "New". One word or two, never a sentence. */
  badge?: React.ReactNode;
  /** `accent` (yellow) = Bestseller, `action` (blue) = New, `sky` = quiet label. */
  badgeTone?: "accent" | "action" | "sky";
  /**
   * Aspect ratio of the image well. Square by default — that is the right
   * frame for real product photography.
   *
   * Shorten it (`"4 / 3"`, `"3 / 2"`) for a catalogue whose photography does
   * not exist yet: at 1:1 an unfilled card is roughly four times taller than
   * its own text, so a page of them reads as a wall of cream rather than a
   * grid of products. A page must NOT get this by overriding the well from
   * outside — pass the prop.
   */
  ratio?: string;
  /**
   * Image-well background. `cream` is the brand default and the right frame for
   * real photography. `neutral` (cool shell) is for a catalogue whose photos
   * are not in yet: an empty CREAM well is a sheet of unfinished paper, and a
   * grid of them reads as a broken page rather than a warm one. Switch back to
   * `cream` the moment real photographs land.
   */
  wellTone?: "cream" | "neutral";
  /**
   * DOMAIN-BOUND — OFF BY DEFAULT. 0–5, rendered as stars.
   * Do not pass unless a reviews entity is verified to exist.
   */
  rating?: number;
  /** DOMAIN-BOUND. Review count. Requires the same verification as `rating`. */
  reviews?: number | string;
  /** Small line above the price — material, size, personalization type. */
  meta?: React.ReactNode;
  onClick?: () => void;
}
export function ProductCard(props: ProductCardProps): JSX.Element;
