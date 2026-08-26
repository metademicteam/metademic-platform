import type { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  Download,
  FileText,
  BarChart3,
  Users,
  Filter,
  ChevronRight,
  LogIn,
  Globe,
  Microscope,
  BookOpen,
  ArrowRight,
  PieChart,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { JournalCard } from "@/components/public/JournalCard";
import { ArticleCard } from "@/components/public/ArticleCard";

export const metadata: Metadata = {
  title: "Metademic — Scholarly Information System",
  description:
    "A repository of research journals, publications, funding sources, and researcher profiles. Assessing research impact and fostering a dynamic scholarly ecosystem in Metademic.",
  openGraph: {
    title: "Metademic — Scholarly Information System",
    description:
      "Repository of journals, publications, funding and researcher profiles — ETIS-style scholarly system.",
    type: "website",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Metademic — Scholarly Information" },
};

// ─── Data fetching ───────────────────────────────────────────────────────────
async function getLandingData() {
  try {
    const supabase = await createClient();
    const [jRes, aRes, counts] = await Promise.all([
      supabase
        .from("journals")
        .select("id,name,slug,short_name,description,issn_print,issn_online,publisher_name,settings,status")
        .eq("status", "active")
        .order("name")
        .limit(6),
      supabase
        .from("articles")
        .select("id,title,slug,abstract,article_type,published_at,article_number,journal_id, journals(name,slug)")
        .eq("publication_status", "published")
        .order("published_at", { ascending: false })
        .limit(6),
      supabase.from("journals").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    const journals = (jRes.data ?? []) as unknown[];
    const articles = (aRes.data ?? []) as unknown[];
    let articleCount = 0;
    try {
      const { count } = await supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("publication_status", "published");
      articleCount = count ?? 0;
    } catch {}
    return {
      journals: journals as never[],
      articles: articles as never[],
      journalCount: counts.count ?? journals.length,
      articleCount,
    };
  } catch {
    return { journals: [], articles: [], journalCount: 0, articleCount: 0 };
  }
}

// ─── Mock datasets (ETIS-faithful, Metademic-adapted) ──────────────────────
const PUBLICATION_BARS = [
  { year: "2018", a: 42, b: 18 },
  { year: "2019", a: 56, b: 22 },
  { year: "2020", a: 68, b: 26 },
  { year: "2021", a: 74, b: 30 },
  { year: "2022", a: 88, b: 20 },
  { year: "2023", a: 112, b: 28 },
  { year: "2024", a: 96, b: 18 },
];
const MAX_BAR = 140;

const RECENT_TABLE_ROWS = [
  { sel: true, pub: "Quantum entanglement in photonic lattices", autor: "V. Heinmaa et al.", year: "2024", edition: "Phys. Rev. Lett.", klass: "1.1", inst: "Univ. of Tartu" },
  { sel: false, pub: "Machine learning for biodiversity monitoring", autor: "M. Kõiv, J. Saar", year: "2024", edition: "Ecology Letters", klass: "1.1", inst: "Estonian Univ. Life Sci." },
  { sel: false, pub: "CRISPR editing efficiency in barley", autor: "K. Tamm, L. Vermeer", year: "2023", edition: "Plant Biotechnol. J.", klass: "1.1", inst: "Tallinn Univ. Tech." },
  { sel: true, pub: "Open peer review Adoption study", autor: "A. Sepp", year: "2023", edition: "Scientometrics", klass: "1.2", inst: "Metademic Press" },
  { sel: false, pub: "Funding acknowledgements and citation impact", autor: "E. Lukk", year: "2023", edition: "J. Informetrics", klass: "2.1", inst: "Univ. of Tartu" },
  { sel: false, pub: "Data reuse in the humanities", autor: "R. Kask, T. Pärn", year: "2022", edition: "Digital Humanities Q.", klass: "1.2", inst: "Estonian Acad. Sci." },
];

const ETIS_CARD = "rounded-[12px] border border-[#e2e8f0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06),0_4px_12px_rgba(16,24,40,0.04)] overflow-hidden";
const ETIS_LABEL = "text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]";
const ETIS_TITLE = "text-[13px] font-semibold leading-tight text-[#0f172a]";
const ETIS_LINK = "text-[11px] font-medium text-[#1e4ed8] hover:text-[#1e40af] hover:underline underline-offset-2";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function PublicLandingPage() {
  const { journals, articles, journalCount, articleCount } = await getLandingData();

  return (
    <div className="bg-[#f0f3f8] min-h-screen">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Metademic",
            url: process.env.NEXT_PUBLIC_APP_URL ?? "https://metademic.example",
            description: "Scholarly Information System — journals, publications, funding and profiles.",
          }),
        }}
      />

      {/* ───── HERO — white card, 2-col (replicates ETIS top-left card) ───── */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-6 lg:pt-8">
        <div className={`${ETIS_CARD} grid lg:grid-cols-[1.05fr_0.95fr] overflow-hidden`}>
          {/* Left: text + search */}
          <div className="p-6 sm:p-8 lg:p-9 flex flex-col justify-center">
            {/* Title — serif-like bold ETIS */}
            <h1 className="font-serif font-extrabold text-[23px] sm:text-[26px] leading-[1.15] tracking-tight text-[#0f172a]">
              Metademic Research
              <br />
              Information System
            </h1>
            <p className="mt-3 text-[12px] leading-5 text-[#64748b] max-w-[52ch]">
              A repository of research journals, publications, funding sources, and researcher profiles. Assessing
              research impact and fostering a dynamic scholarly ecosystem in Metademic.
            </p>

            {/* Search — ETIS style: input + blue button, 12px */}
            <form action="/search" method="get" className="mt-6 flex gap-2 max-w-[520px]">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  name="q"
                  placeholder="Search in Metademic..."
                  className="h-9 rounded-[6px] border-[#e2e8f0] bg-[#f8fafc] pl-9 pr-3 text-[13px] placeholder:text-[#94a3b8] focus-visible:ring-[#1e4ed8]/20 focus-visible:border-[#cbd5e1] focus-visible:bg-white"
                />
              </div>
              <Button
                type="submit"
                className="h-9 rounded-[6px] bg-[#1e4ed8] px-6 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(30,78,216,0.18)] hover:bg-[#1e40af]"
              >
                Search
              </Button>
            </form>

            {/* News link — ETIS small blue + subtle bar */}
            <div className="mt-4 flex items-center gap-3">
              <Link href="/news" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1e4ed8] hover:underline underline-offset-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" aria-hidden />
                News
                <ChevronRight className="h-3 w-3" />
              </Link>
              <span className="hidden sm:inline text-[11px] text-[#64748b] leading-none">
                Open Research Forum 2024 · New funding call announced
              </span>
            </div>

            {/* Pill shortcuts — ETIS filter chips row */}
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium tracking-wide text-[#94a3b8] uppercase mr-1">Quick:</span>
              {[
                { q: "quantum optics", label: "Quantum" },
                { q: "biodiversity", label: "Biodiversity" },
                { q: "CRISPR", label: "CRISPR" },
                { q: "peer review", label: "Peer review" },
              ].map((c) => (
                <Link
                  key={c.q}
                  href={`/search?q=${encodeURIComponent(c.q)}`}
                  className="inline-flex h-6 items-center rounded-full border border-[#e2e8f0] bg-white px-2.5 text-[11px] font-medium text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a] transition-colors"
                >
                  {c.label}
                </Link>
              ))}
              <Link href="/journals" className={ETIS_LINK + " ml-1"}>
                Browse journals →
              </Link>
            </div>
          </div>

          {/* Right: scientific image card — spider / microscope ETIS-style */}
          <div className="relative flex min-h-[280px] flex-col bg-[#0f172a] lg:min-h-[360px]">
            {/* Image area — ETIS shows Immature Philodromus spider; we recreate with a CSS scholarly composition */}
            <div className="relative flex-1 overflow-hidden">
              {/* Background: deep lab/microscope gradient with ETIS blue+yellow accent strip */}
              <div className="absolute inset-0">
                {/* subtle photo-like gradient + vignette */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 60% at 55% 40%, rgba(30,78,216,0.28) 0%, transparent 55%), radial-gradient(ellipse 50% 50% at 20% 80%, rgba(250,204,21,0.10) 0%, transparent 50%), linear-gradient(180deg, #111c33 0%, #0b1224 60%, #070d1d 100%)",
                  }}
                />
                {/* faint grid / lab bench texture */}
                <div
                  className="absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                />
              </div>

              {/* Top yellow accent — ETIS signature */}
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#facc15]" />

              {/* Center scientific visual: microscope + jumping spider silhouette composition */}
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="relative">
                  {/* Glow behind */}
                  <div className="absolute -inset-6 rounded-full bg-[#1e4ed8]/20 blur-2xl" />
                  {/* Circle stage like ETIS spider cropped circle */}
                  <div className="relative flex h-[172px] w-[172px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
                    <div className="flex h-[154px] w-[154px] items-center justify-center rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10">
                      {/* Microscope + spider icon composition */}
                      <Microscope className="h-12 w-12 text-white/85" />
                    </div>
                    {/* Orbit rings */}
                    <div className="pointer-events-none absolute inset-0 rounded-full border border-white/5" />
                    <div className="pointer-events-none absolute -inset-3 rounded-full border border-dashed border-white/10" />
                  </div>
                  {/* Small floating badges like lens specs */}
                  <div className="absolute -top-1 -right-6 rounded-md border border-white/10 bg-[#1e4ed8] px-2 py-1 text-[9px] font-bold tracking-widest text-white shadow">
                    40×
                  </div>
                  <div className="absolute -bottom-1 -left-4 rounded-md border border-white/15 bg-white px-2 py-1 text-[9px] font-semibold tracking-wide text-[#0f172a] shadow">
                    MET-2024.19
                  </div>
                </div>
              </div>

              {/* Bottom caption bar — exact ETIS style: dark overlay, 10px white, 9px credit */}
              <div className="absolute inset-x-0 bottom-0">
                <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-3 pt-8">
                  <p className="text-[11px] font-medium leading-tight text-white">
                    Scanning electron microscopy of a jumping spider eye — Metademic Imaging Facility
                  </p>
                  <p className="mt-0.5 text-[9px] leading-none text-white/60">
                    Photo: Metademic Core Lab · CC BY 4.0 · Captured on ZEISS Sigma 300
                  </p>
                </div>
              </div>
            </div>

            {/* Optional thin footer strip under image like ETIS photographer credit continuation */}
            <div className="hidden lg:flex items-center justify-between border-t border-white/10 bg-[#0f172a] px-4 py-2">
              <span className="text-[10px] text-white/50">Featured image — updated weekly</span>
              <Link href="/search?q=spider" className="text-[10px] font-medium text-[#93c5fd] hover:text-white">
                Explore arachnology →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ───── DASHBOARD GRID — light gray canvas with many white ETIS cards ───── */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pb-10 pt-5">
        {/* ETIS uses dense 12-col dashboard with mixed heights */}
        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          {/* ── CARD: Number of publications by year — blue/yellow bars (ETIS top chart) ── */}
          <div className={`${ETIS_CARD} col-span-12 lg:col-span-8 p-4 sm:p-5 flex flex-col`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={ETIS_LABEL}>Publications</p>
                <h2 className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#0f172a]">
                  <BarChart3 className="h-3.5 w-3.5 text-[#1e4ed8]" />
                  Number of publications by year
                </h2>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-[10px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-[#1e4ed8]" /> Articles
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#64748b]">
                  <span className="h-2 w-2 rounded-sm bg-[#facc15] border border-[#eab308]/30" /> Journals
                </span>
                <span className="ml-1 text-[#64748b]">{articleCount || PUBLICATION_BARS.reduce((s, r) => s + r.a, 0)} total</span>
              </div>
            </div>

            {/* Chart */}
            <div className="mt-4 flex h-[148px] items-end gap-1 sm:gap-2 border-b border-[#f1f5f9] pb-2">
              {PUBLICATION_BARS.map((d) => {
                const hA = Math.round((d.a / MAX_BAR) * 120);
                const hB = Math.round((d.b / MAX_BAR) * 120);
                return (
                  <div key={d.year} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full max-w-[56px] items-end justify-center gap-[2px]" style={{ height: 120 }}>
                      <div
                        className="w-full rounded-t-[3px] bg-[#1e4ed8] transition-all"
                        style={{ height: hA }}
                        title={`${d.year}: ${d.a} articles`}
                      />
                      <div
                        className="w-full rounded-t-[3px] bg-[#facc15] border border-[#eab308]/30"
                        style={{ height: hB }}
                        title={`${d.year}: ${d.b} journals`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[#475569]">{d.year}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] sm:hidden">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#1e4ed8]" /> Articles
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#64748b]">
                <span className="h-2 w-2 rounded-sm bg-[#facc15]" /> Journals
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-[#94a3b8]">Source: Metademic registry · updated daily</span>
              <Link href="/articles" className={ETIS_LINK}>
                View all publications →
              </Link>
            </div>
          </div>

          {/* ── CARD: Erik Tamm profile placeholder → Lukas Vermeer (featured researcher) ── */}
          <div className={`${ETIS_CARD} col-span-12 sm:col-span-6 lg:col-span-4 p-0 flex flex-col`}>
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className={ETIS_LABEL}>Researcher profile</p>
                <Link href="/authors" className={ETIS_LINK}>
                  ETIS CV ↗
                </Link>
              </div>
              <div className="mt-3 flex gap-3">
                <div className="h-14 w-14 shrink-0 rounded-full bg-[#eef2ff] border border-[#e0e7ff] flex items-center justify-center overflow-hidden">
                  <span className="text-[13px] font-bold tracking-wide text-[#1e4ed8]">LV</span>
                </div>
                <div className="min-w-0">
                  <h3 className={ETIS_TITLE}>Dr. Lukas Vermeer</h3>
                  <p className="text-[11px] text-[#64748b]">Associate Professor · Univ. of Tartu</p>
                  <p className="text-[11px] text-[#475569]">Plant Biotechnology · CRISPR & barley</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-medium text-[#475569] border border-[#e2e8f0]">
                      ORCID 0000-0002-…
                    </span>
                    <span className="rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-medium text-[#854d0e] border border-[#fde68a]">Top 2% cited</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-[#f1f5f9] rounded-lg border border-[#f1f5f9] bg-[#f8fafc] text-center">
                <div className="py-2">
                  <p className="text-[13px] font-bold leading-none text-[#0f172a]">47</p>
                  <p className="mt-0.5 text-[9px] font-medium tracking-wide uppercase text-[#94a3b8]">Publications</p>
                </div>
                <div className="py-2">
                  <p className="text-[13px] font-bold leading-none text-[#0f172a]">1.2k</p>
                  <p className="mt-0.5 text-[9px] font-medium tracking-wide uppercase text-[#94a3b8]">Citations</p>
                </div>
                <div className="py-2">
                  <p className="text-[13px] font-bold leading-none text-[#0f172a]">h-19</p>
                  <p className="mt-0.5 text-[9px] font-medium tracking-wide uppercase text-[#94a3b8]">h-index</p>
                </div>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[#f1f5f9] bg-[#f8fafc]/60 px-4 py-2.5">
              <span className="text-[11px] text-[#64748b]">Verified · Metademic ID 8831</span>
              <Link href="/authors" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1e4ed8] hover:underline">
                View profile <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* ── CARD: Login (ETIS eesti.ee style) ── */}
          <div className={`${ETIS_CARD} col-span-12 sm:col-span-6 lg:col-span-4 p-5 flex flex-col`}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f1f5f9] border border-[#e2e8f0]">
                <LogIn className="h-3.5 w-3.5 text-[#475569]" />
              </span>
              <p className={ETIS_LABEL}>Access · Metademic</p>
            </div>
            <h3 className="mt-3 text-[13px] font-semibold text-[#0f172a]">Sign in to manage your records</h3>
            <p className="mt-1 text-[11px] leading-4 text-[#64748b]">
              Authors, editors, and reviewers use a single sign-on. Link your ORCID and submit or review.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild className="h-8 flex-1 rounded-[6px] bg-[#1e4ed8] text-[12px] font-medium hover:bg-[#1e40af]">
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-8 flex-1 rounded-[6px] border-[#e2e8f0] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc]"
              >
                <Link href="/auth/register">Create account</Link>
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 rounded-md border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
              <span className="text-[10px] font-medium text-[#475569]">ORCID · Institutional SSO · Email</span>
            </div>
            <Link href="/about" className={ETIS_LINK + " mt-3 inline-flex"}>
              How Metademic works →
            </Link>
          </div>

          {/* ── CARD: Marta Kõiv profile (ETIS second researcher card) ── */}
          <div className={`${ETIS_CARD} col-span-12 sm:col-span-6 lg:col-span-4 p-0 flex flex-col`}>
            <div className="h-1.5 bg-[#1e4ed8]" />
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={ETIS_LABEL}>Featured researcher</p>
                  <h3 className="mt-1 text-[14px] font-bold text-[#0f172a]">Marta Kõiv</h3>
                  <p className="text-[11px] text-[#1e4ed8] font-medium">Estonian University of Life Sciences</p>
                  <p className="text-[11px] text-[#64748b]">Landscape ecology · Biodiversity monitoring</p>
                </div>
                <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-center">
                  <span className="text-xs font-bold text-[#94a3b8]">MK</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="rounded-full bg-[#eef2ff] text-[#1e4ed8] border-[#e0e7ff] text-[10px] px-2 py-0">
                  32 publications
                </Badge>
                <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 border-[#e2e8f0] text-[#475569]">
                  Supervisor
                </Badge>
                <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 border-[#e2e8f0] text-[#475569]">
                  Reviewer
                </Badge>
              </div>
              <div className="mt-3 rounded-lg bg-[#f8fafc] border border-[#f1f5f9] px-3 py-2.5">
                <p className="text-[11px] font-medium text-[#334155]">Latest: ML for biodiversity monitoring</p>
                <p className="text-[10px] text-[#64748b]">Ecology Letters · 2024 · cited 47×</p>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[#f1f5f9] px-4 py-2.5">
              <span className="text-[10px] text-[#94a3b8]">Profile ID · ETIS-12741</span>
              <Link href="/authors" className={ETIS_LINK}>
                Open CV →
              </Link>
            </div>
          </div>

          {/* ── CARD: Search results hero — "Jumping Spider" → Quantum (469595 results ETIS-style) ── */}
          <div className={`${ETIS_CARD} col-span-12 lg:col-span-4 p-0 flex flex-col`}>
            <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
              <p className={ETIS_LABEL}>Search results</p>
              <span className="text-[10px] font-mono text-[#64748b] bg-white border border-[#e2e8f0] rounded px-1.5 py-0.5">
                469 595 hits
              </span>
            </div>
            <div className="p-4">
              <div className="rounded-md border border-[#e2e8f0] bg-white flex items-center gap-2 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-[#94a3b8] shrink-0" />
                <span className="text-[12px] text-[#0f172a] truncate">Quantum optics</span>
                <span className="ml-auto text-[10px] text-[#94a3b8]">× Clear</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1e4ed8] text-white px-2 py-1 font-medium">
                  All 469k
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[#475569]">
                  Articles 412k
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[#475569]">
                  Journals 8
                </span>
              </div>
              <div className="mt-4 space-y-2.5">
                <div className="flex gap-2">
                  <span className="mt-0.5 h-4 w-4 rounded bg-[#1e4ed8] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                    1
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium leading-tight text-[#0f172a] line-clamp-2">
                      Coherent control of entangled photon pairs in metropolitan fibre
                    </p>
                    <p className="text-[10px] text-[#64748b]">V. Heinmaa et al. · 2024 · Phys. Rev. Lett.</p>
                  </div>
                </div>
                <div className="flex gap-2 opacity-80">
                  <span className="mt-0.5 h-4 w-4 rounded bg-[#f1f5f9] border border-[#e2e8f0] flex items-center justify-center text-[9px] font-bold text-[#475569] shrink-0">
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium leading-tight text-[#0f172a] line-clamp-2">
                      Quantum key distribution — 8-year field trial
                    </p>
                    <p className="text-[10px] text-[#64748b]">L. Vermeer · 2023 · Nature Photon.</p>
                  </div>
                </div>
                <div className="flex gap-2 opacity-60">
                  <span className="mt-0.5 h-4 w-4 rounded bg-[#f1f5f9] border border-[#e2e8f0] flex items-center justify-center text-[9px] font-bold text-[#475569] shrink-0">
                    3
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium leading-tight text-[#0f172a] line-clamp-2">
                      Funding landscapes for quantum research in the Baltics
                    </p>
                    <p className="text-[10px] text-[#64748b]">E. Lukk · 2023 · Scientometrics</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[#f1f5f9] bg-[#f8fafc]/70 px-4 py-2.5">
              <span className="text-[10px] text-[#94a3b8]">Sorted by relevance</span>
              <Link href="/search?q=quantum" className={ETIS_LINK}>
                View all 469k →
              </Link>
            </div>
          </div>

          {/* ── CARD: Analytics — pie + bar mini (ETIS two small charts) ── */}
          <div className={`${ETIS_CARD} col-span-12 sm:col-span-6 lg:col-span-4 p-4 flex flex-col`}>
            <div className="flex items-center justify-between">
              <p className={ETIS_LABEL}>Analytics</p>
              <Settings2 className="h-3.5 w-3.5 text-[#94a3b8]" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {/* Pie */}
              <div className="flex flex-col items-center">
                <div className="relative h-[96px] w-[96px]">
                  {/* Pie via conic gradient */}
                  <div
                    className="h-full w-full rounded-full border border-[#e2e8f0]"
                    style={{
                      background: `conic-gradient(#1e4ed8 0 54%, #facc15 54% 78%, #e2e8f0 78% 100%)`,
                    }}
                  />
                  <div className="absolute inset-[14px] rounded-full bg-white border border-[#f1f5f9] flex flex-col items-center justify-center">
                    <span className="text-[13px] font-bold leading-none text-[#0f172a]">54%</span>
                    <span className="text-[9px] font-medium tracking-wide uppercase text-[#94a3b8]">Articles</span>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-[10px] leading-none">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#1e4ed8]" /> <span className="text-[#334155]">STEM 54%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#facc15]" /> <span className="text-[#334155]">HSS 24%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1]" /> <span className="text-[#64748b]">Other 22%</span>
                  </div>
                </div>
              </div>
              {/* Tiny vertical bars */}
              <div className="flex flex-col">
                <p className="text-[10px] font-semibold tracking-wide uppercase text-[#64748b]">Citations by field</p>
                <div className="mt-2 flex h-[96px] items-end gap-1.5">
                  {[
                    { h: 72, c: "#1e4ed8" },
                    { h: 48, c: "#facc15" },
                    { h: 86, c: "#1e4ed8" },
                    { h: 38, c: "#94a3b8" },
                    { h: 62, c: "#1e4ed8" },
                    { h: 28, c: "#e2e8f0" },
                  ].map((b, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[3px] border border-black/5"
                      style={{ height: b.h, background: b.c }}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] text-[#94a3b8] font-medium">
                  <span>BIO</span>
                  <span>PHY</span>
                  <span>MED</span>
                  <span>HUM</span>
                  <span>ENG</span>
                  <span>OTH</span>
                </div>
                <Link href="/articles" className={ETIS_LINK + " mt-2 inline-flex items-center gap-1"}>
                  <PieChart className="h-3 w-3" /> Detailed stats
                </Link>
              </div>
            </div>
            <div className="mt-3 rounded-md bg-[#f8fafc] border border-[#f1f5f9] px-2.5 py-2 flex items-center justify-between">
              <span className="text-[10px] text-[#64748b]">Coverage · 2018–2024</span>
              <span className="text-[10px] font-medium text-[#0f172a]">{journalCount || 8} journals · {articleCount || 342} articles</span>
            </div>
          </div>

          {/* ── CARD: Filters / classification sidebar (ETIS left filter pane) ── */}
          <div className={`${ETIS_CARD} col-span-12 sm:col-span-6 lg:col-span-4 p-4 flex flex-col`}>
            <div className="flex items-center justify-between">
              <p className={ETIS_LABEL}>Refine results</p>
              <span className="text-[10px] text-[#94a3b8]">Clear all</span>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-[#0f172a] flex items-center gap-1.5">
                  <Filter className="h-3 w-3 text-[#94a3b8]" /> Publication type
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {[
                    { label: "Journal article (1.1)", count: 312, checked: true },
                    { label: "Review article (1.2)", count: 48, checked: false },
                    { label: "Conference paper (3.4)", count: 27, checked: false },
                    { label: "Dataset (3.5)", count: 9, checked: false },
                  ].map((r) => (
                    <label key={r.label} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked={r.checked}
                        className="h-3 w-3 rounded border-[#cbd5e1] text-[#1e4ed8] focus:ring-[#1e4ed8]/20"
                      />
                      <span className={r.checked ? "text-[#0f172a] font-medium" : "text-[#475569]"}>{r.label}</span>
                      <span className="ml-auto text-[10px] text-[#94a3b8]">{r.count}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#f1f5f9] pt-3">
                <p className="text-[11px] font-semibold text-[#0f172a]">Institution</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="rounded-full bg-[#1e4ed8] text-white px-2 py-1 text-[10px] font-medium">Univ. of Tartu (142)</span>
                  <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[10px] text-[#475569]">TalTech (89)</span>
                  <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[10px] text-[#475569]">EMÜ (41)</span>
                  <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[10px] text-[#475569]">+ 6 more</span>
                </div>
              </div>
              <Button className="w-full h-7 rounded-[6px] bg-[#0f172a] text-white text-[11px] font-medium hover:bg-[#1e293b] mt-1">
                Apply filters · 984 matches
              </Button>
            </div>
          </div>

          {/* ── CARD: Results table — 984 results ETIS dense table ── */}
          <div className={`${ETIS_CARD} col-span-12 lg:col-span-8 flex flex-col`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className={ETIS_TITLE}>Search results</h2>
                <span className="rounded bg-white border border-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-mono text-[#475569]">984 results</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline text-[10px] text-[#94a3b8]">Sort: Relevance</span>
                <Button variant="outline" className="h-6 rounded-[6px] border-[#e2e8f0] bg-white px-2 text-[10px] font-medium text-[#475569]">
                  <Download className="h-3 w-3 mr-1" /> Export
                </Button>
              </div>
            </div>

            {/* Table scroll */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#f1f5f9] bg-white">
                    <th className="w-7 px-2 py-2">
                      <input type="checkbox" className="h-3 w-3 rounded border-[#cbd5e1]" />
                    </th>
                    {["Publication", "Autor", "Year", "Edition title", "Classification", "Institution"].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-2 text-[10px] font-semibold tracking-[0.08em] uppercase text-[#64748b] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {RECENT_TABLE_ROWS.map((row, i) => (
                    <tr key={i} className={row.sel ? "bg-[#f8fafc]" : "bg-white hover:bg-[#f8fafc]/60"}>
                      <td className="px-2 py-2.5">
                        <input type="checkbox" defaultChecked={row.sel} className="h-3 w-3 rounded border-[#cbd5e1] text-[#1e4ed8]" />
                      </td>
                      <td className="px-2 py-2.5 max-w-[220px]">
                        <Link href="/articles" className="text-[11px] font-medium leading-tight text-[#1e4ed8] hover:underline line-clamp-2">
                          {row.pub}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-[#475569] whitespace-nowrap">{row.autor}</td>
                      <td className="px-2 py-2.5 text-[11px] text-[#475569]">{row.year}</td>
                      <td className="px-2 py-2.5 text-[11px] text-[#475569] max-w-[150px] truncate">{row.edition}</td>
                      <td className="px-2 py-2.5">
                        <span className="rounded bg-[#fef9c3] border border-[#fde68a] px-1.5 py-0.5 text-[10px] font-medium text-[#854d0e]">
                          {row.klass}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-[#64748b] whitespace-nowrap">{row.inst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer pagination like ETIS */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] bg-[#f8fafc]/50 px-4 py-2.5 text-[11px]">
              <span className="text-[#64748b]">Showing 1–6 of 984 · Select all 984</span>
              <div className="flex items-center gap-1">
                <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#94a3b8]">‹</button>
                <button className="h-6 w-6 rounded bg-[#1e4ed8] text-white text-[11px] font-medium">1</button>
                <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569] text-[11px]">2</button>
                <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569] text-[11px]">3</button>
                <span className="px-1 text-[#94a3b8]">…</span>
                <button className="h-6 w-6 rounded border border-[#e2e8f0] bg-white text-[#475569]">›</button>
              </div>
            </div>
          </div>

          {/* ── RIGHT STACK: Export + Quick stats ── */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            {/* Export publications card — ETIS export widget */}
            <div className={`${ETIS_CARD} p-4`}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1e4ed8] text-white">
                  <Download className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className={ETIS_LABEL}>Export</p>
                  <p className="text-[12px] font-semibold text-[#0f172a]">Export publications</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[#64748b]">
                Download the current result set (984 records) in your preferred bibliographic format.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {["BibTeX", "RIS", "CSV"].map((fmt) => (
                  <button
                    key={fmt}
                    className="rounded-[6px] border border-[#e2e8f0] bg-white px-2 py-2 text-[11px] font-medium text-[#334155] hover:bg-[#f8fafc] hover:border-[#cbd5e1]"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <button className="mt-2 w-full rounded-[6px] bg-[#facc15] border border-[#eab308]/30 px-3 py-2 text-[11px] font-semibold text-[#422006] hover:bg-[#fde047] flex items-center justify-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Export 984 records
              </button>
              <p className="mt-2 text-center text-[10px] text-[#94a3b8]">ETIS-compatible · Crossref-ready metadata</p>
            </div>

            {/* Platform at-a-glance */}
            <div className={`${ETIS_CARD} p-4`}>
              <div className="flex items-center justify-between">
                <p className={ETIS_LABEL}>Metademic at a glance</p>
                <Globe className="h-3.5 w-3.5 text-[#94a3b8]" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
                  <p className="text-[10px] font-medium tracking-wide uppercase text-[#64748b]">Journals</p>
                  <p className="text-[18px] font-bold leading-none text-[#0f172a] mt-1">{journalCount || 8}</p>
                  <p className="text-[10px] text-[#94a3b8]">active titles</p>
                </div>
                <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
                  <p className="text-[10px] font-medium tracking-wide uppercase text-[#64748b]">Articles</p>
                  <p className="text-[18px] font-bold leading-none text-[#0f172a] mt-1">{articleCount || 342}</p>
                  <p className="text-[10px] text-[#94a3b8]">open access</p>
                </div>
                <div className="rounded-lg border border-[#e0e7ff] bg-[#eef2ff] px-3 py-2.5">
                  <p className="text-[10px] font-medium tracking-wide uppercase text-[#6b7280]">Researchers</p>
                  <p className="text-[18px] font-bold leading-none text-[#1e4ed8] mt-1">1,240</p>
                  <p className="text-[10px] text-[#64748b]">verified profiles</p>
                </div>
                <div className="rounded-lg border border-[#fef9c3] bg-[#fefce8] px-3 py-2.5">
                  <p className="text-[10px] font-medium tracking-wide uppercase text-[#854d0e]">Citations</p>
                  <p className="text-[18px] font-bold leading-none text-[#422006] mt-1">18.4k</p>
                  <p className="text-[10px] text-[#a16207]">tracked</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                <Link href="/journals" className="inline-flex items-center gap-1 font-medium text-[#1e4ed8] hover:underline">
                  Browse journals <ArrowRight className="h-3 w-3" />
                </Link>
                <span className="text-[#e2e8f0]">|</span>
                <Link href="/articles" className="font-medium text-[#1e4ed8] hover:underline">
                  Explore articles
                </Link>
              </div>
            </div>

            {/* Mini news — ETIS news list dense */}
            <div className={`${ETIS_CARD} p-4`}>
              <div className="flex items-center justify-between">
                <p className={ETIS_LABEL}>News & updates</p>
                <Link href="/news" className={ETIS_LINK}>
                  All news →
                </Link>
              </div>
              <div className="mt-3 space-y-2.5">
                {[
                  { date: "12 Aug 2024", title: "Metademic joins Crossref — DOI auto-registration live", tag: "Platform" },
                  { date: "05 Aug 2024", title: "New editorial policy: open peer review pilot in 3 journals", tag: "Editorial" },
                  { date: "28 Jul 2024", title: "Funding module: Estonian Research Council grants synced", tag: "Funding" },
                ].map((n) => (
                  <div key={n.title} className="flex gap-2.5 border-b border-[#f1f5f9] pb-2.5 last:border-0 last:pb-0">
                    <div className="shrink-0 rounded bg-[#f1f5f9] border border-[#e2e8f0] px-1.5 py-1 text-center leading-none">
                      <p className="text-[9px] font-bold tracking-wide uppercase text-[#475569]">{n.date.split(" ")[1]}</p>
                      <p className="text-[11px] font-bold text-[#0f172a]">{n.date.split(" ")[0]}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight text-[#0f172a] line-clamp-2">{n.title}</p>
                      <span className="mt-0.5 inline-flex rounded-full bg-[#f1f5f9] border border-[#e2e8f0] px-1.5 py-0 text-[9px] font-medium text-[#475569]">
                        {n.tag}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Full width: Real journals from Supabase + real articles (ETIS-supplemented) ── */}
          <div className="col-span-12">
            {/* Divider like ETIS hr */}
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e2e8f0]" />
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#94a3b8]">Live from Metademic registry</span>
              <div className="h-px flex-1 bg-[#e2e8f0]" />
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* Featured journals (real) */}
              <div className={`${ETIS_CARD} col-span-12 lg:col-span-12 p-4 sm:p-5`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={ETIS_LABEL}>Journals · live</p>
                    <h2 className="mt-1 text-[14px] font-bold tracking-tight text-[#0f172a]">Featured journals</h2>
                    <p className="text-[11px] text-[#64748b]">Discover titles across disciplines — each with its own editorial board and archive.</p>
                  </div>
                  <Button variant="outline" size="sm" asChild className="h-7 rounded-[6px] border-[#e2e8f0] bg-white text-[11px] font-medium text-[#334155] hover:bg-[#f8fafc]">
                    <Link href="/journals">All journals →</Link>
                  </Button>
                </div>
                {journals.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-[#e2e8f0] bg-[#f8fafc] py-10 text-center">
                    <BookOpen className="h-6 w-6 mx-auto text-[#94a3b8] mb-2" />
                    <p className="text-[12px] font-medium text-[#475569]">No active journals yet</p>
                    <p className="text-[11px] text-[#94a3b8] mt-1">Seed journals will appear here once published.</p>
                  </div>
                ) : (
                  <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(
                      journals as unknown as Array<{
                        id: string;
                        name: string;
                        slug: string;
                        short_name: string | null;
                        description: string | null;
                        issn_print: string | null;
                        issn_online: string | null;
                        publisher_name: string | null;
                        settings: Record<string, unknown> | null;
                      }>
                    ).map((j) => (
                      <JournalCard key={j.id} journal={j} />
                    ))}
                  </div>
                )}
              </div>

              {/* Recent articles (real) */}
              <div className={`${ETIS_CARD} col-span-12 p-4 sm:p-5`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={ETIS_LABEL}>Articles · live</p>
                    <h2 className="mt-1 text-[14px] font-bold tracking-tight text-[#0f172a]">Recent articles — openly available with DOI</h2>
                    <p className="text-[11px] text-[#64748b]">Latest published research, updated from the Metademic production pipeline.</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="h-7 rounded-[6px] text-[11px] font-medium text-[#475569] hover:bg-[#f1f5f9]">
                    <Link href="/articles">All articles →</Link>
                  </Button>
                </div>
                {articles.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-[#e2e8f0] bg-[#f8fafc] py-10 text-center text-[12px] text-[#94a3b8]">
                    No published articles yet. Articles will appear here after production and publication.
                  </div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(
                      articles as unknown as Array<{
                        id: string;
                        title: string;
                        slug: string;
                        abstract: string | null;
                        article_type: string | null;
                        published_at: string | null;
                        article_number: string | null;
                        journals: { name: string; slug: string } | null;
                      }>
                    ).map((a) => (
                      <ArticleCard
                        key={a.id}
                        article={{
                          id: a.id,
                          slug: a.slug,
                          title: a.title,
                          abstract: a.abstract,
                          article_type: a.article_type,
                          published_at: a.published_at,
                          article_number: a.article_number,
                          journal: a.journals ?? undefined,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer strip: how Metademic works — ETIS minimal 3-col ── */}
          <div className={`${ETIS_CARD} col-span-12 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12px] font-bold tracking-tight text-[#0f172a]">How Metademic works</h3>
              <span className="text-[11px] text-[#94a3b8]">From manuscript to citable article — every step tracked and auditable.</span>
            </div>
            <div className="mt-4 grid md:grid-cols-3 gap-3">
              {[
                { icon: FileText, t: "Submit & scope", d: "Guided wizard, Cloudinary uploads, technical check." },
                { icon: Users, t: "Peer review", d: "Reviewer matching, blinded reports, audit log." },
                { icon: BookOpen, t: "Publish & DOI", d: "Production, proof, Crossref DOI & open dissemination." },
              ].map((s) => (
                <div key={s.t} className="flex gap-3 rounded-lg border border-[#f1f5f9] bg-[#f8fafc] px-3 py-3">
                  <s.icon className="h-4 w-4 mt-0.5 text-[#94a3b8] shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#0f172a]">{s.t}</p>
                    <p className="text-[11px] leading-4 text-[#64748b] mt-0.5">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CTA — ETIS dark footer bar but minimal ── */}
      <div className="border-t border-[#e2e8f0] bg-white">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[#0f172a]">Ready to publish with Metademic?</h3>
            <p className="text-[11px] text-[#64748b] mt-0.5">Create an author account, submit your manuscript, and track every review round.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild className="h-8 rounded-[6px] bg-[#1e4ed8] text-[12px] font-medium hover:bg-[#1e40af]">
              <Link href="/auth/register">Create account</Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="h-8 rounded-[6px] border-[#e2e8f0] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc]"
            >
              <Link href="/about">About the platform</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
