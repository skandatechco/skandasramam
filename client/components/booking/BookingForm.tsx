import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiRequestError,
  createBooking,
  getPoojas,
  type CreateBookingBody,
} from "@/lib/api";
import { saveBookingToken } from "@/lib/bookingToken";
import { formatINR, todayIST } from "@/lib/format";
import { FESTIVAL_STATE_MESSAGE, type PublicFestival } from "@shared/festival";

export function poojaSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

/**
 * Booking request form shared by the Regular and Special pooja pages.
 * The server is the authority on price, schedule and validation; this form only
 * collects input, shows server errors, and prevents double submission.
 */
export function BookingForm({
  poojaTitle,
  festival,
}: {
  poojaTitle: string;
  /** a festival offering: its own slug, fixed date and fixed price (from the server) */
  festival?: PublicFestival;
}) {
  const slug = festival ? festival.slug : poojaSlug(poojaTitle);
  const navigate = useNavigate();
  // The calendar links here with ?date=YYYY-MM-DD; the server still validates it.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("date") ?? "";
  const prefillDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= todayIST()
      ? requested
      : undefined;
  const submitting = useRef(false); // synchronous guard against double-clicks

  const catalogue = useQuery({
    queryKey: ["poojas"],
    queryFn: getPoojas,
    staleTime: 60_000,
    retry: 1,
    enabled: !festival, // a festival offering is described by its own page data
  });
  const pooja = festival
    ? { bookable: festival.bookable, amount: festival.amount }
    : catalogue.data?.find((p) => p.slug === slug);

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutation = useMutation({
    mutationFn: createBooking,
    onSuccess: ({ booking, accessToken }) => {
      saveBookingToken(booking.orderNo, accessToken);
      navigate(`/booking/${encodeURIComponent(booking.orderNo)}`);
    },
    onError: (err) => {
      submitting.current = false;
      if (err instanceof ApiRequestError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || mutation.isPending || !pooja?.bookable) return;
    submitting.current = true;
    setFormError(null);
    setFieldErrors({});
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const body: CreateBookingBody = {
      poojaSlug: slug,
      date: get("date"),
      name: get("name"),
      phone: get("phone"),
      email: get("email"),
      nakshatra: get("nakshatra") || undefined,
      gotra: get("gotra") || undefined,
      sankalpam: get("sankalpam") || undefined,
    };
    mutation.mutate(body);
  }

  // ---- Availability gating: no price approved => no booking, no payment ----
  let notice: { title: string; text: string } | null = null;
  if (catalogue.isLoading) {
    notice = null;
  } else if (catalogue.isError) {
    notice = {
      title: "Online booking is temporarily unavailable",
      text: "Please try again later or contact the temple office.",
    };
  } else if (festival && festival.state !== "open") {
    notice = {
      title: "Booking is not available",
      text: FESTIVAL_STATE_MESSAGE[festival.state],
    };
  } else if (!pooja || !pooja.bookable) {
    notice = {
      title: "Online booking opens soon",
      text: "This pooja cannot be booked online yet. Please contact the temple office to arrange it.",
    };
  }
  const disabled = catalogue.isLoading || !!notice || mutation.isPending;
  const fe = fieldErrors;

  return (
    <div className="rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Booking Request</h2>

      {pooja?.bookable && (
        <p className="mt-2 text-sm">
          Pooja amount:{" "}
          <span className="font-semibold">{formatINR(pooja.amount!)}</span>
        </p>
      )}
      {notice && (
        <Alert className="mt-3">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive" className="mt-3" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <form className="mt-4 grid gap-3" onSubmit={onSubmit} noValidate={false}>
        <fieldset
          disabled={disabled}
          className="grid gap-3 border-0 p-0 m-0 min-w-0"
        >
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              autoComplete="name"
            />
            <FieldError errors={fe.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
              <FieldError errors={fe.email} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                maxLength={20}
                autoComplete="tel"
              />
              <FieldError errors={fe.phone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="nakshatra">Nakshatra</Label>
              <Input id="nakshatra" name="nakshatra" maxLength={60} />
              <FieldError errors={fe.nakshatra} />
            </div>
            <div>
              <Label htmlFor="gotra">Gotra</Label>
              <Input id="gotra" name="gotra" maxLength={60} />
              <FieldError errors={fe.gotra} />
            </div>
          </div>
          <div>
            <Label htmlFor="date">Pooja Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              required
              min={todayIST()}
              defaultValue={festival ? festival.date : prefillDate}
              readOnly={!!festival}
            />
            {festival && (
              <p className="mt-1 text-xs text-muted-foreground">
                This offering is held on this date only.
              </p>
            )}
            <FieldError errors={fe.date} />
          </div>
          <div>
            <Label htmlFor="sankalpam">Intent / Sankalpam</Label>
            <Textarea
              id="sankalpam"
              name="sankalpam"
              rows={4}
              maxLength={1000}
              placeholder="Describe your intent or sankalpam"
            />
            <FieldError errors={fe.sankalpam} />
          </div>
          <Button type="submit" className="mt-2" disabled={disabled}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : catalogue.isLoading ? (
              "Loading…"
            ) : (
              "Book Pooja"
            )}
          </Button>
        </fieldset>
      </form>
    </div>
  );
}
