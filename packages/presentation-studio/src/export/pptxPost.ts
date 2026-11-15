/**
 * Post-processing of the PptxGenJS package (fflate unzip → string edits → zip, entry order kept). PptxGenJS 4.0.1 is
 * pinned exactly; every edit looks for an exact pattern of its output and throws when it is missing, so a library
 * change can never silently produce a file without what the user made.
 *
 * Per slide (and layout) part:
 * - text bodies: each text the builder wrote is a marker (`DCOSTXT12X`); its whole <p:txBody>/<a:txBody> is replaced
 *   by ours (drawingml.ts). Placeholder text also gets its object name and its own position back (PptxGenJS gives
 *   placeholder text the layout placeholder's position and a generic name).
 * - gradient fills of shapes and gradient backgrounds (PptxGenJS writes solid fills only),
 * - picture crops (<a:srcRect>),
 * - shape ids renumbered so they are unique in the part (PptxGenJS numbers tables per slide and can repeat an id),
 * - object names: the builder's tokens become the user-facing names,
 * - <p:transition> and <p:timing> after <p:clrMapOvr> (ECMA-376 CT_Slide order),
 * - hyperlink relationships for links in our text bodies.
 * Notes slides get their paragraphs; theme1.xml gets the presentation's colour scheme.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Animation, PresentationTheme } from '../types';
import { timingXml } from './timing';
import { esc, hex6 } from './xml';

export interface TextReplacement {
  marker: string;
  /** The complete replacement body (<p:txBody>… or <a:txBody>…). */
  body: string;
  /** A placeholder: the object name token to give it and its own <a:xfrm>. */
  placeholder?: { token: string; xfrm: string };
}

type Sides = { l: number; t: number; r: number; b: number };

export interface PartPlan {
  texts: TextReplacement[];
  /** Token → user-facing object name. */
  names: Array<{ token: string; name: string }>;
  /** Pictures to crop: fractions cut from each side (0–1). */
  crops: Array<{ token: string; l: number; t: number; r: number; b: number }>;
  /** Shapes whose fill is replaced (gradient fills): the fill element XML. */
  fills: Array<{ token: string; fill: string }>;
  /** A whole <p:bg> to write instead of PptxGenJS's (gradient backgrounds). */
  background?: string;
  /**
   * How a picture background fits the slide (PptxGenJS always stretches it): `crop` (fractions cut from each side)
   * for 'cover', `inset` (fractions of the slide left empty on each side) for 'contain'.
   */
  backgroundFit?: { crop?: Sides; inset?: Sides };
  /** Links in our text bodies. */
  links: Array<{ id: string; url: string }>;
}

export interface SlidePlan extends PartPlan {
  transition: string;
  /** The slide's build steps (show/sequence.ts), each effect aimed at an object token. */
  steps: Array<{ auto: boolean; effects: Array<{ token: string; animation: Animation; start: number; textShape: boolean }> }>;
  notes?: { marker: string; body: string; links: Array<{ id: string; url: string }> };
}

export interface PostPlan {
  slides: SlidePlan[];
  /** Layout parts by their name (the PptxGenJS master title, <p:cSld name>). */
  layouts: Array<PartPlan & { title: string }>;
  theme: PresentationTheme;
}

export class PptxPostError extends Error {}

function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new PptxPostError(`The PowerPoint file could not be finished (${what}).`);
}

/** Replaces the text body that holds `marker`. Returns the new XML. */
export function replaceTextBody(xml: string, r: TextReplacement): string {
  const at = xml.indexOf(`>${r.marker}</a:t>`);
  need(at >= 0, `text ${r.marker} not found`);
  const container = r.body.startsWith('<a:txBody>') ? 'a:txBody' : 'p:txBody';
  const start = xml.lastIndexOf(`<${container}>`, at);
  const end = xml.indexOf(`</${container}>`, at);
  need(start >= 0 && end > at, `text body of ${r.marker}`);
  let out = xml.slice(0, start) + r.body + xml.slice(end + container.length + 3);
  if (r.placeholder) {
    const sp = out.lastIndexOf('<p:sp>', start);
    need(sp >= 0, `placeholder shape of ${r.marker}`);
    const head = out.slice(sp, start);
    const name = /(<p:cNvPr id="\d+" name=")[^"]*(")/;
    need(name.test(head), `placeholder name of ${r.marker}`);
    const named = head.replace(name, `$1${r.placeholder.token}$2`);
    const xfrm = /<a:xfrm[^>]*>[\s\S]*?<\/a:xfrm>/;
    need(xfrm.test(named), `placeholder position of ${r.marker}`);
    const placed = named.replace(xfrm, r.placeholder.xfrm);
    out = out.slice(0, sp) + placed + out.slice(start);
  }
  return out;
}

/** The start and end of the element (p:sp, p:pic, p:graphicFrame) whose cNvPr name is `token`. */
function objectRange(xml: string, token: string): { start: number; end: number; tag: string } {
  const at = xml.indexOf(` name="${token}"`);
  need(at >= 0, `object ${token} not found`);
  const candidates = ['p:sp', 'p:pic', 'p:graphicFrame'].map((tag) => ({ tag, start: xml.lastIndexOf(`<${tag}>`, at) })).filter((c) => c.start >= 0);
  need(candidates.length, `object ${token}`);
  const best = candidates.reduce((a, b) => (b.start > a.start ? b : a));
  const end = xml.indexOf(`</${best.tag}>`, at);
  need(end > at, `end of object ${token}`);
  return { start: best.start, end: end + best.tag.length + 3, tag: best.tag };
}

function replaceFill(xml: string, token: string, fill: string): string {
  const { start, end } = objectRange(xml, token);
  const obj = xml.slice(start, end);
  const spPr = obj.indexOf('<p:spPr>');
  const geom = obj.indexOf('</a:prstGeom>', spPr);
  need(spPr >= 0 && geom > spPr, `fill of ${token}`);
  const after = geom + '</a:prstGeom>'.length;
  const rest = obj.slice(after);
  const m = /^(<a:noFill\/>|<a:solidFill>[\s\S]*?<\/a:solidFill>)/.exec(rest);
  const next = m ? obj.slice(0, after) + fill + rest.slice(m[0].length) : obj.slice(0, after) + fill + rest;
  return xml.slice(0, start) + next + xml.slice(end);
}

function cropPicture(xml: string, c: PartPlan['crops'][number]): string {
  const { start, end, tag } = objectRange(xml, c.token);
  need(tag === 'p:pic', `picture ${c.token}`);
  const obj = xml.slice(start, end);
  const pct = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 100000);
  const src = `<a:srcRect l="${pct(c.l)}" t="${pct(c.t)}" r="${pct(c.r)}" b="${pct(c.b)}"/>`;
  const stretch = obj.indexOf('<a:stretch>');
  need(stretch >= 0, `picture fill of ${c.token}`);
  return xml.slice(0, start) + obj.slice(0, stretch) + src + obj.slice(stretch) + xml.slice(end);
}

/** Gives every shape in the part a unique id (2, 3, … in document order; the group root keeps 1). */
export function renumberShapes(xml: string): string {
  let n = 1;
  return xml.replace(/<p:cNvPr id="\d+"/g, (m) => (m === '<p:cNvPr id="1"' && n === 1 ? ((n = 2), m) : `<p:cNvPr id="${n++}"`));
}

/** The shape id of the object named `token`. */
export function shapeId(xml: string, token: string): number {
  const m = new RegExp(`<p:cNvPr id="(\\d+)" name="${token}"`).exec(xml);
  need(m, `id of ${token}`);
  return Number(m[1]);
}

function applyPart(xml: string, plan: PartPlan): string {
  let out = xml;
  for (const t of plan.texts) out = replaceTextBody(out, t);
  for (const f of plan.fills) out = replaceFill(out, f.token, f.fill);
  for (const c of plan.crops) out = cropPicture(out, c);
  if (plan.backgroundFit) {
    const bg = /<p:bg>[\s\S]*?<\/p:bg>/.exec(out);
    need(bg && bg[0].includes('<a:blipFill'), 'picture background');
    const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100000);
    const sides = (x: Sides) => `l="${pct(x.l)}" t="${pct(x.t)}" r="${pct(x.r)}" b="${pct(x.b)}"`;
    let fill = bg[0];
    const { crop, inset } = plan.backgroundFit;
    if (crop) {
      need(fill.includes('<a:srcRect/>'), 'picture background crop');
      fill = fill.replace('<a:srcRect/>', `<a:srcRect ${sides(crop)}/>`);
    }
    if (inset) {
      need(fill.includes('<a:fillRect/>'), 'picture background fit');
      fill = fill.replace('<a:fillRect/>', `<a:fillRect ${sides(inset)}/>`);
    }
    out = out.slice(0, bg.index) + fill + out.slice(bg.index + bg[0].length);
  }
  if (plan.background) {
    const bg = /<p:bg>[\s\S]*?<\/p:bg>/.exec(out);
    if (bg) out = out.slice(0, bg.index) + plan.background + out.slice(bg.index + bg[0].length);
    else {
      const cSld = /<p:cSld[^>]*>/.exec(out);
      need(cSld, 'slide background');
      out = out.slice(0, cSld.index + cSld[0].length) + plan.background + out.slice(cSld.index + cSld[0].length);
    }
  }
  return out;
}

function rename(xml: string, names: PartPlan['names']): string {
  let out = xml;
  for (const n of names) {
    const before = out;
    out = out.split(` name="${n.token}"`).join(` name="${esc(n.name)}"`);
    need(out !== before, `name of ${n.token}`);
  }
  return out;
}

/** Adds hyperlink relationships to a .rels part. */
function addLinks(rels: string, links: Array<{ id: string; url: string }>): string {
  if (!links.length) return rels;
  const extra = links.map((l) => `<Relationship Id="${l.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join('');
  need(rels.includes('</Relationships>'), 'relationships');
  return rels.replace('</Relationships>', `${extra}</Relationships>`);
}

const SLOT_TAGS: Array<[string, keyof PresentationTheme['colors']]> = [
  ['dk1', 'dark1'],
  ['lt1', 'light1'],
  ['dk2', 'dark2'],
  ['lt2', 'light2'],
  ['accent1', 'accent1'],
  ['accent2', 'accent2'],
  ['accent3', 'accent3'],
  ['accent4', 'accent4'],
  ['accent5', 'accent5'],
  ['accent6', 'accent6'],
  ['hlink', 'hyperlink'],
  ['folHlink', 'hyperlink'],
];

/** theme1.xml with the presentation's colours as its colour scheme. */
export function themeWithColors(xml: string, theme: PresentationTheme): string {
  const m = /<a:clrScheme name="[^"]*">[\s\S]*?<\/a:clrScheme>/.exec(xml);
  need(m, 'theme colours');
  const scheme = `<a:clrScheme name="${esc(theme.name || 'Classroom OS')}">${SLOT_TAGS.map(([tag, slot]) => `<a:${tag}><a:srgbClr val="${hex6(theme.colors[slot])}"/></a:${tag}>`).join('')}</a:clrScheme>`;
  return xml.slice(0, m.index) + scheme + xml.slice(m.index + m[0].length);
}

/** Chart XML without points whose value is empty (missing values are gaps). */
export const withoutEmptyPoints = (xml: string) => xml.replace(/<c:pt idx="\d+"><c:v><\/c:v><\/c:pt>/g, '');

/** Worksheet XML without cells whose value is empty. */
export const withoutEmptyCells = (xml: string) => xml.replace(/<c r="[A-Z]+\d+"><v><\/v><\/c>/g, '');

/** The finished package. */
export function postProcess(bytes: Uint8Array, plan: PostPlan): Uint8Array {
  const files = unzipSync(bytes);
  const read = (path: string) => {
    const f = files[path];
    need(f, path);
    return strFromU8(f);
  };
  const write = (path: string, text: string) => {
    files[path] = strToU8(text);
  };

  plan.slides.forEach((s, i) => {
    const path = `ppt/slides/slide${i + 1}.xml`;
    let xml = applyPart(read(path), s);
    xml = renumberShapes(xml);
    const steps = s.steps.map((st) => ({ auto: st.auto, effects: st.effects.map((e) => ({ spid: shapeId(xml, e.token), animation: e.animation, start: e.start, textShape: e.textShape })) }));
    xml = rename(xml, s.names);
    const tail = '</p:clrMapOvr></p:sld>';
    need(xml.endsWith(tail), `end of slide ${i + 1}`);
    xml = xml.slice(0, -'</p:sld>'.length) + s.transition + timingXml(steps) + '</p:sld>';
    write(path, xml);
    const rels = `ppt/slides/_rels/slide${i + 1}.xml.rels`;
    write(rels, addLinks(read(rels), s.links));
    if (s.notes) {
      const npath = `ppt/notesSlides/notesSlide${i + 1}.xml`;
      write(npath, replaceTextBody(read(npath), { marker: s.notes.marker, body: s.notes.body }));
      const nrels = `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`;
      write(nrels, addLinks(read(nrels), s.notes.links));
    }
  });

  if (plan.layouts.length) {
    const layoutPaths = Object.keys(files).filter((p) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p));
    for (const l of plan.layouts) {
      const path = layoutPaths.find((p) => read(p).includes(`<p:cSld name="${esc(l.title)}"`));
      need(path, `layout ${l.title}`);
      let xml = renumberShapes(applyPart(read(path), l));
      xml = rename(xml, l.names);
      write(path, xml);
      const rels = path.replace('slideLayouts/', 'slideLayouts/_rels/') + '.rels';
      write(rels, addLinks(read(rels), l.links));
    }
  }

  write('ppt/theme/theme1.xml', themeWithColors(read('ppt/theme/theme1.xml'), plan.theme));

  // Missing chart values: PptxGenJS writes an empty <c:v>, which is not a number; a missing point is a gap.
  for (const path of Object.keys(files).filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p))) write(path, withoutEmptyPoints(read(path)));
  // …and in each chart's embedded workbook an empty <v> is not a number either: the cell is left out.
  for (const path of Object.keys(files).filter((p) => /^ppt\/embeddings\/.+\.xlsx$/.test(p))) {
    const book = unzipSync(files[path]);
    let changed = false;
    for (const sheet of Object.keys(book).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) {
      const xml = strFromU8(book[sheet]);
      const next = withoutEmptyCells(xml);
      if (next !== xml) {
        book[sheet] = strToU8(next);
        changed = true;
      }
    }
    if (changed) files[path] = zipSync(book);
  }

  // PptxGenJS declares content types for parts it never writes (slideMaster2…9 for a one-master package); an override
  // for a part that does not exist is left out, so strict readers find every declared part.
  write('[Content_Types].xml', withoutMissingOverrides(read('[Content_Types].xml'), new Set(Object.keys(files))));

  // Keep the original entry order ([Content_Types].xml first) and compression.
  const out: Zippable = {};
  for (const [path, data] of Object.entries(files)) out[path] = path.endsWith('/') ? [data, { level: 0 }] : [data, { level: 6 }];
  return zipSync(out);
}

/** [Content_Types].xml without the <Override> elements whose part is not in the package. */
export function withoutMissingOverrides(xml: string, parts: Set<string>): string {
  return xml.replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, (m, part: string) => (parts.has(part) ? m : ''));
}
