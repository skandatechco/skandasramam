import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export function PlaceholderPage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {action}
          <Button asChild variant="outline">
            <NavLink to="/">Back to Home</NavLink>
          </Button>
        </div>
      </div>
    </section>
  );
}
