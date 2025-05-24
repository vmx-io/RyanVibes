import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TimesheetData, Employee } from '../models/timesheet.model';

@Injectable({
  providedIn: 'root'
})
export class TimesheetService {
  private timesheetDataSubject = new BehaviorSubject<TimesheetData | null>(null);
  timesheetData$ = this.timesheetDataSubject.asObservable();

  constructor() { }

  setTimesheetData(data: TimesheetData): void {
    this.timesheetDataSubject.next(data);
  }

  getTimesheetData(): TimesheetData | null {
    return this.timesheetDataSubject.value;
  }

  getEmployees(): Employee[] {
    return this.timesheetDataSubject.value?.employees || [];
  }

  getEmployeeById(id: number): Employee | undefined {
    const employee = this.getEmployees().find(employee => employee.id === id);
    if (!employee) {
      // Try loose equality in case of type mismatch
      const employeeLooseMatch = this.getEmployees().find(employee => employee.id == id);
      if (employeeLooseMatch) {
        console.warn(`Employee with ID ${id} found using loose equality. ID types don't match.`);
        console.log(`Search ID: ${id} (${typeof id}), Employee ID: ${employeeLooseMatch.id} (${typeof employeeLooseMatch.id})`);
      }
      return employeeLooseMatch;
    }
    return employee;
  }

  hasData(): boolean {
    return !!this.timesheetDataSubject.value;
  }

  clearData(): void {
    this.timesheetDataSubject.next(null);
  }
}
