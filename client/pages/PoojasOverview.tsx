import { PlaceholderPage } from "@/components/common/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function PoojasOverview() {
  return (
    <PlaceholderPage
      title="Poojas Overview"
      description="Explore our sacred services. For the current schedule of daily poojas, view the Daily Poojas section."
      action={
        <Button asChild>
          <NavLink to="/poojas/daily">View Daily Poojas</NavLink>
        </Button>
      }
    />
  );
}
