import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";

/**
 * Email/password sign-in via Supabase Auth. No credentials are created, stored
 * or defaulted here. The message for a failed sign-in is deliberately generic.
 */
export function AdminLogin({ notice }: { notice?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || !supabase) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: String(f.get("email") ?? "").trim(),
      password: String(f.get("password") ?? ""),
    });
    if (err) setError("Invalid email or password.");
    submitting.current = false;
    setBusy(false);
  }

  return (
    <main className="container flex min-h-[60vh] max-w-md items-center py-12">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Temple administration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authorised temple staff only.
        </p>

        {notice && (
          <Alert className="mt-4" role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mt-4" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
