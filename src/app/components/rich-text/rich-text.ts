import { Component, computed, inject, input, ViewEncapsulation } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const markdown = new Marked({ gfm: true, breaks: true, async: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
});

/** Markdown rendered with `marked` and sanitised with DOMPurify. */
@Component({
  selector: 'bt-rich-text',
  template: '',
  styleUrl: './rich-text.scss',
  // Styles the rendered HTML, which carries no component attributes.
  encapsulation: ViewEncapsulation.None,
  host: { '[innerHTML]': 'html()' },
})
export class RichText {
  private sanitizer = inject(DomSanitizer);
  readonly text = input.required<string>();

  readonly html = computed(() =>
    // DOMPurify has sanitised the HTML; Angular's sanitiser would drop the link targets.
    this.sanitizer.bypassSecurityTrustHtml(
      DOMPurify.sanitize(markdown.parse(this.text()) as string, { ADD_ATTR: ['target'] }),
    ),
  );
}
