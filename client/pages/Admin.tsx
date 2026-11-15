import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogOut } from "lucide-react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { BookingsPanel } from "@/components/admin/BookingsPanel";
import { FestivalManager } from "@/components/admin/FestivalManager";
import { ScheduleManager } from "@/components/admin/ScheduleManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminApiError,
  adminApi,
  setUnauthorizedHandler,
} from "@/lib/adminApi";
import { authConfigured, supabase } from "@/lib/supabaseClient";

const EXPIRED = "Your session has ended. Please sign in again.";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="container max-w-md py-16">{children}</main>;
}

/** Signed in, but the server says this account is not an administrator. */
function NotAuthorised({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Shell>
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          This account is not authorised for temple administration.
        </AlertDescription>
      </Alert>
      <Button className="mt-4" variant="outline" onClick={onSignOut}>
        Sign out
      </Button>
    </Shell>
  );
}

function AdminConsole({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState("dashboard");
  const [bookingsKey, setBookingsKey] = useState(0);
  const [bookingsFilter, setBookingsFilter] = useState<
    "" | "awaiting_verification"
  >("");

  return (
    <main className="container py-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            Temple administration
          </h1>
          {email && (
            <p className="text-sm text-muted-foreground">
              Signed in as {email}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="schedules">Poojas &amp; schedules</TabsTrigger>
          <TabsTrigger value="festivals">Festival poojas</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-6">
          <AdminDashboard
            onOpenAwaiting={() => {
              setBookingsFilter("awaiting_verification");
              setBookingsKey((k) => k + 1);
              setTab("bookings");
            }}
          />
        </TabsContent>
        <TabsContent value="bookings" className="mt-6">
          <BookingsPanel
            key={bookingsKey}
            initialPaymentStatus={bookingsFilter}
          />
        </TabsContent>
        <TabsContent value="festivals" className="mt-6">
          <FestivalManager />
        </TabsContent>
        <TabsContent value="schedules" className="mt-6">
          <ScheduleManager />
        </TabsContent>
      </Tabs>
    </main>
  );
}

/**
 * /admin gate. The browser only ever holds the Supabase session; whether this
 * user is an administrator is decided by the SERVER (GET /api/admin/me), which
 * re-checks it on every request. Nothing here trusts a client-side role flag.
 */
export default function Admin() {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // noindex: keep the admin area out of search results
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setReady(true);
      if (event === "SIGNED_IN") setNotice(null);
      if (event === "SIGNED_OUT") qc.clear(); // drop any cached admin data
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  // Any 401 from the API (expired/revoked session) ends the session cleanly.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setNotice(EXPIRED);
      void supabase?.auth.signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const me = useQuery({
    queryKey: ["admin", "me", session?.user.id],
    queryFn: adminApi.me,
    enabled: !!session,
    retry: false,
    staleTime: 5 * 60_000,
  });

  async function signOut() {
    setNotice(null);
    await supabase?.auth.signOut();
  }

  if (!authConfigured) {
    return (
      <Shell>
        <Alert role="alert">
          <AlertDescription>
            Administration sign-in is not configured on this site.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }
  if (!ready) {
    return (
      <Shell>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      </Shell>
    );
  }
  if (!session) return <AdminLogin notice={notice} />;

  if (me.isLoading) {
    return (
      <Shell>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </p>
      </Shell>
    );
  }
  if (me.error instanceof AdminApiError && me.error.status === 403) {
    return <NotAuthorised onSignOut={signOut} />;
  }
  if (me.isError || !me.data) {
    return (
      <Shell>
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            Could not verify your access right now. Please try again.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => me.refetch()}>Try again</Button>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </Shell>
    );
  }

  return <AdminConsole email={me.data.email} onSignOut={signOut} />;
}
