export interface OpmlFeed {
  xmlUrl: string;
  title: string;
  htmlUrl: string | null;
  category: string | null;
}

/**
 * Parse an OPML XML string and extract feed entries.
 *
 * OPML structure is simple enough to parse with regex -- the meaningful data
 * lives in <outline> elements with an xmlUrl attribute. Category comes from
 * a parent <outline> that has text/title but no xmlUrl (i.e. a folder node).
 */
export function parseOpml(xml: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];

  // Find the <body> section
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xml);
  if (!bodyMatch) {
    return feeds;
  }
  const body = bodyMatch[1]!;

  // Strategy: walk through all <outline> tags. Track nesting to determine
  // the current category. A "folder" outline has text but no xmlUrl.
  // A "feed" outline has an xmlUrl attribute.
  //
  // We use a simple state machine rather than a full XML parser.
  const tagRegex = /<outline\b([^>]*?)\/?>|<\/outline>/gi;
  const categoryStack: string[] = [];
  let match: RegExpExecArray | null;

  // We also need to track whether each <outline> is self-closing or not.
  // Self-closing: <outline ... />  -- does NOT push to category stack
  // Opening: <outline ...>         -- pushes to category stack if it's a folder
  // We count open/close to manage the stack.

  while ((match = tagRegex.exec(body)) !== null) {
    const fullMatch = match[0]!;

    if (fullMatch.startsWith("</outline")) {
      // Closing tag -- pop category stack
      categoryStack.pop();
      continue;
    }

    const attrs = match[1] ?? "";
    const isSelfClosing = fullMatch.endsWith("/>");
    const xmlUrl = extractAttr(attrs, "xmlUrl");
    const title = extractAttr(attrs, "title") ?? extractAttr(attrs, "text") ?? "";
    const htmlUrl = extractAttr(attrs, "htmlUrl");

    if (xmlUrl) {
      // This is a feed outline
      const category = categoryStack.length > 0 ? categoryStack[categoryStack.length - 1]! : null;
      feeds.push({
        xmlUrl,
        title: title || xmlUrl,
        htmlUrl: htmlUrl ?? null,
        category,
      });
      // Feed outlines that are not self-closing still don't act as categories
      if (!isSelfClosing) {
        categoryStack.push("");
      }
    } else {
      // This is a folder/category outline (no xmlUrl)
      if (!isSelfClosing) {
        categoryStack.push(title || "");
      }
    }
  }

  return feeds;
}

function extractAttr(attrs: string, name: string): string | undefined {
  // Match attribute like: xmlUrl="value" or xmlUrl='value'
  const regex = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = regex.exec(attrs);
  if (!m) return undefined;
  const value = m[1] ?? m[2];
  return value ? decodeXmlEntities(value) : undefined;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
