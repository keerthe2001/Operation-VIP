/**
 * Splits a free-text location ("Bangalore, India", "Austin, TX, USA") into city, state and
 * country for forms that ask for each part. Only well-known names are used for state and
 * country, so nothing is guessed from an unfamiliar word.
 */

const COUNTRIES: Record<string, string> = {
  india: "India", in: "India", bharat: "India",
  "united states": "United States", "united states of america": "United States", usa: "United States", us: "United States", america: "United States",
  "united kingdom": "United Kingdom", uk: "United Kingdom", england: "United Kingdom", "great britain": "United Kingdom",
  canada: "Canada", australia: "Australia", germany: "Germany", france: "France", netherlands: "Netherlands", ireland: "Ireland",
  singapore: "Singapore", "united arab emirates": "United Arab Emirates", uae: "United Arab Emirates", "saudi arabia": "Saudi Arabia",
  qatar: "Qatar", japan: "Japan", china: "China", "new zealand": "New Zealand", "sri lanka": "Sri Lanka", nepal: "Nepal",
  bangladesh: "Bangladesh", pakistan: "Pakistan", malaysia: "Malaysia", philippines: "Philippines", spain: "Spain", italy: "Italy",
  sweden: "Sweden", switzerland: "Switzerland", poland: "Poland", brazil: "Brazil", mexico: "Mexico", "south africa": "South Africa",
};

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
];
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
const STATE_NAMES = new Map<string, { name: string; country: string }>([
  ...INDIAN_STATES.map((s) => [s.toLowerCase(), { name: s, country: "India" }] as const),
  ...Object.values(US_STATES).map((s) => [s.toLowerCase(), { name: s, country: "United States" }] as const),
  ["orissa", { name: "Odisha", country: "India" }],
  ["new delhi", { name: "Delhi", country: "India" }],
  ["tn", { name: "Tamil Nadu", country: "India" }],
  ["ka", { name: "Karnataka", country: "India" }],
]);

// Big cities whose state is unambiguous, so "Bangalore, India" can fill State too.
const CITY_STATE: Record<string, string> = {
  bangalore: "Karnataka", bengaluru: "Karnataka", mysore: "Karnataka", mysuru: "Karnataka", mangalore: "Karnataka",
  chennai: "Tamil Nadu", madras: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu", trichy: "Tamil Nadu", tiruchirappalli: "Tamil Nadu", salem: "Tamil Nadu",
  hyderabad: "Telangana", secunderabad: "Telangana", warangal: "Telangana",
  mumbai: "Maharashtra", bombay: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", nashik: "Maharashtra", thane: "Maharashtra", "navi mumbai": "Maharashtra",
  delhi: "Delhi", "new delhi": "Delhi", noida: "Uttar Pradesh", "greater noida": "Uttar Pradesh", lucknow: "Uttar Pradesh", kanpur: "Uttar Pradesh",
  gurgaon: "Haryana", gurugram: "Haryana", faridabad: "Haryana",
  kolkata: "West Bengal", calcutta: "West Bengal", ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat", gandhinagar: "Gujarat",
  jaipur: "Rajasthan", kochi: "Kerala", cochin: "Kerala", thiruvananthapuram: "Kerala", trivandrum: "Kerala", kozhikode: "Kerala",
  bhubaneswar: "Odisha", indore: "Madhya Pradesh", bhopal: "Madhya Pradesh", chandigarh: "Chandigarh", visakhapatnam: "Andhra Pradesh",
  vizag: "Andhra Pradesh", vijayawada: "Andhra Pradesh", patna: "Bihar", ranchi: "Jharkhand", guwahati: "Assam", dehradun: "Uttarakhand",
  puducherry: "Puducherry", pondicherry: "Puducherry", goa: "Goa", panaji: "Goa",
};

export interface LocationParts {
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
}

export function splitLocation(location: string | null | undefined): LocationParts {
  const parts: LocationParts = { city: null, state: null, country: null, postalCode: null };
  if (!location?.trim()) return parts;
  let text = location;
  const pin = text.match(/\b(\d{6}|\d{5}(?:-\d{4})?)\b/);
  if (pin) {
    parts.postalCode = pin[1]!;
    text = text.replace(pin[0], " ");
  }
  const pieces = text
    .split(/[,|/]|\s[-–]\s/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rest: string[] = [];
  for (const piece of pieces) {
    const lower = piece.toLowerCase().replace(/\.$/, "");
    const upper = piece.toUpperCase();
    if (!parts.country && COUNTRIES[lower]) parts.country = COUNTRIES[lower]!;
    else if (!parts.state && STATE_NAMES.has(lower) && !(rest.length === 0 && CITY_STATE[lower] && pieces.length > 1)) {
      const state = STATE_NAMES.get(lower)!;
      parts.state = state.name;
      parts.country ??= state.country;
    } else if (!parts.state && piece.length === 2 && US_STATES[upper] && rest.length > 0) {
      parts.state = US_STATES[upper]!;
      parts.country ??= "United States";
    } else rest.push(piece);
  }
  parts.city = rest[0] ?? null;
  if (parts.city && !parts.state) {
    const state = CITY_STATE[parts.city.toLowerCase()];
    if (state) {
      parts.state = state;
      parts.country ??= "India";
    }
  }
  return parts;
}
