"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, CornerDownLeft } from "lucide-react";
import countryData from "../../../countries.json";

const COUNTRIES = countryData.countries;

export function CountryInput({
  value,
  onChange,
  placeholder = "Country",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const [focused, setFocused] = React.useState(false);
  const selectedRef = React.useRef(value);

  // Update draft whenever the controlled value changes (e.g. draft restore).
  React.useEffect(() => {
    if (selectedRef.current !== value) {
      setDraft(value);
    }
  }, [value]);

  const q = draft.trim().toLowerCase();
  const matches = q
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(q) && c !== draft.trim()).slice(0, 8)
    : [];

  const choose = (name: string) => {
    setDraft(name);
    selectedRef.current = name;
    onChange(name);
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && matches.length > 0) {
      e.preventDefault();
      choose(matches[0]);
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const open = focused && matches.length > 0;

  return (
    <div className="relative">
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          selectedRef.current = e.target.value;
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        <ChevronDown className="h-4 w-4" />
      </span>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg overflow-hidden">
          {matches.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(name);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <span className="flex-1">{name}</span>
              {matches[0] === name && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
