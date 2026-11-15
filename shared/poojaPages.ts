import { festivalPath, isFestivalSlug } from "./festival";

/**
 * Which public detail page serves each pooja slug. This is the single place that
 * says where a booking link may point. It mirrors the pages' own titles (a test
 * keeps the two in sync) and holds no descriptions.
 *
 * A pooja whose slug is not listed has NO page and therefore must never be
 * offered for booking.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/** Titles on /poojas/regular/:slug detail pages. */
export const REGULAR_PAGE_TITLES = [
  "Sankata Hara Chaturthi",
  "Krishna Paksha Ashtami",
  "Pradosham",
  "Amavasya (New Moon)",
  "Pournami / Full Moon",
  "Krithigai",
  "Uthiram Nakshatram",
  "Chitirai Nakshatram",
  "Swathi Nakshatram",
  "Vishakam (Vishagam) Nakshatram",
  "Tamil Month First Saturday",
  "Prathiyankara Sarabha Sulini Homam",
  "Navavarna Pooja",
] as const;

/** Titles on /poojas/special/:slug detail pages (excluding donation entries). */
export const SPECIAL_PAGE_TITLES = [
  "Lord Kamala Siddhi Vinayaka, Panchamukha Heramba Ganapathy",
  "Goddess Prathyangira Devi",
  "Lord Veera Sarabeswara",
  "Goddess Matha Bhuvaneshwari",
  "Lord Skanda (Murugan)",
  "Lord Shiva",
  "Lord Saniswarar",
  "Lord Panchamukha Hanuman",
  "Lord Iyyapan",
  "Asta Dasa Bhuja Durga Parameswari",
  "Lord Dattatreya",
  "Sadguru Shantananda Swamigal",
  "Prathyangira Sarabha Soolini Koti Homam",
  "Durga Saptha Sathi Parayanam",
  "Nava Varna Pooja",
  "Guru Paaduka Pooja",
  "Homam for World Peace",
] as const;

/**
 * Donation flows. They are NOT poojas with a fixed participation amount, are
 * never bookable here, and never receive a booking link.
 */
export const DONATION_SLUGS: readonly string[] = [
  "annadanam",
  "daily-annadhanam",
];

const REGULAR = new Set<string>(REGULAR_PAGE_TITLES.map(slugify));
const SPECIAL = new Set<string>(SPECIAL_PAGE_TITLES.map(slugify));

export const isDonationSlug = (slug: string) => DONATION_SLUGS.includes(slug);
export const regularPageSlugs = () => [...REGULAR];
export const specialPageSlugs = () => [...SPECIAL];

/**
 * Public booking page for a pooja slug, or null if it has none (or is a donation).
 * Resolution is by slug, not pooja type, so a pooja always links to the page that
 * actually exists for it.
 */
export function resolveDestination(slug: string): string | null {
  if (isDonationSlug(slug)) return null;
  if (isFestivalSlug(slug)) return festivalPath(slug);
  if (REGULAR.has(slug)) return `/poojas/regular/${slug}`;
  if (SPECIAL.has(slug)) return `/poojas/special/${slug}`;
  return null;
}
