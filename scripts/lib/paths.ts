import os from "node:os";

/** Replaces the home directory with `~` so reports do not carry the OS user name. */
export function redactHome(text: string, home: string = os.homedir()): string {
  if (home === "" || home === "/") return text;
  return text.split(home).join("~");
}
