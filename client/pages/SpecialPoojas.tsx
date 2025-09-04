import { PlaceholderPage } from "@/components/common/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function SpecialPoojas() {
  return (
    <PlaceholderPage
      title="Special Poojas"
      description="Festival and sankalpa-based poojas performed on auspicious days with elaborate rituals."
      action={
        <Button asChild>
          <NavLink to="/bookings">Book Special Pooja</NavLink>
        </Button>
      }
    />
  );
}
