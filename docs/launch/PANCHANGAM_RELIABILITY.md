# Panchangam reliability

## Consistency (verified)

The homepage calendar and server-side booking validation call the **same** function, `occurrenceOn()`
(`shared/scheduling.ts`), with the same inputs: `pooja_days` first, the cached Prokerala value only for dates
from today onward that `pooja_days` lacks. A 224-comparison parity test and route tests confirm a date the calendar
does not show cannot be booked, and the reverse. Missing, ambiguous (two nakshatras, unknown paksha,
contradictory row) or unreadable data means the pooja is **not scheduled** and booking returns
`PANCHANGAM_UNAVAILABLE`.

## What cannot be decided from one row per date

`pooja_days` holds one tithi and one nakshatra per date, and the Prokerala fallback uses the first tithi of the day.
These observances depend on a **time of day**, so a date can be wrong even when the data is clean:

| Observance                                     | Depends on                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pradosham**                                  | Trayodashi prevailing in Pradosha kala (~1.5 h either side of local sunset). Trayodashi that starts or ends during the day can make the sunrise-labelled date wrong, and can yield two or zero candidate dates. |
| Sankata Hara Chaturthi                         | Chaturthi at **moonrise**.                                                                                                                                                                                      |
| Krishna Paksha Ashtami                         | Time of day the temple requires (not published).                                                                                                                                                                |
| Amavasya, Pournami                             | Tithi at pooja time; each often spans two dates.                                                                                                                                                                |
| Krithigai, Uthiram, Chitirai, Swathi, Vishakam | Nakshatra at pooja time; spans two civil dates.                                                                                                                                                                 |
| Navavarna Pooja                                | tithi at pooja time (5 tithis).                                                                                                                                                                                 |
| Tamil Month First Saturday                     | Tamil solar month, not in the data: no automatic dates.                                                                                                                                                         |

## Dates requiring manual verification

They cannot be listed until the real data is inspected. Generate the list from an export of `pooja_days`:

```
npx tsx supabase/scripts/panchangam-review.ts pooja_days.csv review.md
```

It lists every date each Panchangam pooja would currently be offered (all Pradosham/moonrise/nakshatra dates are
time-specific by the table above), adjacent double dates, missing days (not bookable), ambiguous rows (not bookable),
and suspicious gaps (e.g. no Pradosham for more than 17 days).

## Decision needed (blocks launch of these poojas)

As built, a date labelled Trayodashi is **bookable** for Pradosham. If `pooja_days.tithi` is the sunrise tithi,
that is not reliable for the time-specific poojas. Options:

1. Confirm with whoever maintains `pooja_days` that the tithi stored is the one prevailing at the relevant time
   (sunset for Pradosham, moonrise for Sankata Hara Chaturthi). Then no change is needed.
2. Otherwise keep those poojas **unpriced** at launch (they then cannot be booked and show "Booking opens soon")
   until the temple verifies a list of dates, then price them or schedule them as special dates.
3. I add an admin "verified dates" list that an observance must appear in before it is bookable (small extension; needs your approval).
   Recommendation: option 1 or 2 for launch, option 3 afterwards.
