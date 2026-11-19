export interface XmlNode {
	tag: string;
	attrs: Record<string, string>;
	children: XmlNode[];
	text: string;
}

const MAX_XML_DEPTH = 64;
const MAX_XML_CHARS = 16 * 1024 * 1024;
const MAX_XML_NODES = 250_000;

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function isValidXmlCodePoint(code: number): boolean {
	return (
		code === 0x9 ||
		code === 0xa ||
		code === 0xd ||
		(code >= 0x20 && code <= 0xd7ff) ||
		(code >= 0xe000 && code <= 0xfffd) ||
		(code >= 0x10000 && code <= 0x10ffff)
	);
}

function decodeXmlEntities(raw: string): string {
	if (!raw.includes("&")) return raw;
	return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z0-9]+);/g, (m, ent) => {
		if (ent.startsWith("#x") || ent.startsWith("#X")) {
			const code = Number.parseInt(ent.slice(2), 16);
			return Number.isFinite(code) && isValidXmlCodePoint(code)
				? String.fromCodePoint(code)
				: m;
		}
		if (ent.startsWith("#")) {
			const code = Number.parseInt(ent.slice(1), 10);
			return Number.isFinite(code) && isValidXmlCodePoint(code)
				? String.fromCodePoint(code)
				: m;
		}
		return Object.hasOwn(NAMED_ENTITIES, ent) ? NAMED_ENTITIES[ent] : m;
	});
}

export function decodeXmlBytes(bytes: Uint8Array): string {
	if (
		bytes.length >= 3 &&
		bytes[0] === 0xef &&
		bytes[1] === 0xbb &&
		bytes[2] === 0xbf
	) {
		return new TextDecoder("utf-8").decode(bytes.subarray(3));
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return new TextDecoder("utf-16le").decode(bytes.subarray(2));
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return new TextDecoder("utf-16be").decode(bytes.subarray(2));
	}
	return new TextDecoder("utf-8").decode(bytes);
}

function stripNsPrefix(rawTag: string): string {
	const idx = rawTag.indexOf(":");
	return idx >= 0 ? rawTag.slice(idx + 1) : rawTag;
}

function skipWhitespace(str: string, pos: number): number {
	while (pos < str.length) {
		const ch = str.charCodeAt(pos);
		if (ch === 32 || ch === 9 || ch === 10 || ch === 13) pos++;
		else break;
	}
	return pos;
}

function skipDoctype(str: string, start: number): number {
	let pos = start;
	let inQuote: string | null = null;
	let bracketDepth = 0;
	while (pos < str.length) {
		const ch = str[pos];
		if (inQuote) {
			if (ch === inQuote) inQuote = null;
		} else if (ch === '"' || ch === "'") {
			inQuote = ch;
		} else if (ch === "[") {
			bracketDepth++;
		} else if (ch === "]" && bracketDepth > 0) {
			bracketDepth--;
		} else if (ch === ">" && bracketDepth === 0) {
			return pos + 1;
		}
		pos++;
	}
	throw new Error("Unterminated <!DOCTYPE> declaration in XML.");
}

function parseAttributes(
	str: string,
	start: number,
): { attrs: Record<string, string>; nextPos: number; selfClosing: boolean } {
	const attrs = Object.create(null) as Record<string, string>;
	let pos = start;
	const len = str.length;

	while (pos < len) {
		pos = skipWhitespace(str, pos);
		if (pos >= len) {
			throw new Error("Unexpected end of XML inside opening tag.");
		}
		if (str[pos] === "/" && str[pos + 1] === ">") {
			return { attrs, nextPos: pos + 2, selfClosing: true };
		}
		if (str[pos] === ">") {
			return { attrs, nextPos: pos + 1, selfClosing: false };
		}

		const nameStart = pos;
		while (pos < len) {
			const c = str[pos];
			if (
				c === "=" ||
				c === " " ||
				c === "\t" ||
				c === "\n" ||
				c === "\r" ||
				c === "/" ||
				c === ">"
			) {
				break;
			}
			pos++;
		}
		const rawName = str.slice(nameStart, pos);
		if (!rawName) {
			throw new Error(`Malformed attribute near position ${pos}.`);
		}
		pos = skipWhitespace(str, pos);

		let val = "";
		if (str[pos] === "=") {
			pos = skipWhitespace(str, pos + 1);
			const quote = str[pos];
			if (quote !== '"' && quote !== "'") {
				throw new Error(`Expected quoted attribute value for "${rawName}".`);
			}
			pos++;
			const valStart = pos;
			const closeIdx = str.indexOf(quote, valStart);
			if (closeIdx === -1) {
				throw new Error(`Unterminated attribute value for "${rawName}".`);
			}
			val = decodeXmlEntities(str.slice(valStart, closeIdx));
			pos = closeIdx + 1;
		}
		attrs[stripNsPrefix(rawName)] = val;
	}

	throw new Error("Unexpected end of XML while parsing tag attributes.");
}

/** Parses an XML string into a lightweight AST for MusicXML documents. */
export function parseXml(xmlText: string): XmlNode {
	if (xmlText.length > MAX_XML_CHARS) {
		throw new Error(`XML document exceeds ${MAX_XML_CHARS} character limit.`);
	}
	const stack: XmlNode[] = [];
	let root: XmlNode | null = null;
	let nodeCount = 0;
	let pos = 0;
	const len = xmlText.length;

	if (len > 0 && xmlText.charCodeAt(0) === 0xfeff) {
		pos = 1;
	}

	while (pos < len) {
		const lt = xmlText.indexOf("<", pos);
		if (lt === -1) {
			const tail = xmlText.slice(pos).trim();
			if (tail && stack.length > 0) {
				stack[stack.length - 1].text += decodeXmlEntities(tail);
			}
			break;
		}

		if (lt > pos && stack.length > 0) {
			const rawText = xmlText.slice(pos, lt);
			if (rawText) {
				stack[stack.length - 1].text += decodeXmlEntities(rawText);
			}
		}

		if (xmlText.startsWith("<!--", lt)) {
			const end = xmlText.indexOf("-->", lt + 4);
			if (end === -1) throw new Error("Unterminated XML comment.");
			pos = end + 3;
			continue;
		}

		if (xmlText.startsWith("<![CDATA[", lt)) {
			const end = xmlText.indexOf("]]>", lt + 9);
			if (end === -1) throw new Error("Unterminated XML CDATA section.");
			if (stack.length > 0) {
				stack[stack.length - 1].text += xmlText.slice(lt + 9, end);
			}
			pos = end + 3;
			continue;
		}

		if (xmlText.startsWith("<?", lt)) {
			const end = xmlText.indexOf("?>", lt + 2);
			if (end === -1)
				throw new Error("Unterminated XML processing instruction.");
			pos = end + 2;
			continue;
		}

		if (
			xmlText.startsWith("<!DOCTYPE", lt) ||
			xmlText.startsWith("<!doctype", lt)
		) {
			pos = skipDoctype(xmlText, lt + 9);
			continue;
		}
		if (xmlText.startsWith("<!", lt)) {
			throw new Error(`Unsupported XML declaration near position ${lt}.`);
		}

		if (xmlText.startsWith("</", lt)) {
			const gt = xmlText.indexOf(">", lt + 2);
			if (gt === -1) throw new Error("Unterminated XML closing tag.");
			const closeTag = stripNsPrefix(xmlText.slice(lt + 2, gt).trim());
			const popped = stack.pop();
			if (!popped || popped.tag !== closeTag) {
				throw new Error(
					`Mismatched XML closing tag </${closeTag}> (expected </${popped?.tag ?? "none"}>).`,
				);
			}
			pos = gt + 1;
			continue;
		}

		let cursor = lt + 1;
		while (cursor < len) {
			const ch = xmlText[cursor];
			if (
				ch === " " ||
				ch === "\t" ||
				ch === "\n" ||
				ch === "\r" ||
				ch === "/" ||
				ch === ">"
			) {
				break;
			}
			cursor++;
		}
		const tag = stripNsPrefix(xmlText.slice(lt + 1, cursor));
		if (!tag) {
			throw new Error(`Invalid empty XML tag near position ${lt}.`);
		}

		const { attrs, nextPos, selfClosing } = parseAttributes(xmlText, cursor);
		nodeCount++;
		if (nodeCount > MAX_XML_NODES) {
			throw new Error(`XML document exceeds ${MAX_XML_NODES} element limit.`);
		}
		const node: XmlNode = { tag, attrs, children: [], text: "" };

		if (stack.length > 0) {
			stack[stack.length - 1].children.push(node);
		} else if (root) {
			throw new Error(`Unexpected extra root XML element <${tag}>.`);
		} else {
			root = node;
		}

		if (!selfClosing) {
			if (stack.length >= MAX_XML_DEPTH) {
				throw new Error(
					`XML nesting depth exceeds ${MAX_XML_DEPTH} levels at <${tag}>.`,
				);
			}
			stack.push(node);
		}
		pos = nextPos;
	}

	if (stack.length > 0) {
		throw new Error(`Unclosed XML tag <${stack[stack.length - 1].tag}>.`);
	}
	if (!root) {
		throw new Error("Empty XML document.");
	}
	return root;
}

export function findChild(node: XmlNode, tag: string): XmlNode | undefined {
	for (const child of node.children) {
		if (child.tag === tag) return child;
	}
	return undefined;
}

export function findChildren(node: XmlNode, tag: string): XmlNode[] {
	return node.children.filter((child) => child.tag === tag);
}

export function getChildText(node: XmlNode, tag: string): string | undefined {
	const child = findChild(node, tag);
	if (!child) return undefined;
	const trimmed = child.text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
