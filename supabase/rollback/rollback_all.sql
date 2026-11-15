-- ============================================================================
-- Skandashram: ROLLBACK of migrations 1-5.            *** DESTRUCTIVE: STAGING ***
--
-- Drops every object the five migrations created (bookings, audit logs, catalogue,
-- schedules, admin list, helper functions). It NEVER touches public.pooja_days.
-- It deletes all booking and audit data, so on a database holding real bookings
-- do NOT run it: restore from the backup taken before the migration instead.
-- Not a migration; never applied automatically. Run it by hand, on staging only.
-- ============================================================================
begin;

drop table if exists public.festival_offerings        cascade;
drop table if exists public.booking_audit_log         cascade;
drop table if exists public.schedule_audit_log        cascade;
drop table if exists public.pooja_price_audit_log     cascade;
drop table if exists public.bookings                  cascade;
drop table if exists public.special_pooja_schedule    cascade;
drop table if exists public.panchangam_pooja_rules    cascade;
drop table if exists public.recurring_pooja_schedule  cascade;
drop table if exists public.poojas                    cascade;
drop table if exists public.admin_users               cascade;

drop function if exists public.admin_festival_create(text, text, text, date, time, numeric, date, date, integer, boolean, uuid, text);
drop function if exists public.admin_festival_update(uuid, jsonb, text, text);
drop function if exists public.admin_special_schedule_create(uuid, date, time, text, text);
drop function if exists public.admin_special_schedule_update(uuid, jsonb, text, text);
drop function if exists public.admin_schedule_rule_set_active(text, uuid, boolean, text, text);
drop function if exists public.admin_set_pooja_price(uuid, numeric, text);
drop function if exists public.admin_booking_action(uuid, text, text);
drop function if exists public.sync_festival_to_pooja();
drop function if exists public.enforce_festival_booking();
drop function if exists public.log_schedule_change();
drop function if exists public.log_pooja_price_change();
drop function if exists public.protect_booking_snapshot();
drop function if exists public.stamp_payment_verification();
drop function if exists public.forbid_audit_change();
drop function if exists public._set_audit_context(text, text, jsonb);
drop function if exists public._require_admin();
drop function if exists public.is_admin();
drop function if exists public.generate_order_no();
drop function if exists public.set_updated_at();

commit;
