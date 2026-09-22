import { XMLParser } from "fast-xml-parser";

// OPML is the file format every other feed reader imports and exports, so it is
// how feeds get in and out of gator.

export type OPMLFeed = {
  name: string;
  url: string;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function buildOPML(title: string, feeds: OPMLFeed[]): string {
  const outlines = feeds.map((feed) => {
    const name = escapeXML(feed.name);

    return `    <outline type="rss" text="${name}" title="${name}" xmlUrl="${escapeXML(feed.url)}"/>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    `    <title>${escapeXML(title)}</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    "  </head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}

export function parseOPML(xml: string): OPMLFeed[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml);

  if (!parsed?.opml?.body) {
    throw new Error("Invalid OPML: expected an <opml> document with a <body>");
  }

  const feeds: OPMLFeed[] = [];
  const seen = new Set<string>();

  collect(parsed.opml.body.outline, feeds, seen);

  return feeds;
}

// Readers group feeds into folders by nesting outlines, so every level is
// walked. An outline without an xmlUrl is a folder, not a feed.
function collect(outline: unknown, feeds: OPMLFeed[], seen: Set<string>): void {
  if (outline === undefined || outline === null) {
    return;
  }

  if (Array.isArray(outline)) {
    for (const child of outline) {
      collect(child, feeds, seen);
    }

    return;
  }

  if (typeof outline !== "object") {
    return;
  }

  const attrs = outline as Record<string, unknown>;
  const url = asString(attrs["@_xmlUrl"]);

  if (url && !seen.has(url)) {
    seen.add(url);

    feeds.push({
      name:
        asString(attrs["@_title"]) ??
        asString(attrs["@_text"]) ??
        url,
      url,
    });
  }

  collect(attrs.outline, feeds, seen);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed === "" ? undefined : trimmed;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}
