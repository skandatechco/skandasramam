import { PlaceholderPage } from "@/components/common/PlaceholderPage";
import { Button } from "@/components/ui/button";

export default function Calendar() {
  return (
    <PlaceholderPage
      title="Personalized Spiritual Calendar"
      description="AI-driven recommendations based on Vedic astrology and your life milestones. Sync with Google/Apple Calendar, WhatsApp, and SMS."
      action={<Button>Connect Calendar</Button>}
    />
  );
}
