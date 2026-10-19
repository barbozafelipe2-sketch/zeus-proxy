import { marked } from './vendor/marked.mjs';
import DOMPurify from './vendor/dompurify.mjs';

// A narrow reading surface: no images, embeds, forms, styles or event handlers.
// Dependencies are served locally so private chat needs no third-party scripts.
export function renderMarkdown(content = '') {
  const clean = DOMPurify.sanitize(marked.parse(String(content), { gfm: true, breaks: true }), {
    ALLOWED_TAGS: ['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','title','start'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  for (const link of template.content.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    // A URL removed by DOMPurify must stay inert, not become a link to this app.
    if (!href) continue;
    try {
      const url = new URL(href, location.href);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsafe link');
      link.setAttribute('href', url.href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } catch { link.removeAttribute('href'); }
  }
  for (const table of template.content.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table';
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Tabela da resposta; role para ver todas as colunas');
    table.replaceWith(wrapper); wrapper.append(table);
  }
  for (const pre of template.content.querySelectorAll('pre')) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'copy-code';
    button.textContent = 'Copiar código';
    pre.prepend(button);
  }
  return template.innerHTML;
}
