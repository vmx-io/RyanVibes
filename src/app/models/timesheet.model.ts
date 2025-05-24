export interface Employee {
  id: number;
  name: string;
  department: string;
  shifts: Shift[];
  totalHours: number;
}

export interface Shift {
  date: Date;
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  specialMarkers?: string[]; // For special values like "UW" (day off) or "SZ" (training)
}

export interface TimesheetData {
  employees: Employee[];
  dates: Date[];
  periodName?: string; // E.g., "CZERWIEC'25"
}
