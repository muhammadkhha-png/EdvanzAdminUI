import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminInsightsService, SalesRep } from '../../core/services/admin-insights.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ToastService } from '../../core/services/toast.service';

/**
 * THE SALES BOOK.
 *
 * Attribution used to live only in a Google Sheet with no shared identifier back
 * to the platform, so nobody could answer the question that actually matters:
 * of the accounts a rep brought in, how many went live?
 *
 * The table is ordered to make that the point. "Signed" is the vanity number and
 * sits first only because it is the denominator; "Live" and "Never started" are
 * what a conversation with a rep is about.
 */
@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, ModalComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>Sales</h2>
        <p>
          Who brought each teacher in, and what happened to the accounts
          afterwards.
        </p>
      </div>
      <div class="head-actions">
        <label class="show-inactive">
          <input type="checkbox" [checked]="includeInactive()" (change)="toggleInactive()" />
          Include people who left
        </label>
        <button type="button" class="btn btn-primary" (click)="openNew()">Add a rep</button>
      </div>
    </div>

    <div class="panel">
      <div class="row-head" aria-hidden="true">
        <span>Rep</span>
        <span class="num">Signed</span>
        <span class="num">Live</span>
        <span class="num">Set up</span>
        <span class="num">Went quiet</span>
        <span class="num">Never started</span>
        <span></span>
      </div>

      @if (loading()) {
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton-row"></div>
        }
      } @else if (reps().length === 0) {
        <div class="empty">
          <h3>No sales reps yet</h3>
          <p>Add the people selling Edvanz, then assign teachers to them from each teacher's page.</p>
        </div>
      } @else {
        @for (rep of reps(); track rep.id) {
          <div class="row" [class.inactive]="!rep.isActive">
            <span class="cell rep">
              <span class="r-name">
                {{ rep.name }}
                @if (!rep.isActive) {
                  <span class="left-tag">Left</span>
                }
              </span>
              @if (rep.phoneNumber) {
                <a class="r-phone" [href]="'tel:' + rep.phoneNumber">{{ rep.phoneNumber }}</a>
              }
            </span>

            <span class="cell num tnum strong">{{ rep.teachersAssigned }}</span>
            <span class="cell num tnum live">{{ rep.teachersLive }}</span>
            <span class="cell num tnum">{{ rep.teachersWithRealData }}</span>
            <span class="cell num tnum risk">{{ rep.teachersDormant }}</span>
            <span class="cell num tnum gone">{{ rep.teachersNeverStarted }}</span>

            <span class="cell actions">
              <a class="link-btn" [routerLink]="['/usage']" [queryParams]="{ salesRepId: rep.id }">
                See teachers
              </a>
              <button type="button" class="link-btn" (click)="openEdit(rep)">Edit</button>
            </span>
          </div>
        }
      }
    </div>

    @if (editing()) {
      <app-modal
        [heading]="form.value.id ? 'Edit rep' : 'Add a rep'"
        [dismissOnBackdrop]="false"
        (dismissed)="close()"
      >
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="mb-3">
            <label class="form-label" for="rep-name">Name</label>
            <input id="rep-name" class="form-control" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <p class="field-error">Enter the rep's name.</p>
            }
          </div>
          <div class="mb-3">
            <label class="form-label" for="rep-phone">Phone</label>
            <input id="rep-phone" class="form-control" formControlName="phoneNumber" />
          </div>
          <label class="pin">
            <input type="checkbox" formControlName="isActive" />
            Still on the team
          </label>
          <p class="hint">
            Turning this off hides them when assigning new teachers. Their name stays
            on every teacher they already brought in.
          </p>
        </form>

        <ng-container modalActions>
          <button type="button" class="btn btn-outline-secondary" (click)="close()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="save()" [disabled]="busy()">
            Save
          </button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: [
    `
      .head-actions {
        display: flex;
        align-items: center;
        gap: var(--s-4);
        flex-wrap: wrap;
      }
      .show-inactive {
        display: flex;
        align-items: center;
        gap: var(--s-1);
        font-size: var(--t-sm);
        color: var(--ink-2);
      }

      .row-head,
      .row {
        display: grid;
        grid-template-columns: minmax(180px, 2fr) repeat(5, 5.5rem) minmax(150px, auto);
        gap: var(--s-3);
        align-items: center;
        padding: var(--s-3) var(--s-4);
      }
      .row-head {
        font-size: var(--t-xs);
        font-weight: 600;
        color: var(--ink-3);
        background: var(--surface-2);
        border-bottom: 1px solid var(--rule-strong);
      }
      .row {
        border-bottom: 1px solid var(--rule);
      }
      .row:last-of-type {
        border-bottom: 0;
      }
      .row.inactive {
        opacity: 0.66;
      }
      .cell {
        min-width: 0;
      }
      .num {
        text-align: right;
        font-size: var(--t-sm);
      }
      .strong {
        font-weight: 600;
      }
      /* Colour only on the three outcomes that change what you say to the rep. */
      .live {
        color: var(--live);
        font-weight: 600;
      }
      .risk {
        color: var(--risk);
      }
      .gone {
        color: var(--gone);
      }
      .rep {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .r-name {
        font-weight: 500;
        font-size: var(--t-base);
      }
      .left-tag {
        font-size: var(--t-xs);
        font-weight: 400;
        color: var(--ink-3);
        margin-left: var(--s-1);
      }
      .r-phone {
        font-family: var(--font-mono);
        font-size: var(--t-xs);
        text-decoration: none;
      }
      .actions {
        display: flex;
        gap: var(--s-3);
        justify-content: flex-end;
      }
      .link-btn {
        border: 0;
        background: none;
        padding: 0;
        color: var(--accent);
        font-size: var(--t-sm);
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
      }

      .empty {
        padding: var(--s-7) var(--s-4);
        text-align: center;
      }
      .empty h3 {
        margin: 0 0 var(--s-2);
        font-size: var(--t-md);
      }
      .empty p {
        margin: 0 auto;
        max-width: 48ch;
        color: var(--ink-3);
        font-size: var(--t-sm);
      }

      .skeleton-row {
        height: 56px;
        border-bottom: 1px solid var(--rule);
        background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }
      @keyframes shimmer {
        to {
          background-position: -200% 0;
        }
      }

      .pin {
        display: flex;
        align-items: center;
        gap: var(--s-2);
        font-size: var(--t-sm);
      }
      .hint {
        margin: var(--s-2) 0 0;
        font-size: var(--t-xs);
        color: var(--ink-3);
        line-height: 1.5;
      }
      .field-error {
        margin: var(--s-1) 0 0;
        font-size: var(--t-xs);
        color: var(--gone);
      }

      /* Phones: the six numbers become two rows of labelled figures rather than
         a table nobody can read sideways. */
      @media (max-width: 767.98px) {
        .row-head {
          display: none;
        }
        .row {
          grid-template-columns: repeat(3, 1fr);
          grid-template-areas:
            'rep  rep   rep'
            'a    b     c'
            'd    e     act';
          gap: var(--s-2) var(--s-3);
        }
        .rep {
          grid-area: rep;
        }
        .num {
          text-align: left;
        }
        .num::after {
          display: block;
          font-size: var(--t-xs);
          font-weight: 400;
          color: var(--ink-3);
        }
        .cell:nth-child(2) {
          grid-area: a;
        }
        .cell:nth-child(2)::after {
          content: 'signed';
        }
        .cell:nth-child(3) {
          grid-area: b;
        }
        .cell:nth-child(3)::after {
          content: 'live';
        }
        .cell:nth-child(4) {
          grid-area: c;
        }
        .cell:nth-child(4)::after {
          content: 'set up';
        }
        .cell:nth-child(5) {
          grid-area: d;
        }
        .cell:nth-child(5)::after {
          content: 'went quiet';
        }
        .cell:nth-child(6) {
          grid-area: e;
        }
        .cell:nth-child(6)::after {
          content: 'never started';
        }
        .actions {
          grid-area: act;
          justify-content: flex-end;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class SalesComponent implements OnInit {
  private readonly insights = inject(AdminInsightsService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly reps = signal<SalesRep[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly includeInactive = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    id: 0,
    name: ['', Validators.required],
    phoneNumber: '',
    isActive: true,
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.insights.getSalesReps(this.includeInactive()).subscribe({
      next: (r) => {
        this.reps.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected toggleInactive(): void {
    this.includeInactive.update((v) => !v);
    this.load();
  }

  protected openNew(): void {
    this.form.reset({ id: 0, name: '', phoneNumber: '', isActive: true });
    this.editing.set(true);
  }

  protected openEdit(rep: SalesRep): void {
    this.form.reset({
      id: rep.id,
      name: rep.name,
      phoneNumber: rep.phoneNumber ?? '',
      isActive: rep.isActive,
    });
    this.editing.set(true);
  }

  protected close(): void {
    this.editing.set(false);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { id, name, phoneNumber, isActive } = this.form.getRawValue();
    const body = { name: name.trim(), phoneNumber: phoneNumber.trim() || null, isActive };

    this.busy.set(true);
    const request$ = id
      ? this.insights.updateSalesRep(id, body)
      : this.insights.createSalesRep(body);

    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.editing.set(false);
        this.toast.success(id ? 'Rep updated.' : 'Rep added.');
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }
}
