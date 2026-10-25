// Books: bundled public-domain catalog, Wikisource import, and user files (.txt / .epub / .html).
import * as db from './db.js';
import { unzipSync, strFromU8 } from '../vendor/fflate.mjs';
import { words as splitWords } from './text.js';

export async function catalog(lang) {
  try {
    const res = await fetch(new URL(`../../data/${lang}/books/catalog.json`, import.meta.url));
    return res.ok ? await res.json() : [];
  } catch (e) { return []; }
}

export async function getBook(lang, id) {
  const local = await db.get(`book:${lang}:${id}`);
  if (local) return local;
  const res = await fetch(new URL(`../../data/${lang}/books/${id}.json`, import.meta.url));
  if (!res.ok) throw new Error('This book is not downloaded yet — connect to the internet once.');
  const book = await res.json();
  await saveBook(lang, book);
  return book;
}

export async function saveBook(lang, book) {
  book.words = book.words || book.chapters.reduce((n, ch) => n + ch.paras.reduce((m, p) => m + splitWords(p, lang).length, 0), 0);
  await db.set(`book:${lang}:${book.id}`, book);
  const idx = (await db.get(`books:${lang}`)) || [];
  const meta = { id: book.id, title: book.title, author: book.author, year: book.year, words: book.words, chapters: book.chapters.length,
    source: book.source, imported: !!book.imported, emoji: book.emoji || '📗' };
  await db.set(`books:${lang}`, [meta, ...idx.filter((b) => b.id !== book.id)]);
  return meta;
}

export async function localBooks(lang) { return (await db.get(`books:${lang}`)) || []; }

export async function deleteBook(lang, id) {
  await db.del(`book:${lang}:${id}`);
  await db.set(`books:${lang}`, ((await db.get(`books:${lang}`)) || []).filter((b) => b.id !== id));
}

// ---------- parsing ----------
const CHAPTER_RE = /^\s*((kapitel|capitolo|chapter|cap\.)\s+[\divxlc]+\.?|[IVXLC]+\.|\d+\.)\s*$|^\s*(kapitel|capitolo|chapter)\b.{0,60}$/i;

function cleanParas(text) {
  return text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1);
}

export function fromText(text, title) {
  // strip Project Gutenberg boilerplate if present
  const start = text.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = text.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1, end > start ? end : undefined);
  const paras = cleanParas(text);
  const chapters = [];
  let cur = { title: title || 'Text', paras: [] };
  for (const p of paras) {
    if (CHAPTER_RE.test(p) || (p.length < 70 && /^[A-ZÄÖÜÀ-Ý0-9 .,'’:;–-]+$/.test(p) && p.split(' ').length <= 8 && cur.paras.length > 3)) {
      if (cur.paras.length) chapters.push(cur);
      cur = { title: p, paras: [] };
    } else cur.paras.push(p);
  }
  if (cur.paras.length) chapters.push(cur);
  return splitLong(chapters);
}

// Very long chapters are split so pages stay light.
function splitLong(chapters, max = 60) {
  const out = [];
  for (const ch of chapters) {
    if (ch.paras.length <= max) { out.push(ch); continue; }
    for (let i = 0; i < ch.paras.length; i += max) out.push({ title: `${ch.title} (${i / max + 1})`, paras: ch.paras.slice(i, i + max) });
  }
  return out;
}

function htmlParas(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,sup.reference,.mw-editsection,table.navbox,.noprint,#toc').forEach((n) => n.remove());
  const out = [];
  doc.body.querySelectorAll('h1,h2,h3,h4,p,dd,div.poem,div.verse').forEach((n) => {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) return;
    out.push(/^H\d$/.test(n.tagName) ? { h: t } : { p: t });
  });
  return out;
}

function chaptersFromBlocks(blocks, title) {
  const chapters = [];
  let cur = { title, paras: [] };
  for (const b of blocks) {
    if (b.h) { if (cur.paras.length) chapters.push(cur); cur = { title: b.h, paras: [] }; } else cur.paras.push(b.p);
  }
  if (cur.paras.length) chapters.push(cur);
  return splitLong(chapters);
}

export function fromHTML(html, title) { return chaptersFromBlocks(htmlParas(html), title); }

export function fromEPUB(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const txt = (name) => (files[name] ? strFromU8(files[name]) : null);
  const container = txt('META-INF/container.xml');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  const opf = opfPath && txt(opfPath);
  if (!opf) throw new Error('Not a readable EPUB file.');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const doc = new DOMParser().parseFromString(opf, 'application/xml');
  const title = doc.querySelector('title')?.textContent || 'Book';
  const author = doc.querySelector('creator')?.textContent || '';
  const manifest = {};
  doc.querySelectorAll('manifest > item').forEach((it) => { manifest[it.getAttribute('id')] = it.getAttribute('href'); });
  const blocks = [];
  doc.querySelectorAll('spine > itemref').forEach((ref) => {
    const href = manifest[ref.getAttribute('idref')];
    const html = href && txt(decodeURIComponent(base + href));
    if (html) blocks.push(...htmlParas(html));
  });
  return { title, author, chapters: chaptersFromBlocks(blocks, title) };
}

export async function importFile(lang, file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  let parsed;
  if (/\.epub$/i.test(file.name)) parsed = fromEPUB(await file.arrayBuffer());
  else if (/\.html?$/i.test(file.name)) parsed = { title: name, chapters: fromHTML(await file.text(), name) };
  else parsed = { title: name, chapters: fromText(await file.text(), name) };
  if (!parsed.chapters.length) throw new Error('No readable text found in that file.');
  return saveBook(lang, { id: 'u' + Date.now().toString(36), title: parsed.title, author: parsed.author || '', chapters: parsed.chapters,
    source: `Imported file: ${file.name}`, imported: true, emoji: '📄' });
}

export async function importPasted(lang, text, title = 'Pasted text') {
  return saveBook(lang, { id: 'p' + Date.now().toString(36), title, author: '', chapters: fromText(text, title), source: 'Pasted text', imported: true, emoji: '📝' });
}

// ---------- Wikisource ----------
const WS = (lang) => `https://${lang}.wikisource.org/w/api.php`;

export async function searchWikisource(lang, query) {
  const u = `${WS(lang)}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=0&srlimit=20&format=json&origin=*`;
  const res = await fetch(u);
  if (!res.ok) throw new Error('Wikisource search failed');
  const j = await res.json();
  return (j.query?.search || []).map((r) => ({ title: r.title, snippet: r.snippet.replace(/<[^>]+>/g, ''), words: r.wordcount }));
}

async function wsPage(lang, title) {
  const u = `${WS(lang)}?action=parse&page=${encodeURIComponent(title)}&prop=text|links&format=json&origin=*&redirects=1`;
  const res = await fetch(u);
  const j = await res.json();
  if (j.error) throw new Error(j.error.info);
  return { html: j.parse.text['*'], links: (j.parse.links || []).filter((l) => l.ns === 0).map((l) => l['*']) };
}

// Import a Wikisource page; if it is a table of contents, import its subpages as chapters.
export async function importWikisource(lang, title, onProgress = () => {}) {
  const page = await wsPage(lang, title);
  let blocks = htmlParas(page.html);
  const sub = page.links.filter((l) => l.startsWith(title + '/'));
  let chapters;
  if (blocks.filter((b) => b.p && b.p.length > 120).length < 3 && sub.length) {
    chapters = [];
    for (let i = 0; i < Math.min(sub.length, 60); i++) {
      onProgress(i + 1, Math.min(sub.length, 60));
      const p = await wsPage(lang, sub[i]);
      const paras = htmlParas(p.html).filter((b) => b.p).map((b) => b.p);
      if (paras.length) chapters.push({ title: sub[i].slice(title.length + 1).replace(/_/g, ' '), paras });
    }
  } else chapters = chaptersFromBlocks(blocks, title);
  if (!chapters.length) throw new Error('No text found on that page.');
  return saveBook(lang, { id: 'w' + Date.now().toString(36), title: title.replace(/_/g, ' '), author: 'Wikisource', chapters,
    source: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(title)}`, imported: true, emoji: '🏛️' });
}
