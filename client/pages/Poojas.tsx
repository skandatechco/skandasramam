import { PlaceholderPage } from "@/components/common/PlaceholderPage";
import { Button } from "@/components/ui/button";

export default function Poojas() {
  return (
    <PlaceholderPage
      title="Poojas"
      description="Browse and book poojas, schedule birthstar observances, and set recurring services."
      action={<Button>Explore Poojas</Button>}
    />
  );
}
