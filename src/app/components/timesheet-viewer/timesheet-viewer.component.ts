import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventInput, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { TimesheetService } from '../../services/timesheet.service';
import { Employee, Shift } from '../../models/timesheet.model';
import { CoworkerPopupComponent } from '../coworker-popup/coworker-popup.component';

@Component({
  selector: 'app-timesheet-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule, CoworkerPopupComponent],
  templateUrl: './timesheet-viewer.component.html',
  styleUrls: ['./timesheet-viewer.component.css']
})
export class TimesheetViewerComponent implements OnInit, OnDestroy {

  employees: Employee[] = [];
  selectedEmployeeId: number | null = null;

  // Popup related properties
  showCoworkersPopup: boolean = false;
  popupShiftDate: Date | null = null;
  popupShiftStart: string | null = null;
  popupShiftEnd: string | null = null;
  coworkersOnShift: {name: string, department: string, startTime: string | null, endTime: string | null}[] = [];

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek'
    },
    // Ensure we show the full month by disabling fixed week count
    fixedWeekCount: false,
    // Show entire month regardless of first day
    showNonCurrentDates: false,
    events: [],
    height: 'auto',
    // Hide the default time display
    displayEventTime: false,
    // Event click handler
    eventClick: (clickInfo) => {
      console.log('Event clicked via FullCalendar handler');
      this.handleEventClick(clickInfo);
    },
    // Format time strings consistently (just in case they appear)
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    // Change default event display options
    eventDisplay: 'block',
    // Custom event rendering with forced line breaks
    eventContent: (arg) => {
      // Just use the HTML string approach for simplicity
      let htmlContent = '<div class="shift-content">';

      // Access the event's custom data
      const startTime = arg.event.extendedProps['startTime'];
      const endTime = arg.event.extendedProps['endTime'];
      const hours = arg.event.extendedProps['hours'];
      const specialMarker = arg.event.extendedProps['specialMarker'];
      const isOvernightShift = arg.event.extendedProps['isOvernightShift'];
      const nextDay = arg.event.extendedProps['nextDay'];

      // If we have a special marker, show it first
      if (specialMarker) {
        htmlContent += `<div class="shift-line marker">${specialMarker}</div>`;
      }

      // Handle overnight shifts with special formatting
      if (isOvernightShift) {
        htmlContent += `<div class="shift-line overnight-marker">Overnight Shift</div>`;

        if (startTime) {
          htmlContent += `<div class="shift-line">Start: ${startTime}</div>`;
        }

        if (endTime) {
          htmlContent += `<div class="shift-line">End: ${endTime} (next day)</div>`;
        }
      } else {
        // Regular shift display
        if (startTime) {
          htmlContent += `<div class="shift-line">Start: ${startTime}</div>`;
        }

        if (endTime) {
          htmlContent += `<div class="shift-line">End: ${endTime}</div>`;
        }
      }

      // Add hours if available
      if (hours) {
        htmlContent += `<div class="shift-line">Total: ${hours}h</div>`;
      }

      // If nothing was added, add the title
      if (!specialMarker && !startTime && !endTime && !hours) {
        htmlContent += `<div class="shift-line">${arg.event.title || 'Shift'}</div>`;
      }

      htmlContent += '</div>';

      // Return just the HTML string, not using domNodes
      return { html: htmlContent };
    },
    // Apply custom styling to events and ensure our custom content is visible
    eventDidMount: (info) => {
      // Style the main event element
      info.el.style.height = 'auto';
      info.el.style.minHeight = '60px';
      info.el.style.overflow = 'visible';

      // Find and ensure our custom content is visible
      const contentEl = info.el.querySelector('.shift-content') as HTMLElement;
      if (contentEl) {
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
      }

      // Hide any default time elements
      const timeEl = info.el.querySelector('.fc-event-time') as HTMLElement;
      if (timeEl) {
        timeEl.style.display = 'none';
      }

      // Add click feedback to help users
      const eventEl = info.el;
      eventEl.style.cursor = 'pointer';
      eventEl.title = 'Click to see coworkers on this shift';

      // Add a visual indicator for clickable events
      const clickIconEl = document.createElement('div');
      clickIconEl.innerHTML = '👥';
      clickIconEl.style.position = 'absolute';
      clickIconEl.style.top = '2px';
      clickIconEl.style.right = '2px';
      clickIconEl.style.fontSize = '12px';
      eventEl.appendChild(clickIconEl);
    }
  };

  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  private subscription: Subscription | null = null;

  constructor(
    private timesheetService: TimesheetService,
    private router: Router
  ) {}

  // Getter for the selected employee
  get selectedEmployee(): Employee | undefined {
    if (this.selectedEmployeeId === null) return undefined;
    const employee = this.employees.find(emp => emp.id === this.selectedEmployeeId);
    if (!employee) {
      console.warn(`Employee with ID ${this.selectedEmployeeId} not found in list of ${this.employees.length} employees`);
      console.log('Available employee IDs:', this.employees.map(e => e.id));
    }
    return employee;
  }

  ngOnInit(): void {
    if (!this.timesheetService.hasData()) {
      console.log('No timesheet data available, redirecting to upload page');
      this.router.navigate(['/upload']);
      return;
    }

    console.log('Timesheet viewer initializing');

    // Add global function for debugging from console
    (window as any).testCoworkerPopup = () => {
      this.testCoworkerPopup();
    };

    this.subscription = this.timesheetService.timesheetData$.subscribe(data => {
      if (data) {
        console.log('Received timesheet data:', data);
        this.employees = data.employees;

        console.log('Employees loaded:', this.employees.length);
        console.log('Employee details:', this.employees.map(e => `${e.id}: ${e.name} (${e.department})`));

        if (this.employees.length > 0) {
          // Set the selected employee to the first one in the list
          this.selectedEmployeeId = this.employees[0].id;
          console.log('Selected employee ID:', this.selectedEmployeeId, 'Type:', typeof this.selectedEmployeeId);

          // Use setTimeout to ensure the calendar is initialized
          setTimeout(() => {
            this.updateCalendar();

            // Show a brief tooltip about clicking shifts
            console.log('Adding click instruction tooltip');
            const calendarEl = this.calendarComponent?.getApi()?.el;
            if (calendarEl) {
              const instructionEl = document.createElement('div');
              instructionEl.className = 'click-instruction';
              instructionEl.textContent = 'Click on a shift to see coworkers';
              instructionEl.style.textAlign = 'center';
              instructionEl.style.padding = '5px';
              instructionEl.style.color = '#666';
              instructionEl.style.fontSize = '0.9rem';
              instructionEl.style.marginBottom = '10px';

              const headerEl = calendarEl.querySelector('.fc-header-toolbar');
              if (headerEl) {
                headerEl.parentNode?.insertBefore(instructionEl, headerEl.nextSibling);
              }
            }
          }, 200); // Increased timeout to ensure calendar is fully initialized
        } else {
          console.warn('No employees found in the data');
        }
      } else {
        console.log('No timesheet data in service, redirecting to upload page');
        this.router.navigate(['/upload']);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  onEmployeeChange(): void {
    console.log('Employee selection changed to ID:', this.selectedEmployeeId, 'Type:', typeof this.selectedEmployeeId);
    this.updateCalendar();
  }

  // Handle event click to show coworkers popup
  handleEventClick(clickInfo: EventClickArg): void {
    console.log('EVENT CLICK HANDLER TRIGGERED!', new Date().toISOString());

    // Prevent default action (like URL navigation)
    clickInfo.jsEvent.preventDefault();
    clickInfo.jsEvent.stopPropagation();

    // Log the entire event object to debug
    console.log('Clicked event object:', clickInfo.event);
    console.log('Event props:', clickInfo.event.extendedProps);
    console.log('DOM element:', clickInfo.el);

    // Add a visual indicator that the click was registered
    clickInfo.el.style.border = '2px solid yellow';
    setTimeout(() => {
      // Revert after a brief moment
      clickInfo.el.style.border = '';
    }, 500);

    // Get the event date and times
    const eventDate = clickInfo.event.start ? new Date(clickInfo.event.start) : null;
    const startTime = clickInfo.event.extendedProps['startTime'] as string | null;
    const endTime = clickInfo.event.extendedProps['endTime'] as string | null;
    const isOvernightShift = clickInfo.event.extendedProps['isOvernightShift'] as boolean;

    console.log('Event clicked:', {
      date: eventDate?.toDateString(),
      startTime,
      endTime,
      isOvernightShift
    });

    // Don't proceed if we don't have a selected employee or valid date
    if (!this.selectedEmployee || !eventDate) {
      console.warn('Cannot show coworkers: Missing employee or event date');
      return;
    }

    // Find coworkers who are also scheduled for this shift
    this.findCoworkersOnShift(eventDate, startTime, endTime, isOvernightShift);

    // Set popup data
    this.popupShiftDate = eventDate;
    this.popupShiftStart = startTime;
    this.popupShiftEnd = endTime;

    // Show the popup
    this.showCoworkersPopup = true;
  }

  // Find all coworkers who are working during the selected shift
  findCoworkersOnShift(date: Date, startTime: string | null, endTime: string | null, isOvernightShift: boolean): void {
    // Clear previous list
    this.coworkersOnShift = [];

    if (!this.selectedEmployee) {
      return;
    }

    // Standardize the date for comparison (keep only year, month, day)
    const shiftDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    console.log('Finding coworkers for shift on:', shiftDate.toDateString());

    // Helper function to check if two shifts overlap
    const shiftsOverlap = (
      shift1Date: Date, shift1Start: string | null, shift1End: string | null, shift1Overnight: boolean,
      shift2Date: Date, shift2Start: string | null, shift2End: string | null, shift2Overnight: boolean
    ): boolean => {
      // If either shift is missing critical info, we can't determine overlap
      if (!shift1Start || !shift1End || !shift2Start || !shift2End) {
        // Just check if they're on the same day
        return shift1Date.getTime() === shift2Date.getTime();
      }

      // Parse times to compare them
      const parseTime = (timeStr: string): number => {
        const parts = timeStr.split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0); // Convert to minutes
      };

      const s1Start = parseTime(shift1Start);
      const s1End = shift1Overnight ? parseTime(shift1End) + 24 * 60 : parseTime(shift1End);
      const s2Start = parseTime(shift2Start);
      const s2End = shift2Overnight ? parseTime(shift2End) + 24 * 60 : parseTime(shift2End);

      // Check if there's any overlap
      return !(s1End <= s2Start || s1Start >= s2End);
    };

    // Loop through all employees to find those working during this shift
    this.employees.forEach(employee => {
      // Skip the selected employee
      if (employee.id === this.selectedEmployeeId) {
        return;
      }

      // Look for any shift that overlaps with the selected shift
      const overlappingShift = employee.shifts.find(shift => {
        if (!shift.date) return false;

        // Standardize the date for comparison
        const shiftDateObj = new Date(shift.date);
        const employeeShiftDate = new Date(
          shiftDateObj.getFullYear(),
          shiftDateObj.getMonth(),
          shiftDateObj.getDate()
        );

        // For overnight shifts, we also need to check the next day
        if (isOvernightShift) {
          const nextDay = new Date(shiftDate);
          nextDay.setDate(nextDay.getDate() + 1);

          // Check if employee has a shift on either the start day or the end day
          if (employeeShiftDate.getTime() === shiftDate.getTime() ||
              employeeShiftDate.getTime() === nextDay.getTime()) {

            // Now check time overlap
            const isEmployeeOvernightShift = shift.startTime && shift.endTime ?
              this.parseTime(shift.startTime) > this.parseTime(shift.endTime) : false;

            return shiftsOverlap(
              shiftDate, startTime, endTime, isOvernightShift,
              employeeShiftDate, shift.startTime, shift.endTime, isEmployeeOvernightShift
            );
          }
          return false;
        } else {
          // For regular shifts, just check if it's the same day and times overlap
          if (employeeShiftDate.getTime() === shiftDate.getTime()) {
            const isEmployeeOvernightShift = shift.startTime && shift.endTime ?
              this.parseTime(shift.startTime) > this.parseTime(shift.endTime) : false;

            return shiftsOverlap(
              shiftDate, startTime, endTime, isOvernightShift,
              employeeShiftDate, shift.startTime, shift.endTime, isEmployeeOvernightShift
            );
          }
          return false;
        }
      });

      // If we found an overlapping shift, add this employee to our list
      if (overlappingShift) {
        this.coworkersOnShift.push({
          name: employee.name,
          department: employee.department,
          startTime: overlappingShift.startTime,
          endTime: overlappingShift.endTime
        });
      }
    });

    console.log(`Found ${this.coworkersOnShift.length} coworkers on shift`);
  }

  // Helper method to parse time
  parseTime(timeStr: string | null): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0); // Convert to minutes
  }

  // Close the coworkers popup
  closeCoworkersPopup(): void {
    this.showCoworkersPopup = false;
  }

  // Test function to show the popup with sample data
  testCoworkerPopup(): void {
    console.log('Testing coworker popup');
    this.showCoworkersPopup = true;
    this.popupShiftDate = new Date(2025, 5, 15); // June 15, 2025
    this.popupShiftStart = "09:00";
    this.popupShiftEnd = "17:00";
    this.coworkersOnShift = [
      { name: "Test Coworker 1", department: "Testing", startTime: "08:00", endTime: "16:00" },
      { name: "Test Coworker 2", department: "Development", startTime: "10:00", endTime: "18:00" }
    ];
    console.log('Popup should be visible now');
  }

  // Add direct click handlers to event elements as a backup
  private addDirectClickHandlers(): void {
    console.log('Adding direct click handlers to calendar events');

    // Give the DOM a moment to update
    setTimeout(() => {
      try {
        // Find all calendar events
        const calendarEl = this.calendarComponent?.getApi()?.el;
        if (!calendarEl) {
          console.warn('Calendar element not found');
          return;
        }

        const eventElements = calendarEl.querySelectorAll('.fc-event');
        console.log(`Found ${eventElements.length} event elements to add direct click handlers`);

        if (eventElements.length === 0) {
          console.warn('No calendar events found to attach handlers');

          // Try again later if no events were found
          setTimeout(() => this.addDirectClickHandlers(), 500);
          return;
        }

        // Add click handlers to each event
        eventElements.forEach((element, index) => {
          const el = element as HTMLElement;

          // Add a direct onclick attribute for maximum compatibility
          el.onclick = (e) => {
            console.log(`Direct onclick handler triggered for event ${index}`);
            e.preventDefault();
            e.stopPropagation();

            // Show visual feedback
            el.style.border = '2px solid green';
            setTimeout(() => el.style.border = '', 500);

            // Trigger popup directly
            this.showPopupForEventElement(el);

            return false;
          };

          // Enhance visual indication that these are clickable
          el.classList.add('clickable-event');
          el.style.cursor = 'pointer';

          // Add title attribute for better UX
          if (!el.title) {
            el.title = 'Click to see coworkers on this shift';
          }

          // Add click indicator
          const indicator = document.createElement('div');
          indicator.innerHTML = '👥';
          indicator.style.position = 'absolute';
          indicator.style.top = '2px';
          indicator.style.right = '2px';
          indicator.style.fontSize = '12px';
          indicator.style.zIndex = '1';
          el.appendChild(indicator);
        });

        console.log('Direct click handlers added successfully');
      } catch (error) {
        console.error('Error adding direct click handlers:', error);
      }
    }, 500);
  }

  // Show popup for a specific event element
  private showPopupForEventElement(eventElement: HTMLElement): void {
    console.log('Showing popup for event element', eventElement);

    // Find date from the parent cell
    const dateCell = eventElement.closest('.fc-daygrid-day');
    let eventDate: Date | null = null;

    if (dateCell) {
      const dateAttr = dateCell.getAttribute('data-date');
      if (dateAttr) {
        eventDate = new Date(dateAttr);
        console.log('Found date from cell:', dateAttr);
      }
    }

    if (!eventDate) {
      console.warn('Could not determine event date');
      return;
    }

    // Try to extract time information from the content
    let startTime: string | null = null;
    let endTime: string | null = null;

    // Look for time info in the element text
    const timePattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;
    const text = eventElement.textContent || '';
    const timeMatch = text.match(timePattern);

    if (timeMatch) {
      startTime = timeMatch[1];
      endTime = timeMatch[2];
      console.log('Extracted times from element:', startTime, endTime);
    }

    // Find coworkers for this date and time
    this.findCoworkersOnShift(eventDate, startTime, endTime, false);

    // Set popup data
    this.popupShiftDate = eventDate;
    this.popupShiftStart = startTime;
    this.popupShiftEnd = endTime;

    // Show the popup
    this.showCoworkersPopup = true;
    console.log('Popup should now be visible');
  }

  private updateCalendar(): void {
    if (this.selectedEmployeeId === null) {
      console.warn('No employee selected, cannot update calendar');
      return;
    }

    console.log('Trying to find employee with ID:', this.selectedEmployeeId, 'Type:', typeof this.selectedEmployeeId);
    console.log('Available employee IDs:', this.employees.map(e => ({ id: e.id, type: typeof e.id })));

    // Try to find by string comparison if IDs are getting converted to strings
    let employee = this.employees.find(e => e.id === this.selectedEmployeeId);

    if (!employee) {
      // Try again with type coercion (in case of string vs number issues)
      employee = this.employees.find(e => e.id == this.selectedEmployeeId);
      if (employee) {
        console.log('Found employee using loose equality (type coercion)');
      } else {
        console.error('Employee not found with ID:', this.selectedEmployeeId);

        // Add a placeholder event if employee not found
        if (this.calendarComponent && this.calendarComponent.getApi) {
          const calendarApi = this.calendarComponent.getApi();
          calendarApi.removeAllEvents();
          calendarApi.addEvent({
            title: 'No employee data found',
            date: new Date(),
            allDay: true,
            color: '#f44336', // Red for error
            extendedProps: {
              specialMarker: 'No employee data found'
            }
          });
          console.log('Added error event to calendar');
        }
        return;
      }
    }

      console.log('Updating calendar for employee:', employee.name, 'ID:', this.selectedEmployeeId);
      console.log('Employee shifts count:', employee.shifts.length);

      // Show a sample of shifts to debug issues
      const sampleShifts = employee.shifts.slice(0, 5);
      console.log('Sample shifts:', sampleShifts.map(s => ({
        date: s.date ? s.date.toDateString() : 'no date',
        startTime: s.startTime || 'none',
        endTime: s.endTime || 'none',
        hours: s.hours,
        hasSpecialMarkers: s.specialMarkers ? s.specialMarkers.length > 0 : false
      })));

      const events: EventInput[] = [];

      // Count shifts with time data to see if parsing is working
      const shiftsWithStartTime = employee.shifts.filter(s => s.startTime !== null).length;
      const shiftsWithEndTime = employee.shifts.filter(s => s.endTime !== null).length;
      const shiftsWithHours = employee.shifts.filter(s => s.hours !== null && s.hours > 0).length;

      console.log('Shifts data stats:', {
        withStartTime: shiftsWithStartTime,
        withEndTime: shiftsWithEndTime,
        withHours: shiftsWithHours,
        total: employee.shifts.length
      });

      // Verify that shifts have valid dates
      const shiftsWithDates = employee.shifts.map((shift, index) => {
        if (!shift) {
          console.warn(`Shift ${index} is null or undefined`);
          return {
            date: new Date(),
            startTime: null,
            endTime: null,
            hours: null,
            validDate: false
          };
        }

        // Debug the shift data
        console.log(`Shift ${index} data:`, {
          date: shift.date,
          dateType: shift.date ? typeof shift.date : 'undefined',
          startTime: shift.startTime,
          startTimeType: shift.startTime ? typeof shift.startTime : 'undefined',
          endTime: shift.endTime,
          endTimeType: shift.endTime ? typeof shift.endTime : 'undefined',
          hours: shift.hours,
          specialMarkers: shift.specialMarkers
        });

        // Make sure shift.date is a proper Date object
        let shiftDate: Date;

        if (shift.date instanceof Date) {
          shiftDate = shift.date;
        } else if (typeof shift.date === 'string') {
          // Parse ISO date string
          shiftDate = new Date(shift.date);
        } else {
          // This shouldn't happen but just in case
          console.warn(`Shift ${index} has invalid date format:`, shift.date);
          return { ...shift, validDate: false };
        }

        if (isNaN(shiftDate.getTime())) {
          console.warn(`Shift ${index} has invalid date:`, shift.date);
          return { ...shift, validDate: false };
        }

        // Safety check for string properties
        const safeShift = {
          ...shift,
          startTime: typeof shift.startTime === 'string' ? shift.startTime : null,
          endTime: typeof shift.endTime === 'string' ? shift.endTime : null,
          date: shiftDate,
          validDate: true
        };

        return safeShift;
      });

      // Filter shifts to include only those with actual data and valid dates
      const validShifts = shiftsWithDates.filter(shift =>
        shift.validDate && (shift.startTime || shift.endTime || shift.hours !== null)
      );

      console.log('Valid shifts for calendar:', validShifts.length);

      // Find first and last date with shifts for this employee (for calendar range)
      let firstShiftDate: Date | null = null;
      let lastShiftDate: Date | null = null;

      validShifts.forEach((shift, index) => {
        // We've already validated the date in the previous step
        const date = shift.date as Date;

        // Update first/last dates for calendar range
        if (!firstShiftDate || date < firstShiftDate) {
          firstShiftDate = new Date(date);
        }
        if (!lastShiftDate || date > lastShiftDate) {
          lastShiftDate = new Date(date);
        }

        console.log(`Processing shift on ${date.toDateString()}:`, shift);

        // Special markers like UW (day off) or SZ (training)
        const hasSpecialMarker = (time: any): boolean => {
          if (!time) return false;
          if (typeof time !== 'string') return false;
          return ['UW', 'SZ'].includes(time.toUpperCase());
        };

        const isUWMarker = (time: any): boolean => {
          if (!time) return false;
          if (typeof time !== 'string') return false;
          return time.toUpperCase() === 'UW';
        };

        const isSZMarker = (time: any): boolean => {
          if (!time) return false;
          if (typeof time !== 'string') return false;
          return time.toUpperCase() === 'SZ';
        };

        // No longer needed - using direct DOM element creation in eventContent

        try {
          // Check for special markers first (using the specialMarkers property if available)
          if (shift.specialMarkers && Array.isArray(shift.specialMarkers) && shift.specialMarkers.length > 0) {
            // Handle special markers based on their value
            if (shift.specialMarkers.includes('UW')) {
              // Create a title for tooltips
              const title = 'Day Off (UW)';

              events.push({
                title,
                date,
                allDay: true,
                color: '#9e9e9e', // Grey for day off
                extendedProps: {
                  specialMarker: 'Day Off (UW)',
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  hours: shift.hours
                }
              });
              console.log(`Added day off event on ${date.toDateString()}`);
              return; // Skip other processing for this day
            }

            if (shift.specialMarkers.includes('SZ')) {
              // Create a title for tooltips
              const title = 'Training (SZ)';

              events.push({
                title,
                date,
                allDay: true,
                color: '#ff9800', // Orange for training
                extendedProps: {
                  specialMarker: 'Training (SZ)',
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  hours: shift.hours
                }
              });
              console.log(`Added training event on ${date.toDateString()}`);
              return; // Skip other processing for this day
            }
          }
          // Fallback to checking the raw values if specialMarkers is not available
          else if (isUWMarker(shift.startTime) || isUWMarker(shift.endTime)) {
            events.push({
              title: 'Day Off (UW)',
              date,
              allDay: true,
              color: '#9e9e9e' // Grey for day off
            });
            console.log(`Added day off event on ${date.toDateString()}`);
            return; // Skip other processing for this day
          }
          else if (isSZMarker(shift.startTime) || isSZMarker(shift.endTime)) {
            events.push({
              title: 'Training (SZ)',
              date,
              allDay: true,
              color: '#ff9800' // Orange for training
            });
            console.log(`Added training event on ${date.toDateString()}`);
            return; // Skip other processing for this day
          }
        } catch (error) {
          console.error('Error processing special markers:', error);
          console.log('Problem shift data:', shift);
        }

        try {
          // Case 1: Shift with start and end time
          if (shift.startTime && shift.endTime &&
              typeof shift.startTime === 'string' && typeof shift.endTime === 'string' &&
              !hasSpecialMarker(shift.startTime) && !hasSpecialMarker(shift.endTime)) {
            try {
              // Parse time strings (handles both "07:00" and "7:00:00" formats)
              const startParts = shift.startTime.split(':').map(Number);
              const endParts = shift.endTime.split(':').map(Number);

              const start = new Date(date);
              start.setHours(startParts[0] || 0, startParts[1] || 0, 0);

              const end = new Date(date);
              end.setHours(endParts[0] || 0, endParts[1] || 0, 0);

              // Check if this is an overnight shift
              const isOvernightShift = end < start;

              // For overnight shifts, we'll create a special display approach
              if (isOvernightShift) {
                // Option 1: Create a single-day event that only shows on the start day
                events.push({
                  title: `${shift.startTime} - ${shift.endTime} (${shift.hours}h)`,
                  date: start, // Only on the start day
                  allDay: true, // Use all day to prevent stretching to next day
                  color: '#673ab7', // Purple for overnight shifts
                  extendedProps: {
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    hours: shift.hours,
                    isOvernightShift: true, // Mark this as an overnight shift
                    nextDay: new Date(date.getTime() + 24 * 60 * 60 * 1000).toDateString() // Next day info for display
                  }
                });

                console.log(`Added overnight shift event (single day): ${start.toLocaleString()} - Next day ${shift.endTime}`);
              } else {
                // For regular same-day shifts, use the standard approach
                events.push({
                  title: `${shift.startTime} - ${shift.endTime} (${shift.hours}h)`,
                  start,
                  end,
                  allDay: false,
                  color: '#3f51b5', // Blue for regular shifts
                  extendedProps: {
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    hours: shift.hours
                  }
                });

                console.log(`Added regular shift event: ${start.toLocaleString()} - ${end.toLocaleString()}`);
              }

              console.log(`Added timed event: ${start.toLocaleString()} - ${end.toLocaleString()}`);
                          } catch (e) {
              console.error('Error creating timed event:', e);

              // Fallback: create an all-day event if time parsing fails
              if (shift.hours) {
                events.push({
                  title: shift.hours ? `${shift.hours}h` : 'Shift',
                  date,
                  allDay: true,
                  color: '#009688', // Teal for hours-only
                  extendedProps: {
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    hours: shift.hours
                  }
                });
                console.log(`Added fallback all-day event: ${shift.hours}h`);
              }
                          }
                        }
                        // Case 2: Shift with hours only
                        else if (shift.hours !== null && shift.hours > 0) {
                          events.push({
                            title: `${shift.hours}h`,
                            date,
                            allDay: true,
                            color: '#3f51b5', // Blue for all shifts with time data
                            textColor: 'white',
                            extendedProps: {
                              startTime: shift.startTime,
                              endTime: shift.endTime,
                              hours: shift.hours
                            }
                          });
                          console.log(`Added all-day event: ${shift.hours}h`);
          }
          // Case 3: Just mark the day if we know there's some kind of shift
          else if ((shift.startTime && typeof shift.startTime === 'string' && !hasSpecialMarker(shift.startTime)) ||
                  (shift.endTime && typeof shift.endTime === 'string' && !hasSpecialMarker(shift.endTime))) {

            // Create a title for tooltips
            let title = 'Shift';
            if (shift.startTime && typeof shift.startTime === 'string' && !hasSpecialMarker(shift.startTime)) {
              title = `Start: ${shift.startTime}`;
            } else if (shift.endTime && typeof shift.endTime === 'string' && !hasSpecialMarker(shift.endTime)) {
              title = `End: ${shift.endTime}`;
            }

            events.push({
              title,
              date,
              allDay: true,
              color: '#ff9800', // Orange for partial info
              extendedProps: {
                startTime: shift.startTime,
                endTime: shift.endTime,
                hours: shift.hours
              }
            });
            console.log(`Added indicator event: ${title}`);
          }
        } catch (error) {
          console.error('Error processing shift event:', error);
          console.log('Problem shift data:', shift);

          // Add a generic shift event if we encounter an error
          events.push({
            title: 'Shift (error in details)',
            date,
            allDay: true,
            color: '#f44336', // Red for error
            extendedProps: {
              specialMarker: 'Error in details',
              startTime: shift.startTime,
              endTime: shift.endTime,
              hours: shift.hours
            }
          });
        }
      });

      console.log(`Created ${events.length} calendar events`);

      // Add a sample event if no events were created
      if (events.length === 0) {
        const today = new Date();
        events.push({
          title: 'No shift data available for this employee',
          date: today,
          allDay: true,
          color: '#f44336', // Red for no data
          extendedProps: {
            specialMarker: 'No shift data available for this employee'
          }
        });
        console.log('Added placeholder event because no valid events were created');
      }

      // Determine initial calendar date and visible date range
      let initialDate: Date;

      // June 2025 is the period from the example data
      const calendarYear = 2025;
      const calendarMonth = 5; // June (0-indexed)

      // Debug: Check how many days are in June 2025
      const startOfJune = new Date(calendarYear, calendarMonth, 1);
      const endOfJune = new Date(calendarYear, calendarMonth + 1, 0);
      console.log('June 2025 starts on:', startOfJune.toDateString());
      console.log('June 2025 ends on:', endOfJune.toDateString());
      console.log('June 2025 has', endOfJune.getDate(), 'days');

      // Create a date range that ensures all days of June are included
      // This shows June 1 to June 30, 2025 without cutting off any days
      const validRangeStart = new Date(calendarYear, calendarMonth, 1); // June 1
      const validRangeEnd = new Date(calendarYear, calendarMonth + 1, 1); // July 1 (exclusive)

      // If we have employee-specific dates, use those
      if (firstShiftDate) {
        initialDate = firstShiftDate;

        console.log('Using first shift date as initial date:', initialDate.toDateString());

        // Set calendar view to show the whole month
        this.calendarOptions = {
          ...this.calendarOptions,
          events,
          initialDate,
          // Use a proper date range that includes all of June
          validRange: {
            start: validRangeStart,
            end: validRangeEnd
          },
          // Fix the view to show exactly 30 days of June
          visibleRange: {
            start: validRangeStart,
            end: validRangeEnd
          },
          // Ensure these settings are maintained
          displayEventTime: false,
          // Direct binding of event click handler
          eventClick: (clickInfo) => {
            console.log('Event clicked via FullCalendar handler (updated)');
            this.handleEventClick(clickInfo);
          }
        };

        console.log(`Setting calendar to show ${initialDate.toDateString()}`);
        console.log(`Events count: ${events.length}`);
      } else {
        // Fallback to June 2025 if no employee-specific dates
        initialDate = new Date(calendarYear, calendarMonth, 1);

        this.calendarOptions = {
          ...this.calendarOptions,
          events,
          initialDate,
          // Use a proper date range that includes all of June
          validRange: {
            start: validRangeStart,
            end: validRangeEnd
          },
          // Fix the view to show exactly 30 days of June
          visibleRange: {
            start: validRangeStart,
            end: validRangeEnd
          },
          // Ensure these settings are maintained
          displayEventTime: false,
          // Direct binding of event click handler
          eventClick: (clickInfo) => {
            console.log('Event clicked via FullCalendar handler (updated)');
            this.handleEventClick(clickInfo);
          }
        };

        console.log(`Setting calendar to June 2025 - no employee shift dates found`);
        console.log(`Events count: ${events.length}`);
      }

      // Force calendar refresh after a short delay
      setTimeout(() => {
        if (this.calendarComponent && this.calendarComponent.getApi) {
          const calendarApi = this.calendarComponent.getApi();
          calendarApi.removeAllEvents();
          calendarApi.addEventSource(events);

          // Ensure we're showing the full month view
          calendarApi.changeView('dayGridMonth', initialDate);

          // Force the calendar to show the entire month
          const monthStart = new Date(calendarYear, calendarMonth, 1);
          calendarApi.gotoDate(monthStart);

          calendarApi.render();
          console.log('Calendar refreshed with', events.length, 'events');
          console.log('Calendar view set to full month starting:', monthStart.toDateString());

          // Add click handlers directly to event elements for better reliability
          this.addDirectClickHandlers();
        } else {
          console.warn('Calendar component API not available');
        }
      }, 100);
  }

  uploadNewFile(): void {
    this.timesheetService.clearData();
    this.router.navigate(['/upload']);
  }
}
