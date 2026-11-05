export function norm(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-./[\]()]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits camelCase / snake_case attribute names into words: "firstName" → "first name". */
export function attrWords(value: string | null | undefined): string {
  return norm((value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2"));
}
