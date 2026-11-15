/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" only at launch, once the real temple QR is in public/images. */
  readonly VITE_PAYMENT_QR_CONFIGURED?: string;
  readonly VITE_UPI_ID?: string;
  /** Public project URL and ANON key only. Never the service-role key. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
