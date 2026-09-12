import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TeacherProfile } from '../../../core/models/teacher.model';
import { TeacherService } from '../../../core/services/teacher.service';
import { AdminInsightsService, TeacherUsage } from '../../../core/services/admin-insights.service';

/**
 * THE TEACHER RECORD — the screen a support call is answered from.
 *
 * The header carries everything needed to START the call: who they are, how to
 * reach them, whether they are paying and for how much longer. The tabs beneath it
 * each answer one question that comes up during the call, so nobody has to leave the
 * page and lose their place to find out what the account contains.
 *
 * The header reads the GRID row rather than the profile for the commercial facts,
 * because the grid row carries the day count, and the day count is what a screen
 * renders instead of the status band — the band's threshold and the console's differ.
 */
@Component({
  selector: 'app-teacher-details',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <a class="back" routerLink="/teachers">← All teachers</a>

    @if (teacher(); as t) {
      <header class="head">
        <div class="who">
          <h1>{{ t.fullName }}</h1>
          <div class="meta">
            <span class="tnum">{{ t.teacherCode }}</span>
            @if (t.phoneNumber) {
              <span class="tnum phone">{{ t.phoneNumber }}</span>
            } @else {
              <span class="nophone">No phone on file</span>
            }
            @if (t.email) {
              <span>{{ t.email }}</span>
            }
          </div>

          <div class="chips">
            <span class="chip" [attr.data-tone]="statusTone()">{{ statusLine() }}</span>
            <span class="chip" [attr.data-tone]="t.accountStatus === 'Active' ? '' : 'gone'">
              Account {{ accountStatusLabel(t.accountStatus) }}
            </span>
            @if (row(); as r) {
              @if (r.noteCount > 0) {
                <span class="chip">{{ r.noteCount }} note{{ r.noteCount === 1 ? '' : 's' }}</span>
              }
            }
          </div>
        </div>

        <div class="acts">
          @if (t.phoneNumber; as phone) {
            <a class="act primary" [href]="'tel:' + phone">Call</a>
            <a class="act primary" [href]="whatsAppLink(phone)" target="_blank" rel="noopener">
              WhatsApp
            </a>
          }
          <a class="act" [routerLink]="['/teacher', t.id, 'edit']">Edit</a>
        </div>
      </header>

      <nav class="tabs" aria-label="Teacher sections">
        <a [routerLink]="['/teacher', t.id]" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
          Overview
        </a>
        <a [routerLink]="['/teacher', t.id, 'subscription']" routerLinkActive="on">Subscription</a>
        <a [routerLink]="['/teacher', t.id, 'students']" routerLinkActive="on">Students</a>
        <a [routerLink]="['/teacher', t.id, 'student-accounts']" routerLinkActive="on">Student accounts</a>
        <a [routerLink]="['/teacher', t.id, 'team']" routerLinkActive="on">Team</a>
        <a [routerLink]="['/teacher', t.id, 'activity']" routerLinkActive="on">Activity</a>
        <a [routerLink]="['/teacher', t.id, 'snapshot']" routerLinkActive="on">What they have</a>
        <a [routerLink]="['/teacher', t.id, 'modules']" routerLinkActive="on">Modules</a>
        <a [routerLink]="['/teacher', t.id, 'profile']" routerLinkActive="on">Profile &amp; capacity</a>
      </nav>

      <div class="body">
        <router-outlet />
      </div>
    } @else {
      <div class="sk-head"></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--s-5);
        overflow-x: hidden;
      }
      .back {
        display: inline-block;
        margin-bottom: var(--s-3);
        font-size: var(--t-sm);
        color: var(--ink-3);
        text-decoration: none;
      }
      .back:hover {
        color: var(--accent);
      }

      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s-4);
        margin-bottom: var(--s-4);
      }
      h1 {
        margin: 0;
        font-size: var(--t-xl);
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2) var(--s-3);
        margin-top: var(--s-2);
        font-size: var(--t-sm);
        color: var(--ink-3);
      }
      .phone {
        color: var(--ink);
        font-weight: 600;
      }
      .nophone {
        color: var(--gone);
        font-weight: 600;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        margin-top: var(--s-3);
      }
      .chip {
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--quiet-soft);
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-2);
      }
      .chip[data-tone='live'] {
        background: var(--live-soft);
        color: var(--live);
      }
      .chip[data-tone='risk'] {
        background: var(--risk-soft);
        color: var(--risk);
      }
      .chip[data-tone='gone'] {
        background: var(--gone-soft);
        color: var(--gone);
      }

      .acts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
      }
      .act {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 var(--s-4);
        border-radius: var(--r-sm);
        background: var(--quiet-soft);
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-2);
        text-decoration: none;
      }
      .act:hover {
        background: var(--rule);
        color: var(--ink);
      }
      .act.primary {
        background: var(--accent-soft);
        color: var(--accent-ink);
      }
      .act.primary:hover {
        background: #dde7ff;
      }

      /* Nine tabs do not fit a phone; they scroll sideways inside their own strip
         rather than wrapping into a block that pushes the content off screen. */
      .tabs {
        display: flex;
        gap: var(--s-2);
        overflow-x: auto;
        padding-bottom: var(--s-2);
        margin-bottom: var(--s-4);
        border-bottom: 1px solid var(--rule);
      }
      .tabs a {
        flex-shrink: 0;
        padding: var(--s-2) var(--s-3);
        border-radius: var(--r-sm) var(--r-sm) 0 0;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink-3);
        text-decoration: none;
        white-space: nowrap;
      }
      .tabs a:hover {
        color: var(--ink);
        background: var(--quiet-soft);
      }
      .tabs a.on {
        color: var(--accent-ink);
        background: var(--accent-soft);
      }
      .tabs a:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }

      .sk-head {
        height: 120px;
        border-radius: var(--r-md);
        background: var(--quiet-soft);
      }
    `,
  ],
})
export class TeacherDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly teacherService = inject(TeacherService);
  private readonly insights = inject(AdminInsightsService);

  protected readonly teacher = signal<TeacherProfile | null>(null);
  /** The grid row, for the commercial facts the profile does not carry. */
  protected readonly row = signal<TeacherUsage | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.teacherService.getTeacherById(+id).subscribe((t) => this.teacher.set(t));
    this.insights.getTeacher(+id).subscribe((d) => this.row.set(d.summary));
  }

  /**
   * The subscription in words, from the DAY COUNT rather than the status band —
   * the band bands at five days and this console counts seven, so rendering both
   * would put two true statements side by side that read as a contradiction.
   */
  protected readonly statusLine = computed(() => {
    const r = this.row();
    if (!r) return 'Subscription…';

    const plan = r.planType === 'ManagerialPlus' ? 'Managerial + Parents' : (r.planType ?? 'No plan');
    const d = r.subscriptionEndsInDays;
    if (d === null) return `${plan} · never subscribed`;
    if (d < 0) return `${plan} · ended ${Math.abs(d)} days ago`;
    if (d === 0) return `${plan} · ends today`;
    return `${plan} · ${d} day${d === 1 ? '' : 's'} left`;
  });

  protected readonly statusTone = computed(() => {
    const d = this.row()?.subscriptionEndsInDays;
    if (d === undefined) return '';
    if (d === null || d < 0) return 'gone';
    return d <= 7 ? 'risk' : 'live';
  });

  /** "Active" reads as shouting in a chip beside a name; lower-case it here rather
   *  than pull the whole CommonModule in for one pipe. */
  protected accountStatusLabel(status: string): string {
    return (status ?? '').toLowerCase();
  }

  protected whatsAppLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `https://wa.me/${digits}`;
    return `https://wa.me/20${digits.replace(/^0+/, '')}`;
  }
}
