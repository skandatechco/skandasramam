import type { RequestHandler } from "express";
import {
  festivalBookingState,
  isFestivalSlug,
  type PublicFestival,
} from "../../shared/festival";
import { todayIST } from "../lib/schedule";
import { getServiceClient } from "../lib/supabase";

/**
 * GET /api/festivals/:slug
 * One active festival offering, for its booking page. The amount comes from the
 * database (the offering's own fixed price); only a count of live bookings is
 * used, and none of it is returned.
 */
export const getFestival: RequestHandler = async (req, res) => {
  const slug = String(req.params.slug ?? "");
  const notFound = () =>
    res.status(404).json({
      ok: false,
      code: "FESTIVAL_NOT_FOUND",
      error: "This festival pooja is not available.",
    });
  if (!isFestivalSlug(slug)) return notFound();

  const db = getServiceClient();
  const { data: pooja, error } = await db
    .from("poojas")
    .select("id, slug, name, description, amount_inr")
    .eq("slug", slug)
    .eq("type", "festival")
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!pooja) return notFound();

  const { data: f, error: fErr } = await db
    .from("festival_offerings")
    .select(
      "festival_name, pooja_name, description, date, start_time, booking_opens_on, booking_closes_on, max_bookings, active",
    )
    .eq("pooja_id", pooja.id)
    .eq("active", true)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!f) return notFound();

  let live = 0;
  if (f.max_bookings != null) {
    const { data: rows, error: bErr } = await db
      .from("bookings")
      .select("pooja_id")
      .eq("pooja_id", pooja.id)
      .neq("status", "cancelled");
    if (bErr) throw bErr;
    live = (rows ?? []).length;
  }

  const state = festivalBookingState(
    {
      active: f.active,
      date: f.date,
      opensOn: f.booking_opens_on,
      closesOn: f.booking_closes_on,
      maxBookings: f.max_bookings,
      liveBookings: live,
    },
    todayIST(),
  );
  const amount = pooja.amount_inr == null ? null : Number(pooja.amount_inr);
  const body: PublicFestival = {
    slug: pooja.slug,
    festivalName: f.festival_name,
    poojaName: f.pooja_name,
    description: f.description ?? null,
    date: f.date,
    startTime: f.start_time ?? null,
    amount,
    bookingOpensOn: f.booking_opens_on ?? null,
    bookingClosesOn: f.booking_closes_on ?? null,
    state,
    bookable: amount !== null && state === "open",
  };
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30");
  res.json({ ok: true, festival: body });
};
