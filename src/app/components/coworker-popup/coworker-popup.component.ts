import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee, Shift } from '../../models/timesheet.model';

@Component({
  selector: 'app-coworker-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coworker-popup.component.html',
  styleUrls: ['./coworker-popup.component.css']
})
export class CoworkerPopupComponent {
  @Input() visible: boolean = false;
  @Input() employeeName: string = '';
  @Input() shiftDate: Date | null = null;
  @Input() shiftStart: string | null = null;
  @Input() shiftEnd: string | null = null;
  @Input() coworkers: {name: string, department: string, startTime: string | null, endTime: string | null}[] = [];
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  formatDate(date: Date | null): string {
    if (!date) return 'Unknown Date';

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    return date.toLocaleDateString(undefined, options);
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
