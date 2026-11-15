-- ============================================================================
-- Skandashram: pooja catalogue, standard participation rates and schedules.
--                                                       *** NOT A MIGRATION ***
--
-- * It is deliberately outside supabase/migrations/, so it is never applied
--   automatically. Review it with the temple, then run it yourself (SQL editor),
--   after migrations 1-5.
-- * Every pooja name below comes from the temple's own website pages, and every
--   start time from the times printed on the Regular Poojas page. Nothing else
--   (no descriptions, no benefits) is added here.
--
-- STANDARD RATES (approved):  regular poojas  INR 100 per booking
--                             special poojas  INR 1,000 per booking
--   "Regular" / "special" means the section of the website the pooja is listed in.
--   A regular pooja does not occur every day: its schedule (daily, or the
--   Panchangam rule) below is independent of its price.
--
-- SAFE TO RE-RUN. Re-running:
--   * never creates a duplicate (a pooja is matched by slug AND by name);
--   * never touches an existing booking or its stored amount;
--   * never overwrites a price an administrator has set or changed or withdrawn:
--     a standard rate is applied only to a pooja that has NO price and has NEVER had
--     a price change recorded in public.pooja_price_audit_log;
--   * never adds a second schedule to a pooja that already has one.
--   The rates are recorded in the price audit log as "system" with the reason below.
--
-- Poojas that are NOT here on purpose:
--   Annadanam / Daily Annadhanam   donation flow, not a fixed-amount pooja booking
--                                   (no price, no booking link).
--
-- TEMPLE DECISIONS (confirmed 2026-11-15): items 1-4 below are settled; item 5 still applies.
-- Item 1: Sankata Hara Chaturthi and Krishna Paksha Ashtami follow the Krishna paksha.
-- Item 2: Tamil Month First Saturday is INR 100, scheduled manually until Tamil solar-calendar support exists.
-- Items 3-4: the Navavarna / Nava Varna and Prathiyankara / Prathyangira pairs stay separate offerings.
--   1. Sankata Hara Chaturthi and Krishna Paksha Ashtami are encoded for the
--      KRISHNA paksha only (matching their names). The current website calendar
--      highlights Chaturthi and Ashtami in either paksha. Delete the paksha
--      condition if the temple observes them in both.
--   2. CLASSIFICATION: Tamil Month First Saturday is listed with the REGULAR poojas
--      (so it is priced INR 100) but needs the Tamil solar month, which
--      public.pooja_days does not hold. It is therefore stored as a SPECIAL-type pooja
--      (dates added by hand, no automatic schedule). Confirm the rate and the dates.
--   3. "Navavarna Pooja" (regular, Panchangam days, INR 100) and "Nava Varna Pooja"
--      (special, INR 1,000) look like the same ritual under two names. They are kept
--      as two poojas with separate schedules and prices until the temple says otherwise.
--   4. "Prathiyankara Sarabha Sulini Homam" (regular, daily, INR 100) is a different
--      offering from "Prathyangira Sarabha Soolini Koti Homam" (special, INR 1,000):
--      the names are similar. Confirm they are meant to be separate.
--   5. No dates or times are invented: the special poojas have NO schedule until the
--      temple adds dates (Admin > Poojas & schedules), and Navavarna Pooja has no
--      start time because none is printed on the website.
-- ============================================================================

begin;

-- Recorded in the price audit log against every rate applied below.
select set_config('app.change_reason', 'Initial approved standard rate (catalogue seed)', true);

create temporary table _seed_poojas (
  slug   text primary key,
  name   text not null,
  type   text not null,
  amount numeric(10, 2) not null
) on commit drop;

insert into _seed_poojas (slug, name, type, amount) values
  -- Regular poojas: daily (type A), INR 100
  ('prathiyankara-sarabha-sulini-homam', 'Prathiyankara Sarabha Sulini Homam', 'daily', 100),
  -- Regular poojas: follow the Panchangam (type B), INR 100
  ('sankata-hara-chaturthi',         'Sankata Hara Chaturthi',         'panchangam', 100),
  ('krishna-paksha-ashtami',         'Krishna Paksha Ashtami',         'panchangam', 100),
  ('pradosham',                      'Pradosham',                      'panchangam', 100),
  ('amavasya-new-moon',              'Amavasya (New Moon)',            'panchangam', 100),
  ('pournami-full-moon',             'Pournami / Full Moon',           'panchangam', 100),
  ('krithigai',                      'Krithigai',                      'panchangam', 100),
  ('uthiram-nakshatram',             'Uthiram Nakshatram',             'panchangam', 100),
  ('chitirai-nakshatram',            'Chitirai Nakshatram',            'panchangam', 100),
  ('swathi-nakshatram',              'Swathi Nakshatram',              'panchangam', 100),
  ('vishakam-vishagam-nakshatram',   'Vishakam (Vishagam) Nakshatram', 'panchangam', 100),
  ('navavarna-pooja',                'Navavarna Pooja',                'panchangam', 100),
  -- Listed with the regular poojas (INR 100) but stored as 'special' (see header, item 2)
  ('tamil-month-first-saturday',     'Tamil Month First Saturday',     'special',    100),
  -- Special poojas (type C), INR 1,000
  ('lord-kamala-siddhi-vinayaka-panchamukha-heramba-ganapathy', 'Lord Kamala Siddhi Vinayaka, Panchamukha Heramba Ganapathy', 'special', 1000),
  ('goddess-prathyangira-devi',               'Goddess Prathyangira Devi',               'special', 1000),
  ('lord-veera-sarabeswara',                  'Lord Veera Sarabeswara',                  'special', 1000),
  ('goddess-matha-bhuvaneshwari',             'Goddess Matha Bhuvaneshwari',             'special', 1000),
  ('lord-skanda-murugan',                     'Lord Skanda (Murugan)',                   'special', 1000),
  ('lord-shiva',                              'Lord Shiva',                              'special', 1000),
  ('lord-saniswarar',                         'Lord Saniswarar',                         'special', 1000),
  ('lord-panchamukha-hanuman',                'Lord Panchamukha Hanuman',                'special', 1000),
  ('lord-iyyapan',                            'Lord Iyyapan',                            'special', 1000),
  ('asta-dasa-bhuja-durga-parameswari',       'Asta Dasa Bhuja Durga Parameswari',       'special', 1000),
  ('lord-dattatreya',                         'Lord Dattatreya',                         'special', 1000),
  ('sadguru-shantananda-swamigal',            'Sadguru Shantananda Swamigal',            'special', 1000),
  ('prathyangira-sarabha-soolini-koti-homam', 'Prathyangira Sarabha Soolini Koti Homam', 'special', 1000),
  ('durga-saptha-sathi-parayanam',            'Durga Saptha Sathi Parayanam',            'special', 1000),
  ('nava-varna-pooja',                        'Nava Varna Pooja',                        'special', 1000),
  ('guru-paaduka-pooja',                      'Guru Paaduka Pooja',                      'special', 1000),
  ('homam-for-world-peace',                   'Homam for World Peace',                   'special', 1000);

-- 1. Catalogue entries (and their rate) for poojas that do not exist yet.
insert into public.poojas (slug, name, type, amount_inr)
select s.slug, s.name, s.type, s.amount
  from _seed_poojas s
 where not exists (
   select 1 from public.poojas p
    where p.slug = s.slug or lower(p.name) = lower(s.name)
 );

-- 2. Poojas that already exist but were never priced AND never had a price change
--    recorded (so no administrator decision is overwritten).
update public.poojas p
   set amount_inr = s.amount
  from _seed_poojas s
 where p.slug = s.slug
   and p.amount_inr is null
   and not exists (
     select 1 from public.pooja_price_audit_log a where a.pooja_id = p.id
   );

-- ---- Regular poojas: performed every day (type A) ----------------------------
insert into public.recurring_pooja_schedule (pooja_id, recurrence, start_time)
select p.id, 'daily', '09:15'   -- listing: "9:15 AM – 11:00 AM"
  from public.poojas p
 where p.slug = 'prathiyankara-sarabha-sulini-homam'
   and not exists (select 1 from public.recurring_pooja_schedule r where r.pooja_id = p.id);

-- ---- Regular poojas: follow the Panchangam (type B) ----------------------------
-- One structured rule per pooja (tithi / paksha / nakshatra as canonical ids).
with r (slug, tithis, paksha, nakshatras, start_time) as (values
  -- Confirmed by the temple: Krishna paksha only. Listing time: Abhishekam 10:30 AM.
  ('sankata-hara-chaturthi',       array['chaturthi'],   'krishna', null::text[], '10:30'::time),
  -- Confirmed by the temple: Krishna paksha only. Abhishekam 10:30 AM.
  ('krishna-paksha-ashtami',       array['ashtami'],     'krishna', null,         '10:30'),
  -- Trayodashi in either paksha. Listing: Mahanyasam 5:00 PM.
  ('pradosham',                    array['trayodashi'],  null,      null,         '17:00'),
  ('amavasya-new-moon',            array['amavasya'],    null,      null,         '10:00'),
  ('pournami-full-moon',           array['purnima'],     null,      null,         '10:00'),
  ('krithigai',                    null,                 null,      array['krittika'],         '10:00'),
  ('uthiram-nakshatram',           null,                 null,      array['uttara_phalguni'],  '10:30'),
  ('chitirai-nakshatram',          null,                 null,      array['chitra'],           '10:30'),
  ('swathi-nakshatram',            null,                 null,      array['swati'],            '10:30'),
  ('vishakam-vishagam-nakshatram', null,                 null,      array['vishakha'],         '10:30'),
  -- Listing: "Performed on Panchami, Ashtami, Chaturdasi, New Moon, and Full Moon." (no time printed)
  ('navavarna-pooja',              array['panchami','ashtami','chaturdashi','amavasya','purnima'], null, null, null)
)
insert into public.panchangam_pooja_rules (pooja_id, tithis, paksha, nakshatras, start_time)
select p.id, r.tithis, r.paksha, r.nakshatras, r.start_time
  from r
  join public.poojas p on p.slug = r.slug
 where not exists (select 1 from public.panchangam_pooja_rules x where x.pooja_id = p.id);

-- ---- Special poojas (type C) -----------------------------------------------------
-- Catalogue entries only (above). No dates are invented: add them in
-- Admin > Poojas & schedules once the temple has decided them.

commit;
