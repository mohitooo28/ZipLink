/** Filename handling for files written on the receiving device. */

const ILLEGAL_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const MAX_NAME_LENGTH = 200;

export function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Make a name from another device safe to create locally: strips path
 * separators and characters that are invalid on common filesystems, while
 * keeping Unicode intact.
 */
export function sanitizeFileName(raw: string): string {
  let name = raw.normalize("NFC").replace(ILLEGAL_CHARACTERS, "_").trim();
  name = name.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (!name) name = "file";
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;

  if (name.length > MAX_NAME_LENGTH) {
    const { base, ext } = splitExtension(name);
    const keepExt = ext.length < 20 ? ext : "";
    name = base.slice(0, MAX_NAME_LENGTH - keepExt.length) + keepExt;
  }
  return name;
}

/** "photo.jpg" → "photo (1).jpg", "photo (2).jpg", … */
export function numberedName(name: string, n: number): string {
  if (n === 0) return name;
  const { base, ext } = splitExtension(name);
  return `${base} (${n})${ext}`;
}

/**
 * Return the first variant of `name` for which `isTaken` is false. Comparison
 * is case-insensitive because most desktop filesystems are.
 */
export async function resolveUniqueName(
  name: string,
  isTaken: (candidate: string) => boolean | Promise<boolean>,
  maxAttempts = 10_000,
): Promise<string> {
  for (let n = 0; n < maxAttempts; n += 1) {
    const candidate = numberedName(name, n);
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free name for "${name}"`);
}
