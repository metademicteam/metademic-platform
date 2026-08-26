import Link from "next/link";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Journals", href: "/journals" },
      { label: "Articles", href: "/articles" },
      { label: "Issues", href: "/issues" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    title: "For Authors",
    links: [
      { label: "Author Guidelines", href: "/about#author-guidelines" },
      { label: "Submit Manuscript", href: "/author/submissions/new" },
      { label: "Publication Ethics", href: "/about#ethics" },
      { label: "APC Information", href: "/about#apc" },
    ],
  },
  {
    title: "For Reviewers",
    links: [
      { label: "Reviewer Guidelines", href: "/about#reviewer-guidelines" },
      { label: "Peer Review Process", href: "/about#peer-review" },
      { label: "Editorial Board", href: "/about#editorial-board" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Help Center", href: "/help" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex" aria-label="Metademic — home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://res.cloudinary.com/uwwehxni/image/upload/v1787689745/metademic_logo.png"
                alt="Metademic"
                className="h-8 w-auto"
              />
            </Link>
            <p className="mt-3 text-sm text-muted-foreground leading-6">
              An open scholarly publishing platform for journals, manuscripts, peer review, and research dissemination.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Metademic. All rights reserved. Published content licensed under CC BY 4.0 unless otherwise noted.</p>
          <p className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/sitemap.xml" className="hover:text-foreground">Sitemap</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
