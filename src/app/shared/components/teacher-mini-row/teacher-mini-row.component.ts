import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * ONE teacher, everywhere: on an expanded card, in a drill-down list, in a search
 * result. Name, code, phone, the two buttons that start a conversation, and the one
 * line saying why this person is in front of you.
 *
 * It exists once because "a call and a WhatsApp button on every teacher, everywhere"
 * is a promise that decays the moment it is implemented twice — the second copy gets
 * a slightly different phone format, or loses the WhatsApp button on a screen nobody
 * checked. Every list on this console renders this component.
 */
@Component({
  selector: 'app-teacher-mini-row',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <div class="who">
        <a class="name" [routerLink]="['/teacher', teacherId()]">{{ fullName() }}</a>
        <div class="meta">
          <span class="code tnum">{{ teacherCode() }}</span>
          @if (phoneNumber()) {
            <span class="phone tnum">{{ phoneNumber() }}</span>
          } @else {
            <span class="no-phone">No phone on file</span>
          }
        </div>
        @if (evidence()) {
          <p class="why">{{ evidence() }}</p>
        }
      </div>

      <div class="acts">
        @if (phoneNumber(); as phone) {
          <!-- tel: and wa.me are the two things this console is FOR. They are
               anchors, not buttons, so a long-press still offers "copy number". -->
          <a class="act call" [href]="'tel:' + phone" [attr.aria-label]="'Call ' + fullName()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"
              />
            </svg>
            Call
          </a>
          <a
            class="act wa"
            [href]="whatsAppLink(phone)"
            target="_blank"
            rel="noopener"
            [attr.aria-label]="'WhatsApp ' + fullName()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a13 13 0 0 1-6.2-5.4c-.5-.8-.8-1.7-.8-2.5 0-.8.4-1.5.8-1.8.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.2-.3.3-.1.6.3.5.8 1.3 1.5 1.9.9.8 1.6 1 1.9 1.2.2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .1 0 .6-.2 1.1Z"
              />
            </svg>
            WhatsApp
          </a>
        }
        <a class="act open" [routerLink]="['/teacher', teacherId()]">Open</a>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-4);
        padding: var(--s-3) 0;
      }

      .who {
        min-width: 0;
      }

      .name {
        display: inline-block;
        font-size: var(--t-base);
        font-weight: 600;
        color: var(--ink);
        text-decoration: none;
      }
      .name:hover,
      .name:focus-visible {
        color: var(--accent);
        text-decoration: underline;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
        margin-top: 2px;
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      .no-phone {
        color: var(--risk);
      }

      /* The evidence line is the reason this row is on screen, so it reads as a
         sentence rather than as metadata. */
      .why {
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
        color: var(--ink-2);
        max-width: 60ch;
      }

      .acts {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        flex-shrink: 0;
      }

      .act {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        /* 44px min target — this console is used on a phone, one-handed, between calls. */
        min-height: 44px;
        padding: 0 var(--s-3);
        border-radius: var(--r-sm);
        font-size: var(--t-sm);
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
        transition: background-color 160ms ease, color 160ms ease;
      }

      .act svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .call {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .call:hover {
        background: #dde7ff;
      }

      .wa {
        background: var(--live-soft);
        color: var(--live);
      }
      .wa:hover {
        background: #d3ece6;
      }

      .open {
        color: var(--ink-3);
      }
      .open:hover {
        color: var(--ink);
        background: var(--quiet-soft);
      }

      .act:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      /* On a phone the two buttons matter more than the metadata, so the row
         becomes one column and the actions sit full-width under the name. */
      @media (max-width: 640px) {
        .row {
          flex-direction: column;
          gap: var(--s-2);
        }
        .acts {
          width: 100%;
        }
        .call,
        .wa {
          flex: 1;
          justify-content: center;
        }
      }
    `,
  ],
})
export class TeacherMiniRowComponent {
  readonly teacherId = input.required<number>();
  readonly fullName = input.required<string>();
  readonly teacherCode = input<string>('');
  readonly phoneNumber = input<string | null>(null);
  /** Why this teacher is in this particular list. */
  readonly evidence = input<string | null>(null);

  readonly opened = output<number>();

  /**
   * Egyptian numbers are stored as 01xxxxxxxxx; wa.me needs a country code and no
   * leading zero. A number that already carries 20 (or +20) is passed through rather
   * than prefixed twice — that produced dead links on the teacher panel.
   */
  protected whatsAppLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `https://wa.me/${digits}`;
    return `https://wa.me/20${digits.replace(/^0+/, '')}`;
  }
}
