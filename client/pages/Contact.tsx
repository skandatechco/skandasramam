import { PlaceholderPage } from "@/components/common/PlaceholderPage";

import { useMemo } from "react";

const ADDRESS =
  "Om Sri Skandasramam, 1, Kambar St, Rajaji Nagar, Ambedkar Nagar, Selaiyur, Chennai, Tamil Nadu 600073";
const MAPS_LINK = "https://maps.app.goo.gl/kcTPDdMhTnXTodA6A";
const WEBSITE = "https://www.skandasramam.com";
const PHONE = ""; // set when available

export default function Contact() {
  const mapSrc = useMemo(() => {
    const q = encodeURIComponent(ADDRESS);
    return `https://www.google.com/maps?q=${q}&output=embed`;
  }, []);

  return (
    <main className="container py-10 md:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight">Contact</h1>
      <p className="mt-2 text-muted-foreground max-w-2xl">
        Reach out for guidance, bookings, or general inquiries.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl overflow-hidden border bg-muted">
          <iframe
            title="Om Sri Skandasramam Location"
            src={mapSrc}
            width="100%"
            height="360"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="rounded-xl border p-6 bg-card">
          <h2 className="text-xl font-semibold">Om Sri Skandasramam</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="font-medium">Address</div>
              <p className="text-muted-foreground leading-relaxed">{ADDRESS}</p>
              <a
                href={MAPS_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-primary hover:underline"
              >
                Open in Google Maps
              </a>
            </div>
            <div>
              <div className="font-medium">Website</div>
              <a
                href={WEBSITE}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                www.skandasramam.com
              </a>
            </div>
            {PHONE && (
              <div>
                <div className="font-medium">Phone</div>
                <a
                  href={`tel:${PHONE}`}
                  className="text-primary hover:underline"
                >
                  {PHONE}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
