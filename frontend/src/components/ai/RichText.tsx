import React from 'react';

/**
 * The little of Markdown a model actually uses, turned into elements.
 *
 * Every model writes **bold**, numbered steps and bullet lists whether or
 * not it is asked to, and printed as plain text those markers are worse
 * than nothing: the screenshot that started this had "1. **ตรวจสอบ
 * ข้อมูลบัญชี:**" on the line. A library for this would be a dependency
 * and a sanitiser for one page of chat; six rules covers what arrives.
 *
 * Nothing here builds HTML from the model's text — it returns React
 * elements, so a model that writes a <script> tag has written the
 * characters "<script>" and that is all it has done.
 */

/** **bold** and `code`, left as text where a marker is unpaired. */
const inline = (text: string, keyBase: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) {
      out.push(<strong key={`${keyBase}-b${i++}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{m[1]}</strong>);
    } else {
      out.push(
        <code
          key={`${keyBase}-c${i++}`}
          style={{
            fontFamily: 'var(--ff-mono, monospace)', fontSize: '.92em',
            background: 'var(--bg-input)', borderRadius: '3px', padding: '1px 4px',
          }}
        >{m[2]}</code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;

export const RichText = ({ text }: { text: string }) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];

  // Runs of list lines become one list; everything else is a paragraph,
  // and a blank line ends whatever is open.
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let k = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const body = para.join('\n');
    blocks.push(
      <p key={`p${k++}`} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{inline(body, `p${k}`)}</p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    // Two things take the markers away and both have to be undone here:
    // display:grid drops them in Chrome, and Tailwind's reset sets
    // list-style: none on every list in the app.
    const style: React.CSSProperties = {
      margin: 0, paddingLeft: '22px',
      listStyle: ordered ? 'decimal outside' : 'disc outside',
    };
    const item: React.CSSProperties = { marginBottom: '5px' };
    blocks.push(
      ordered
        ? <ol key={`l${k++}`} style={style}>{items.map((it, i) => <li key={i} style={item}>{inline(it, `l${k}-${i}`)}</li>)}</ol>
        : <ul key={`l${k++}`} style={style}>{items.map((it, i) => <li key={i} style={item}>{inline(it, `l${k}-${i}`)}</li>)}</ul>,
    );
    list = null;
  };

  for (const line of lines) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const number = NUMBER.exec(line);

    if (line.trim() === '') { flushList(); flushPara(); continue; }

    if (heading) {
      flushList(); flushPara();
      blocks.push(
        <div key={`h${k++}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{inline(heading[1], `h${k}`)}</div>,
      );
      continue;
    }
    if (bullet || number) {
      flushPara();
      const ordered = !!number;
      const item = (bullet ? bullet[1] : number![2]).trim();
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(item);
      continue;
    }
    // A wrapped continuation of the item above belongs to it.
    if (list) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    para.push(line);
  }
  flushList();
  flushPara();

  return <div style={{ display: 'grid', gap: '10px' }}>{blocks}</div>;
};
