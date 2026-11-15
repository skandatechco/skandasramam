import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Calendar from "./pages/Calendar";
import Devotees from "./pages/Devotees";
import Bookings from "./pages/Bookings";
import Donations from "./pages/Donations";
import BookingPayment from "./pages/BookingPayment";
import Poojas from "./pages/Poojas";
import PoojasOverview from "./pages/PoojasOverview";
import PoojasDaily from "./pages/PoojasDaily";
import SpecialPoojas from "./pages/SpecialPoojas";
import SpecialPoojaDetail from "./pages/SpecialPoojaDetail";
import FestivalPoojaDetail from "./pages/FestivalPoojaDetail";
import RegularPoojaDetail from "./pages/RegularPoojaDetail";
import Events from "./pages/Events";
import About from "./pages/About";
import AboutAsramam from "./pages/about/Asramam";
import AboutHistory from "./pages/about/History";
import AboutSwamiji from "./pages/about/Swamiji";
import AboutDeities from "./pages/about/Deities";
import Gallery from "./pages/Gallery";
import Resources from "./pages/Resources";
import Charity from "./pages/Charity";
import Contact from "./pages/Contact";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

// Admin (and the Supabase auth client it needs) is loaded only when /admin is visited,
// so the public site bundle stays small.
const Admin = lazy(() => import("./pages/Admin"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Header />
        <main id="content">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/devotees" element={<Devotees />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/donations" element={<Donations />} />
            <Route path="/booking/:orderNo" element={<BookingPayment />} />
            <Route
              path="/admin"
              element={
                <Suspense
                  fallback={
                    <p className="container py-16 text-sm text-muted-foreground">
                      Loading…
                    </p>
                  }
                >
                  <Admin />
                </Suspense>
              }
            />
            <Route path="/poojas" element={<Poojas />}>
              <Route index element={<PoojasOverview />} />
              <Route path="regular" element={<PoojasDaily />} />
              <Route path="special" element={<SpecialPoojas />} />
              <Route path="special/:slug" element={<SpecialPoojaDetail />} />
              <Route path="regular/:slug" element={<RegularPoojaDetail />} />
              <Route path="festival/:slug" element={<FestivalPoojaDetail />} />
              <Route
                path="daily"
                element={<Navigate to="/poojas/regular" replace />}
              />
            </Route>
            <Route path="/events" element={<Events />} />
            <Route path="/about" element={<About />} />
            <Route path="/about/asramam" element={<AboutAsramam />} />
            <Route path="/about/history" element={<AboutHistory />} />
            <Route path="/about/swamiji" element={<AboutSwamiji />} />
            <Route path="/about/deities" element={<AboutDeities />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/charity" element={<Charity />} />
            <Route path="/contact" element={<Contact />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
