import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AdminConsoleService, ConsoleSearch, ConsoleSearchHit } from '../../core/services/admin-console.service';

/**
 * ONE SEARCH BOX for the whole console.
 *
 * Support calls do not arrive scoped to a screen. Someone rings about "Mohamed" and
 * nobody knows yet whether that is a teacher, a student on somebody's roster, a
 * student's own app account, or an assistant — and until this existed, finding out
 * meant guessing a screen and using its local filter, four times over.
 *
 * Results stay GROUPED rather than merged into one ranked list, because the four
 * kinds are not interchangeable: a roster record and the student's own login are
 * different things, and telling them apart is usually the answer to the call.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <input
        #box
        type="search"
        class="box"
        placeholder="Search teachers, students, accounts, assistants"
        aria-label="Search everything"
        autocomplete="off"
        role="combobox"
        [attr.aria-expanded]="open()"
        aria-controls="global-search-results"
        [formControl]="query"
        (focus)="open.set(true)"
        (keydown.escape)="close()"
        (keydown.enter)="openFirst()"
      />

      @if (open() && query.value.trim().length >= 2) {
        <div class="panel" id="global-search-results" role="listbox">
          @if (loading()) {
            <p class="state">Searching…</p>
          } @else if (!results() || results()!.totalHits === 0) {
            <p class="state">Nothing matches "{{ query.value.trim() }}".</p>
          } @else {
            @for (g of groups(); track g.title) {
              @if (g.hits.length) {
                <div class="group">
                  <h3>{{ g.title }}</h3>
                  @for (h of g.hits; track h.kind + h.id) {
                    <button type="button" class="hit" role="option" (click)="go(h)">
                      <span class="h-name">{{ h.fullName }}</span>
                      <span class="h-meta">
                        @if (h.code) {
                          <span class="tnum">{{ h.code }}</span>
                        }
                        @if (h.phoneNumber) {
                          <span class="tnum">{{ h.phoneNumber }}</span>
                        }
                        @if (h.teacherName && h.kind !== 'Teacher') {
                          <span>with {{ h.teacherName }}</span>
                        }
                      </span>
                    </button>
                  }
                </div>
              }
            }
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        flex: 1 1 320px;
        max-width: 460px;
        min-width: 0;
      }
      .box {
        width: 100%;
        min-height: 40px;
        padding: 0 var(--s-3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--r-sm);
        background: var(--surface);
        font: inherit;
        font-size: var(--t-sm);
        color: var(--ink);
      }
      .box:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
        border-color: var(--accent);
      }

      .panel {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        z-index: var(--z-drawer);
        max-height: 70vh;
        overflow-y: auto;
        padding: var(--s-2);
        background: var(--surface);
        border-radius: var(--r-lg);
        box-shadow: var(--lift-pop);
      }

      .state {
        margin: 0;
        padding: var(--s-3);
        font-size: var(--t-sm);
        color: var(--ink-3);
      }

      .group + .group {
        margin-top: var(--s-2);
        padding-top: var(--s-2);
        border-top: 1px solid var(--rule);
      }
      h3 {
        margin: 0 0 2px;
        padding: 0 var(--s-2);
        font-size: var(--t-xs);
        font-weight: 650;
        color: var(--ink-3);
      }

      .hit {
        display: block;
        width: 100%;
        padding: var(--s-2);
        border: 0;
        border-radius: var(--r-sm);
        background: none;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .hit:hover,
      .hit:focus-visible {
        background: var(--accent-soft);
        outline: none;
      }
      .h-name {
        display: block;
        font-size: var(--t-sm);
        font-weight: 600;
        color: var(--ink);
      }
      .h-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
        font-size: var(--t-xs);
        color: var(--ink-3);
      }

      @media (max-width: 720px) {
        :host {
          flex-basis: 100%;
          max-width: none;
        }
      }
    `,
  ],
})
export class GlobalSearchComponent {
  private readonly api = inject(AdminConsoleService);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly results = signal<ConsoleSearch | null>(null);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);

  constructor() {
    this.query.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        // switchMap, not mergeMap: typing fast fires several requests and only the
        // LAST one describes what is in the box. Without it a slow earlier response
        // can land after a faster later one and show results for a prefix.
        switchMap((value) => {
          const term = value.trim();
          if (term.length < 2) {
            this.results.set(null);
            this.loading.set(false);
            return [];
          }
          this.loading.set(true);
          this.open.set(true);
          return this.api.search(term, 5);
        }),
      )
      .subscribe({
        next: (r) => {
          this.results.set(r);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  /** Grouped, never merged — the four kinds are not interchangeable. */
  protected readonly groups = computed(() => {
    const r = this.results();
    if (!r) return [];
    return [
      { title: 'Teachers', hits: r.teachers },
      { title: 'Students on a roster', hits: r.students },
      { title: 'Student app accounts', hits: r.studentAccounts },
      { title: 'Assistants', hits: r.assistants },
    ];
  });

  /** Enter goes to the first hit, which is a teacher whenever there is one. */
  protected openFirst(): void {
    const first = this.groups().flatMap((g) => g.hits)[0];
    if (first) this.go(first);
  }

  protected go(hit: ConsoleSearchHit): void {
    this.close();
    this.query.setValue('', { emitEvent: false });
    this.results.set(null);

    switch (hit.kind) {
      case 'Teacher':
        this.router.navigate(['/teacher', hit.id]);
        break;
      case 'Student':
        this.router.navigate(['/students', hit.id]);
        break;
      case 'StudentAccount':
        // There is no per-account page; the teacher's Student accounts tab is where
        // one is acted on, and the account's code finds it in that tab's search.
        this.router.navigate(['/student-accounts'], { queryParams: { q: hit.code } });
        break;
      case 'Assistant':
        if (hit.teacherId) this.router.navigate(['/teacher', hit.teacherId, 'team']);
        else this.router.navigate(['/assistants']);
        break;
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  /** A dropdown that stays open after a click elsewhere covers the page it is over. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
