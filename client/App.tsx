import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Calendar from "./pages/Calendar";
import Devotees from "./pages/Devotees";
import Bookings from "./pages/Bookings";
import Donations from "./pages/Donations";
import Admin from "./pages/Admin";
import Poojas from "./pages/Poojas";
import PoojasOverview from "./pages/PoojasOverview";
import PoojasDaily from "./pages/PoojasDaily";
import Events from "./pages/Events";
import About from "./pages/About";
import Gallery from "./pages/Gallery";
import Resources from "./pages/Resources";
import Charity from "./pages/Charity";
import Contact from "./pages/Contact";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

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
            <Route path="/admin" element={<Admin />} />
            <Route path="/poojas" element={<Poojas />}>
              <Route index element={<PoojasOverview />} />
              <Route path="daily" element={<PoojasDaily />} />
            </Route>
            <Route path="/events" element={<Events />} />
            <Route path="/about" element={<About />} />
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
