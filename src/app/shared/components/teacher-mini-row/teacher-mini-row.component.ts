import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsoleSegmentTeacher } from '../../../core/services/admin-console.service';
import { timeAgo } from '../../utils/time-format';
import { FEATURE_LABELS } from '../../utils/feature-labels';

/**
 * ONE teacher, everywhere: on an expanded card, in a drill-down list, in a search
 * result. It exists once because "a call and a WhatsApp button on every teacher,
 * everywhere" is a promise that decays the moment it is implemented twice.
 *
 * WHAT IT SHOWS is the point. A name and a phone number is not enough to start a
 * call with: the first thing anyone asks is what state the account is in. So every
 * row carries the facts that decide how the conversation goes — what they pay for
 * and when it ends, how many students they have and how many are actually in a
 * class, how much of the product they use, when they were last seen, and who sold
 * them. Everything here is already in the row the list fetched; none of it costs a
 * second request.
 */
@Component({
  selector: 'app-teacher-mini-row',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <div class="main">
        <div class="line1">
          <a class="name" [routerLink]="['/teacher', t().teacherId]">{{ t().fullName }}</a>
          <span class="code tnum">{{ t().teacherCode }}</span>
          @if (t().username) {
            <span class="user">{{ t().username }}</span>
          }
        </div>

        <!-- Subscription first: it decides whether this is a sales call or a support
             call, and the day count is rendered rather than the status band because
             the two use different thresholds. -->
        <div class="facts">
          <span class="fact" [attr.data-tone]="subTone()">
            <b>{{ planLabel() }}</b>
            <span>{{ subLine() }}</span>
          </span>

          <span class="fact" [attr.data-tone]="t().studentCount === 0 ? 'gone' : studentTone()">
            <b class="tnum">{{ t().studentCount }}</b>
            <span>students{{ t().studentCount ? ', ' + t().studentsAssignedToSession + ' in a class' : '' }}</span>
          </span>

          <span class="fact">
            <b class="tnum">{{ t().sessionCount }}</b>
            <span>classes</span>
          </span>

          @if (t().activeAssistantCount > 0) {
            <span class="fact">
              <b class="tnum">{{ t().activeAssistantCount }}</b>
              <span>assistant{{ t().activeAssistantCount === 1 ? '' : 's' }}</span>
            </span>
          }

          <span class="fact" [attr.data-tone]="activityTone()">
            <b>{{ lastSeen() }}</b>
            <span>last active</span>
          </span>

          <span class="fact" [attr.data-tone]="t().featuresAdoptedCount === 0 ? 'gone' : ''">
            <b class="tnum">{{ t().featuresAdoptedCount }} of {{ t().featuresEntitledCount }}</b>
            <span>features used</span>
          </span>
        </div>

        @if (neverOpened(); as never) {
          <p class="never">Pays for but has never opened: {{ never }}</p>
        }

        @if (t().evidence) {
          <p class="why">{{ t().evidence }}</p>
        }

        <div class="line3">
          @if (t().phoneNumber) {
            <span class="phone tnum">{{ t().phoneNumber }}</span>
          } @else {
            <span class="no-phone">No phone number on file — nobody can call this teacher</span>
          }
          @if (t().salesRepName) {
            <span class="rep">Sold by {{ t().salesRepName }}</span>
          }
          @if (t().noteCount > 0) {
            <span class="notes">{{ t().noteCount }} note{{ t().noteCount === 1 ? '' : 's' }}</span>
          }
        </div>
      </div>

      <div class="acts">
        @if (t().phoneNumber; as phone) {
          <!-- Anchors, not buttons, so a long-press still offers "copy number". -->
          <a class="act call" [href]="'tel:' + phone" [attr.aria-label]="'Call ' + t().fullName">
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
            [attr.aria-label]="'WhatsApp ' + t().fullName"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a13 13 0 0 1-6.2-5.4c-.5-.8-.8-1.7-.8-2.5 0-.8.4-1.5.8-1.8.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.2-.3.3-.1.6.3.5.8 1.3 1.5 1.9.9.8 1.6 1 1.9 1.2.2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .1 0 .6-.2 1.1Z"
              />
            </svg>
            WhatsApp
          </a>
        }
        <a class="act open" [routerLink]="['/teacher', t().teacherId]">Open</a>
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
        padding: var(--s-4) 0;
      }

      .main {
        min-width: 0;
        flex: 1;
      }

      .line1 {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--s-2) var(--s-3);
      }
      .name {
        font-size: var(--t-md);
        font-weight: 650;
        color: var(--ink);
        text-decoration: none;
      }
      .name:hover,
      .name:focus-visible {
        color: var(--accent);
        text-decoration: underline;
      }
      .code,
      .user {
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      /* The facts strip. Each is a value with its own word beside it, so nothing has
         to be decoded — and each can carry a tone when the value is the problem. */
      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2) var(--s-4);
        margin-top: var(--s-2);
      }
      .fact {
        display: inline-flex;
        align-items: baseline;
        gap: 5px;
        font-size: var(--t-sm);
        color: var(--ink-3);
      }
      .fact b {
        font-weight: 650;
        color: var(--ink-2);
      }
      .fact[data-tone='live'] b {
        color: var(--live);
      }
      .fact[data-tone='risk'] b {
        color: var(--risk);
      }
      .fact[data-tone='gone'] b {
        color: var(--gone);
      }

      .never,
      .why {
        margin: var(--s-2) 0 0;
        font-size: var(--t-sm);
        max-width: 72ch;
      }
      .never {
        color: var(--risk);
      }
      .why {
        color: var(--ink-2);
      }

      .line3 {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2) var(--s-4);
        margin-top: var(--s-2);
        font-size: var(--t-sm);
      }
      .phone {
        font-weight: 600;
        color: var(--ink);
        letter-spacing: 0.02em;
      }
      .no-phone {
        color: var(--gone);
        font-weight: 600;
      }
      .rep,
      .notes {
        color: var(--ink-3);
        font-size: var(--t-xs);
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

      @media (max-width: 720px) {
        .row {
          flex-direction: column;
          gap: var(--s-3);
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
  /** The whole row. Passing the object rather than eight inputs means a field added
   *  to the contract shows up here without touching every call site. */
  readonly t = input.required<ConsoleSegmentTeacher>();

  protected readonly planLabel = computed(() => {
    const p = this.t().planType;
    if (!p) return 'No subscription';
    return p === 'ManagerialPlus' ? 'Managerial + Parents' : p;
  });

  /** The subscription in words, using the DAY COUNT rather than the status band. */
  protected readonly subLine = computed(() => {
    const days = this.t().subscriptionEndsInDays;
    if (days === null) return 'never subscribed';
    if (days < 0) return `ended ${Math.abs(days)} days ago`;
    if (days === 0) return 'ends today';
    return `${days} day${days === 1 ? '' : 's'} left`;
  });

  protected readonly subTone = computed(() => {
    const days = this.t().subscriptionEndsInDays;
    if (days === null || days < 0) return 'gone';
    return days <= 7 ? 'risk' : 'live';
  });

  protected readonly studentTone = computed(() => {
    const t = this.t();
    if (t.studentCount === 0) return 'gone';
    return t.studentsAssignedToSession === 0 ? 'risk' : 'live';
  });

  protected readonly activityTone = computed(() => {
    const d = this.t().activeDays30;
    if (d === 0) return 'gone';
    return d < 4 ? 'risk' : 'live';
  });

  protected readonly lastSeen = computed(() => {
    const at = this.t().lastActivityAt;
    return at ? timeAgo(at) : 'never';
  });

  /** Named, not counted — "pays for 3 things they never opened" is not a conversation. */
  protected readonly neverOpened = computed(() => {
    const list = this.t().featuresNeverUsed ?? [];
    if (list.length === 0) return null;
    return list.map((f) => FEATURE_LABELS[f] ?? f).join(', ');
  });

  /**
   * Egyptian numbers are stored as 01xxxxxxxxx; wa.me needs a country code and no
   * leading zero. A number that already carries 20 is passed through rather than
   * prefixed twice — that produced dead links on the old teacher panel.
   */
  protected whatsAppLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `https://wa.me/${digits}`;
    return `https://wa.me/20${digits.replace(/^0+/, '')}`;
  }
}
