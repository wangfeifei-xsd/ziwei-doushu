import { ALL_STARS, ALL_TOPICS, getKnowledge, getAllKnowledgeRoutes, STAR_BRIEF_SEO, STAR_TO_SLUG, SLUG_TO_STAR } from '@ziwei/content/seo/knowledge';
import type { TopicKey } from '@ziwei/domain/ziwei/db-analysis';
import { SITE_URL } from '@/lib/site';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
export const dynamicParams = false;
export async function generateStaticParams() {
  const routes = getAllKnowledgeRoutes();
  // URL 用拼音 slug 替代中文，避开 Vercel/CDN 中文路由边界问题
  return routes.map(r => ({ star: r.slug, topic: r.topic }));
}
export async function generateMetadata({ params }: { params: Promise<{ star: string; topic: string }> }) {
  const { star: slug, topic } = await params;
  const star = SLUG_TO_STAR[slug];
  if (!star) return {};
  const data = getKnowledge(star, topic as TopicKey);
  if (!data.exists) return {};

  const title = `${star}入${data.palaceName}宫 · ${data.topicLabel} · GitHub开源档案详解`;
  const description = data.parsed.dingdiao
    || `${star}入${data.palaceName}宫的紫微斗数解读 — 依据GitHub开源档案与古籍《紫微斗数全集》《骨髓赋》。`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    alternates: {
      canonical: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    keywords: [
      '紫微斗数', 'GitHub开源', star, data.palaceName, data.topicLabel,
      `${star}${data.palaceName}`, `${star}入${data.palaceName}`,
      `紫微斗数 ${star}`, '开源紫微斗数', '紫微斗数全集',
    ],
  };
}

import SharedPage from '@ziwei/features/pages/knowledge-detail';
export default async function Page({ params }: { params: Promise<{ star: string; topic: string }> }) { const resolved = await params; if (!SLUG_TO_STAR[resolved.star] || !getKnowledge(SLUG_TO_STAR[resolved.star], resolved.topic as TopicKey).exists) notFound(); return <SharedPage params={resolved} />; }
