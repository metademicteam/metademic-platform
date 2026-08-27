"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, Lightbulb, Search, CornerDownLeft } from "lucide-react";

/**
 * Curated research-keyword vocabulary for type-ahead suggestions.
 * Grouped by broad discipline but stored flat so a single search hits everything.
 */
const TAXONOMY = [
  // Methods & statistics
  "machine learning", "deep learning", "neural networks", "natural language processing",
  "computer vision", "reinforcement learning", "supervised learning", "unsupervised learning",
  "statistical analysis", "meta-analysis", "systematic review", "randomized controlled trial",
  "cohort study", "case-control study", "longitudinal study", "cross-sectional study",
  "qualitative research", "quantitative research", "survival analysis", "regression analysis",
  "clustering", "dimensionality reduction", "data mining", "big data", "data science",
  "simulation", "optimization", "genetic algorithm", "bayesian inference", "causal inference",
  "network analysis", "text mining", "sentiment analysis", "topic modeling", "time series",
  "structural equation modeling", "survey methodology", "ethnography", "action research",
  "case study", "grounded theory", "natural experiment", "computational modeling",
  // Computer science & AI
  "artificial intelligence", "computer science", "software engineering", "human-computer interaction",
  "information retrieval", "cybersecurity", "blockchain", "cloud computing", "edge computing",
  "distributed systems", "parallel computing", "algorithm", "data structure", "programming languages",
  "operating systems", "computer networks", "database systems", "data visualization",
  "explainable ai", "generative adversarial network", "transformer", "large language model",
  "semantic web", "knowledge graph", "recommendation system", "speech recognition", "robotics",
  "internet of things", "quantum computing", "cryptography", "privacy", "federated learning",
  // Life sciences & medicine
  "bioinformatics", "genomics", "proteomics", "metabolomics", "transcriptomics", "epigenetics",
  "crispr", "gene editing", "molecular biology", "cell biology", "immunology", "microbiology",
  "virology", "neuroscience", "pharmacology", "clinical trial", "public health", "epidemiology",
  "oncology", "cardiology", "endocrinology", "genetics", "evolutionary biology", "ecology",
  "systems biology", "drug discovery", "biomarker", "precision medicine", "telemedicine",
  "biomedical engineering", "biostatistics", "physiology", "pathology", "radiology",
  // Physical sciences & engineering
  "physics", "quantum mechanics", "condensed matter", "materials science", "nanotechnology",
  "chemistry", "organic chemistry", "analytical chemistry", "physical chemistry", "biochemistry",
  "chemical engineering", "mechanical engineering", "electrical engineering", "civil engineering",
  "environmental engineering", "renewable energy", "solar energy", "wind energy", "energy storage",
  "fluid dynamics", "thermodynamics", "optics", "photonics", "acoustics", "geology", "meteorology",
  "climate change", "climate science", "hydrology", "oceanography", "astronomy", "astrophysics",
  "cosmology", "space science", "remote sensing", "geospatial", "geographic information system",
  // Social sciences & humanities
  "psychology", "cognitive science", "behavioral science", "sociology", "anthropology",
  "economics", "econometrics", "political science", "international relations", "public policy",
  "law", "criminology", "education", "educational technology", "linguistics", "philosophy",
  "ethics", "history", "archaeology", "geography", "demography", "social work", "communication",
  "media studies", "cultural studies", "gender studies", "urban studies", "development studies",
  "management", "organizational behavior", "marketing", "finance", "accounting", "entrepreneurship",
  // Scholarly publishing
  "open access", "open science", "scientific publishing", "peer review", "scholarly communication",
  "bibliometrics", "scientometrics", "altmetrics", "citation analysis", "research data management",
  "research reproducibility", "preprint", "predatory publishing", "research integrity",
  "research impact", "knowledge management", "digital library", "information science",
] as const;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "being", "this", "that", "these",
  "those", "it", "its", "their", "they", "we", "our", "you", "your", "us", "each", "other",
  "more", "most", "some", "such", "between", "into", "over", "under", "through", "after",
  "before", "during", "using", "used", "use", "results", "result", "study", "studies", "paper",
  "research", "analysis", "method", "methods", "approach", "based", "new", "novel", "proposed",
  "present", "presented", "aim", "aims", "objective", "objectives", "conclusion", "conclusions",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Derived keywords from the manuscript title/abstract, ranked by weight. */
function extractCandidates(title: string, abstract: string): string[] {
  const freq = new Map<string, number>();
  const bump = (tokens: string[], weight: number) => {
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + weight);
  };
  bump(tokenize(title), 4);
  bump(tokenize(abstract), 1);

  // Multi-word capitalized phrases in the title (e.g. "Machine Learning")
  const phrases = (title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? []).map((p) => p.toLowerCase());
  for (const p of phrases) {
    if (!STOPWORDS.has(p)) freq.set(p, (freq.get(p) ?? 0) + 5);
  }

  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 12);
}

export function KeywordSuggestions({
  keywords,
  onAdd,
  onRemove,
  title,
  abstract,
}: {
  keywords: string[];
  onAdd: (keyword: string) => void;
  onRemove: (index: number) => void;
  title: string;
  abstract: string;
}) {
  const [query, setQuery] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  const derived = React.useMemo(() => extractCandidates(title ?? "", abstract ?? ""), [title, abstract]);

  const selected = React.useMemo(() => new Set(keywords), [keywords]);
  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TAXONOMY.filter((term) => term.toLowerCase().includes(q) && !selected.has(term)).slice(0, 8);
  }, [query, selected]);

  const suggest = (term: string) => {
    onAdd(term);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      // Prefer an exact taxonomy match, otherwise add the typed term.
      const exact = matches.find((m) => m.toLowerCase() === q.toLowerCase());
      suggest(exact ?? q);
    } else if (e.key === "Escape") {
      setQuery("");
      setFocused(false);
    }
  };

  const derivedSuggestions = derived.filter((c) => !selected.has(c));

  return (
    <div className="space-y-3">
      {/* Input with type-ahead dropdown */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search or add a keyword"
              className="pl-9"
            />
          </div>
          <Button onClick={() => { const q = query.trim(); if (q) suggest(q); }} variant="secondary">
            Add
          </Button>
        </div>

        {focused && matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg overflow-hidden">
            {matches.map((term) => (
              <button
                key={term}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); suggest(term); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
              >
                <span>{term}</span>
                <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Derived suggestions from title/abstract */}
      {derivedSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Suggested from your title & abstract
          </p>
          <div className="flex flex-wrap gap-2">
            {derivedSuggestions.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onAdd(term)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Lightbulb className="h-3 w-3" /> {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected keywords */}
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {keywords.map((k, idx) => (
            <Badge key={k + idx} variant="secondary" className="gap-1 pr-1">
              {k}
              <button
                onClick={() => onRemove(idx)}
                onMouseDown={(e) => e.preventDefault()}
                className="ml-1 rounded-full hover:bg-muted p-0.5"
                aria-label={`Remove ${k}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No keywords yet. Start typing or pick a suggestion.</p>
      )}
    </div>
  );
}
