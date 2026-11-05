import { norm } from "@/mapping/normalize";
import type { FieldDescriptor } from "@/shared/fields";

type Option = FieldDescriptor["options"][number];

const YES = /^(yes|y|true|i am|i do|i will|i have|authori[sz]ed|willing|open to)\b/;
const NO = /^(no|n|false|i am not|i do not|i don ?t|i will not|not)\b/;

/** Picks the option matching a Yes/No answer. */
export function matchBoolean(options: Option[], value: boolean): Option | null {
  const pattern = value ? YES : NO;
  return options.find((o) => pattern.test(norm(o.label)) || pattern.test(norm(o.value))) ?? null;
}

interface Range {
  min: number;
  max: number;
}

/** Understands "0-1 years", "3 to 5", "5+", "10 or more", "less than 1", "Over 8 years". */
export function parseRange(label: string): Range | null {
  // Hyphens matter here ("3-5"), so this uses lighter normalization than norm().
  const text = label.toLowerCase().replace(/\byears?\b|\byrs?\b|[()]/g, "").replace(/\s+/g, " ").trim();
  let m = text.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–|—)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = text.match(/^(\d+(?:\.\d+)?)\s*(?:\+|or more|and above|plus)/) ?? text.match(/^(?:more than|over|above|at least)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: Number(m[1]), max: Number.POSITIVE_INFINITY };
  m = text.match(/^(?:less than|under|below|up to)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: 0, max: Number(m[1]) };
  m = text.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  return null;
}

export function matchNumber(options: Option[], value: number): Option | null {
  const ranges = options.map((o) => ({ o, r: parseRange(o.label) })).filter((x) => x.r !== null);
  // Prefer the tightest range containing the value ("3-5" over "1+").
  const containing = ranges
    .filter(({ r }) => value >= r!.min && value <= r!.max)
    .sort((a, b) => a.r!.max - a.r!.min - (b.r!.max - b.r!.min));
  if (containing[0]) return containing[0].o;
  // Integer ranges like "1-2" and "3-5" leave gaps for 2.5: take the closest.
  const closest = ranges.sort(
    (a, b) => Math.min(Math.abs(value - a.r!.min), Math.abs(value - a.r!.max)) - Math.min(Math.abs(value - b.r!.min), Math.abs(value - b.r!.max)),
  )[0];
  return closest && Math.min(Math.abs(value - closest.r!.min), Math.abs(value - closest.r!.max)) <= 1 ? closest.o : null;
}

/** Text match: exact → starts with → contains (either direction). */
export function matchText(options: Option[], value: string): Option | null {
  const target = norm(value);
  if (!target) return null;
  const candidates = options.filter((o) => norm(o.label) && !/^(select|choose|please select|--)/.test(norm(o.label)));
  return (
    candidates.find((o) => norm(o.label) === target || norm(o.value) === target) ??
    candidates.find((o) => norm(o.label).startsWith(target) || target.startsWith(norm(o.label))) ??
    candidates.find((o) => norm(o.label).includes(target) || (norm(o.label).length > 3 && target.includes(norm(o.label)))) ??
    null
  );
}
