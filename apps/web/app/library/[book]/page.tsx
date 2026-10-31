import { ALL_BOOKS, getBookBySlug } from '@ziwei/content/classics';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
export async function generateStaticParams() {
  return ALL_BOOKS.map(b => ({ book: b.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = getBookBySlug(slug);
  if (!book) return {};
  return {
    title: `《${book.title}》· ${book.dynasty} · 紫微斗数古籍原典库`,
    description: book.intro,
  };
}

import SharedPage from '@ziwei/features/pages/book';
export default async function Page({ params }: { params: Promise<{ book: string }> }) { const resolved = await params; if (!getBookBySlug(resolved.book)) notFound(); return <SharedPage params={resolved} />; }
