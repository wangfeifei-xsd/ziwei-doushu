import Link from '@ziwei/runtime/navigation';
import { getParagraphById } from '@ziwei/content/classics';

/** 只链接仓库中真实存在的参考段落，其他模型输出保留为普通文本。 */
export default function AiInlineText({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]\n]+\]\(\/(?:library\/[a-z-]+\/\d+#[\w-]+|dataset\?key=[\w%-]+&topic=\w+(?:#p-\w+-\d+)?)\))/g).map((part, index) => {
    // Historical answers may reference the retired dataset page. Keep their labels as text.
    const dataset=part.match(/^\[([^\]]+)\]\(\/dataset\?key=[\w%-]+&topic=\w+(?:#p-\w+-\d+)?\)$/);
    if(dataset)return dataset[1];
    const match = part.match(/^\[([^\]]+)\]\((\/library\/[a-z-]+\/\d+#([\w-]+))\)$/);
    if (!match) return part;
    const source = getParagraphById(match[3]);
    if (!source || match[2] !== `/library/${source.book.slug}/${source.chapterIdx}#${source.paragraph.id}`) return part;
    return <Link key={index} href={match[2]} className="underline underline-offset-2" style={{ color: 'var(--ac)' }}>{match[1]}</Link>;
  })}</>;
}
