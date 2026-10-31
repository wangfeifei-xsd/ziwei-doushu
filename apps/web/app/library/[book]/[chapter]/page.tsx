import { ALL_BOOKS, getChapter } from '@ziwei/content/classics';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
export async function generateStaticParams() {
  return ALL_BOOKS.flatMap(b =>
    b.chapters.map((_, i) => ({ book: b.slug, chapter: String(i) }))
  );
}
export async function generateMetadata({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: bookSlug, chapter: chIdx } = await params;
  const result = getChapter(bookSlug, parseInt(chIdx));
  if (!result) return {};
  return {
    title: `${result.chapter.title} · 《${result.book.title}》· 紫微斗数古籍`,
    description: result.chapter.subtitle || `《${result.book.title}》${result.chapter.title}原文`,
  };
}

import SharedPage from '@ziwei/features/pages/chapter';
export default async function Page({ params }: { params: Promise<{ book: string; chapter: string }> }) { const resolved = await params; if (!/^\d+$/.test(resolved.chapter) || !getChapter(resolved.book, Number(resolved.chapter))) notFound(); return <SharedPage params={resolved} />; }
