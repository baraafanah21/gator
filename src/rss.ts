import { XMLParser } from "fast-xml-parser";

export type RSSFeed = {
  channel: {
    title: string;
    link: string;
    description: string;
    item: RSSItem[];
  };
};

export type RSSItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
};

export async function fetchFeed(feedURL: string): Promise<RSSFeed> {
  return parseFeed(await fetchText(feedURL));
}

async function fetchText(url: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "gator",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
  } catch (err) {
    // fetch only says "fetch failed"; the reason (DNS, refused, TLS) is in cause.
    const cause = err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : String(err);

    throw new Error(`Could not reach ${url}: ${cause}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

// Handles both RSS (<rss><channel>) and Atom (<feed>), normalising Atom into
// the RSS shape so the rest of gator only deals with one kind of feed.
export function parseFeed(xml: string): RSSFeed {
  const parser = new XMLParser({
    processEntities: false,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml);

  if (parsed?.rss?.channel) {
    return parseRSS(parsed.rss.channel);
  }

  if (parsed?.feed) {
    return parseAtom(parsed.feed);
  }

  throw new Error("Invalid feed: expected an RSS <channel> or an Atom <feed>");
}

function parseRSS(channel: any): RSSFeed {
  const title = asText(channel.title);
  const link = asText(channel.link);
  const description = asText(channel.description);

  if (title === undefined || link === undefined) {
    throw new Error("Invalid RSS feed: missing channel metadata");
  }

  const items: RSSItem[] = [];

  for (const raw of asArray(channel.item)) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    const item = raw as Record<string, unknown>;

    const itemTitle = asText(item.title);
    const itemLink = asText(item.link);

    if (itemTitle === undefined || itemLink === undefined) {
      continue;
    }

    items.push({
      title: itemTitle,
      link: itemLink,
      description: asText(item.description),
      pubDate: asText(item.pubDate),
    });
  }

  return {
    channel: {
      title,
      link,
      description: description ?? "",
      item: items,
    },
  };
}

function parseAtom(feed: any): RSSFeed {
  const title = asText(feed.title);
  const link = resolveAtomLink(feed.link);

  if (title === undefined) {
    throw new Error("Invalid Atom feed: missing feed title");
  }

  const items: RSSItem[] = [];

  for (const raw of asArray(feed.entry)) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    const entry = raw as Record<string, unknown>;

    const entryTitle = asText(entry.title);
    const entryLink = resolveAtomLink(entry.link) ?? asText(entry.id);

    if (entryTitle === undefined || entryLink === undefined) {
      continue;
    }

    items.push({
      title: entryTitle,
      link: entryLink,
      description: asText(entry.summary) ?? asText(entry.content),
      pubDate: asText(entry.published) ?? asText(entry.updated),
    });
  }

  return {
    channel: {
      title,
      link: link ?? "",
      description: asText(feed.subtitle) ?? "",
      item: items,
    },
  };
}

// An Atom <link> is an attribute-only element, and an entry may carry several.
// The one people click is rel="alternate", which is also the default rel.
function resolveAtomLink(link: unknown): string | undefined {
  const candidates = asArray(link);

  let fallback: string | undefined;

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      fallback ??= candidate;
      continue;
    }

    if (typeof candidate !== "object" || candidate === null) {
      continue;
    }

    const attrs = candidate as Record<string, unknown>;
    const href = asText(attrs["@_href"]);

    if (href === undefined) {
      continue;
    }

    const rel = asText(attrs["@_rel"]);

    if (rel === undefined || rel === "alternate") {
      return href;
    }

    fallback ??= href;
  }

  return fallback;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

// The parser turns numeric text into numbers and elements that carry both text
// and attributes into objects, so a plain typeof check is not enough.
function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object" && value !== null) {
    const text = (value as Record<string, unknown>)["#text"];

    if (text !== undefined) {
      return asText(text);
    }
  }

  return undefined;
}
