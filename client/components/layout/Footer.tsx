export function Footer() {
  return (
    <footer className="border-t mt-16">
      <div className="container py-10 grid gap-8 md:grid-cols-3">
        <div>
          <h3 className="font-bold">Chennai Om Sri Skandashramam</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Preserving tradition, empowering devotion through technology.
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Platform</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>Devotee Management</li>
            <li>Family Heritage Vault</li>
            <li>Spiritual Calendar</li>
            <li>Bookings & Donations</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold">Compliance</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>GDPR & Indian IT compliance</li>
            <li>Role-based permissions</li>
            <li>Encrypted counseling</li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container py-6 text-xs text-muted-foreground flex flex-col md:flex-row gap-3 items-center justify-between">
          <p>© {new Date().getFullYear()} Chennai Om Sri Skandashramam. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
