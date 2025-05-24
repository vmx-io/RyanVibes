import { Injectable } from '@angular/core';
import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import { Employee, Shift, TimesheetData } from '../models/timesheet.model';

@Injectable({
  providedIn: 'root'
})
export class ExcelService {
  constructor() { }

  async parseTimesheetFile(file: File): Promise<TimesheetData> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = read(arrayBuffer, {
        type: 'array',
        cellDates: true,  // Parse dates as JavaScript Date objects
        cellNF: false,    // Don't preserve number formats
        cellText: false,  // Don't generate text versions
        raw: true        // Read raw values
      });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      console.log('Worksheet data:', worksheet);

      return this.processTimesheetData(worksheet, workbook);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error('Failed to parse the Excel file. Please check the file format.');
    }
  }

  private processTimesheetData(worksheet: WorkSheet, workbook: WorkBook): TimesheetData {
    // Convert the worksheet to JSON with raw values
    const jsonData = utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true  // Get raw values
    }) as any[][];

    console.log('JSON Data:', jsonData);

    if (!jsonData || jsonData.length < 4) {
      throw new Error('Invalid timesheet format. The file does not contain enough data.');
    }

    // Extract month and year from the title in cell C1 or from sheet name
    let year = new Date().getFullYear();
    let month = new Date().getMonth();

    // Try to extract from header first
    if (jsonData[0] && jsonData[0][10]) {
      const headerText = String(jsonData[0][10] || '');
      console.log('Header text:', headerText);

      // Look for "CZERWIEC'25" pattern
      const monthYearMatch = headerText.match(/([A-Za-z]+)'?(\d{2})/);
      if (monthYearMatch) {
        const monthName = monthYearMatch[1].toUpperCase();
        const shortYear = parseInt(monthYearMatch[2]);

        // Convert short year to full year (assuming 20xx for years less than 80)
        year = shortYear < 80 ? 2000 + shortYear : 1900 + shortYear;

        // Map Polish month names to month index (0-11)
        const polishMonths: {[key: string]: number} = {
          'STYCZEN': 0, 'STYCZEŃ': 0,
          'LUTY': 1,
          'MARZEC': 2,
          'KWIECIEN': 3, 'KWIECIEŃ': 3,
          'MAJ': 4,
          'CZERWIEC': 5,
          'LIPIEC': 6,
          'SIERPIEN': 7, 'SIERPIEŃ': 7,
          'WRZESIEN': 8, 'WRZESIEŃ': 8,
          'PAZDZIERNIK': 9, 'PAŹDZIERNIK': 9,
          'LISTOPAD': 10,
          'GRUDZIEN': 11, 'GRUDZIEŃ': 11
        };

        if (polishMonths[monthName] !== undefined) {
          month = polishMonths[monthName];
        }
      }
    }

    // Fallback to sheet name if header extraction failed
    if (month === new Date().getMonth() && year === new Date().getFullYear()) {
      const sheetName = workbook.SheetNames[0];
      const monthYearMatch = sheetName.match(/([A-Za-z]+)'?(\d{2})/);
      if (monthYearMatch) {
        const monthName = monthYearMatch[1].toUpperCase();
        const shortYear = parseInt(monthYearMatch[2]);

        // Convert short year to full year
        year = shortYear < 80 ? 2000 + shortYear : 1900 + shortYear;

        // Polish month names
        const polishMonths: {[key: string]: number} = {
          'STYCZEN': 0, 'STYCZEŃ': 0,
          'LUTY': 1,
          'MARZEC': 2,
          'KWIECIEN': 3, 'KWIECIEŃ': 3,
          'MAJ': 4,
          'CZERWIEC': 5,
          'LIPIEC': 6,
          'SIERPIEN': 7, 'SIERPIEŃ': 7,
          'WRZESIEN': 8, 'WRZESIEŃ': 8,
          'PAZDZIERNIK': 9, 'PAŹDZIERNIK': 9,
          'LISTOPAD': 10,
          'GRUDZIEN': 11, 'GRUDZIEŃ': 11
        };

        if (polishMonths[monthName] !== undefined) {
          month = polishMonths[monthName];
        }
      }
    }

    console.log(`Detected timesheet period: ${month + 1}/${year}`);

    // Extract day numbers from row 3 (index 2)
    const dayNumberRow = jsonData[2] as any[];
    console.log('Day number row:', dayNumberRow);

    const dates: Date[] = [];

    // Start from index 3 (column D) to skip empty columns
    for (let i = 3; i < dayNumberRow.length - 1; i++) { // Skip the last column (total)
      if (dayNumberRow[i] !== null && dayNumberRow[i] !== undefined) {
        let day: number;

        // Extract day number
        if (typeof dayNumberRow[i] === 'number') {
          day = dayNumberRow[i];
        } else if (typeof dayNumberRow[i] === 'string') {
          // Try to extract day number from string
          const dayMatch = String(dayNumberRow[i]).match(/\d+/);
          day = dayMatch ? parseInt(dayMatch[0]) : i - 2;
        } else {
          day = i - 2; // Fallback: use column index as day
        }

        // Create date using detected year and month
        const date = new Date(year, month, day);
        dates.push(date);
        console.log(`Date at index ${i}:`, date.toISOString().split('T')[0], `(Day: ${day})`);
      } else {
        // For missing dates, try to infer from column position
        const day = i - 2; // Approximate day number based on position
        const date = new Date(year, month, day);
        dates.push(date);
      }
    }

    const employees: Employee[] = [];

    // Process employee data - starts at row 4 (index 3), repeating every 3 rows
    for (let row = 3; row < jsonData.length; row += 3) {
      // Skip if we don't have enough rows left for a complete employee record
      if (row + 2 >= jsonData.length) {
        break;
      }

      console.log(`Processing employee row ${row}:`, jsonData[row]);

      // Check if row is empty or non-array
      if (!jsonData[row] || !Array.isArray(jsonData[row]) || jsonData[row].every(cell => cell === null)) {
        console.log(`Skipping row ${row} - empty row or not an array`);
        continue;
      }

      const nameRow = jsonData[row] as any[];

      // Skip if row is too short or has no content
      if (!nameRow || nameRow.length < 3) {
        console.log(`Skipping row ${row} - not enough data`);
        continue;
      }

      // Get employee ID from column A
      const employeeId = nameRow[0];

      // Check if this is a valid employee ID (should be a number or string that can be converted to number)
      if (employeeId === null || employeeId === undefined ||
          (typeof employeeId === 'string' && (employeeId.trim() === '' || isNaN(Number(employeeId))))) {
        console.log(`Skipping row ${row} - no valid employee ID found`);
        continue;
      }

      // Get the employee name from column C (index 2)
      const name = nameRow[2];

      // Get department code from column B (index 1)
      const department = nameRow[1] || '';

      if (!name || (typeof name === 'string' && name.trim() === '')) {
        console.log(`Skipping row ${row} - no employee name found`);
        continue;
      }

      // Start time row is the next row (row + 1)
      const startTimesRow = row + 1 < jsonData.length ? jsonData[row + 1] as any[] : [];

      // Hours row is two rows down (row + 2)
      const hoursRow = row + 2 < jsonData.length ? jsonData[row + 2] as any[] : [];

      console.log(`Employee ${name} - ID: ${employeeId}, Department: ${department}`);
      console.log(`Employee ${name} - Row structure:`, {
        nameRow: nameRow.slice(0, 10), // Show first 10 elements only to keep logs manageable
        startTimesRow: startTimesRow.slice(0, 10),
        hoursRow: hoursRow.slice(0, 10)
      });

      // Debug actual data layout to understand structure
      console.log(`Employee ${name} - Data samples for day 1:`, {
        column3: {
          nameRow: nameRow[3],
          startTimesRow: startTimesRow[3],
          hoursRow: hoursRow[3]
        },
        column4: {
          nameRow: nameRow[4],
          startTimesRow: startTimesRow[4],
          hoursRow: hoursRow[4]
        }
      });

      // Ensure employee ID is a proper number
      let id: number;
      if (typeof employeeId === 'number') {
        id = employeeId;
      } else if (typeof employeeId === 'string' && !isNaN(Number(employeeId))) {
        // Direct conversion if it's a numeric string
        id = Number(employeeId);
      } else {
        // Remove non-digits and parse, or use row index as fallback
        const parsed = parseInt(String(employeeId).replace(/\D/g, ''));
        id = !isNaN(parsed) ? parsed : Math.floor((row - 3) / 3) + 1;
      }

      console.log(`Employee ID converted: ${employeeId} → ${id}`);

      const shifts: Shift[] = [];
      let totalHours = 0;

      // Determine the actual structure of the data by examining column headers
      let startTimeInFirstRow = true;
      let endTimeInSecondRow = true;

      // Look for headers that might indicate which row contains what
      const firstRowHeaders = nameRow.slice(0, 3).map(h =>
        typeof h === 'string' ? h.toLowerCase() : '');
      const secondRowHeaders = startTimesRow.slice(0, 3).map(h =>
        typeof h === 'string' ? h.toLowerCase() : '');

      // Check if there are clues in the headers
      const startTimeKeywords = ['start', 'begin', 'from', 'od', 'rozpoczęcie'];
      const endTimeKeywords = ['end', 'finish', 'to', 'do', 'zakończenie'];

      // If first row has end time keywords and second row has start time keywords, swap them
      const firstRowHasEndTimeKeywords = firstRowHeaders.some(h =>
        endTimeKeywords.some(keyword => h.includes(keyword)));
      const secondRowHasStartTimeKeywords = secondRowHeaders.some(h =>
        startTimeKeywords.some(keyword => h.includes(keyword)));

      if (firstRowHasEndTimeKeywords && secondRowHasStartTimeKeywords) {
        // Swap our understanding of which row contains what
        startTimeInFirstRow = false;
        endTimeInSecondRow = false;
        console.log(`Employee ${name}: Detected reversed time rows (first=end, second=start)`);
      }

      // Look at the actual data - try to determine format from the data itself
      let startTimeSamples = [];
      let endTimeSamples = [];
      for (let i = 3; i < Math.min(nameRow.length, 10); i++) {
        if (nameRow[i] !== null && nameRow[i] !== undefined) startTimeSamples.push(nameRow[i]);
        if (startTimesRow[i] !== null && startTimesRow[i] !== undefined) endTimeSamples.push(startTimesRow[i]);
      }

      console.log(`Employee ${name} - Time format detection:`, {
        firstRowSamples: startTimeSamples,
        secondRowSamples: endTimeSamples
      });

      // Process each day's shifts
      for (let i = 0; i < dates.length; i++) {
        const dataIndex = i + 3; // Start from column D (index 3)

        // Get shift data for this day based on our detected structure
        let startTime = null;
        let endTime = null;

        // Extract times based on the detected row structure
        if (startTimeInFirstRow) {
          // Normal case: first row = start time, second row = end time
          if (dataIndex < nameRow.length && nameRow[dataIndex] !== null && nameRow[dataIndex] !== undefined) {
            startTime = nameRow[dataIndex];
            console.log(`Found start time for ${name} on day ${i+1}:`, startTime);
          }

          if (dataIndex < startTimesRow.length && startTimesRow[dataIndex] !== null && startTimesRow[dataIndex] !== undefined) {
            endTime = startTimesRow[dataIndex];
            console.log(`Found end time for ${name} on day ${i+1}:`, endTime);
          }
        } else {
          // Reversed case: first row = end time, second row = start time
          if (dataIndex < nameRow.length && nameRow[dataIndex] !== null && nameRow[dataIndex] !== undefined) {
            endTime = nameRow[dataIndex];
            console.log(`Found end time for ${name} on day ${i+1}:`, endTime);
          }

          if (dataIndex < startTimesRow.length && startTimesRow[dataIndex] !== null && startTimesRow[dataIndex] !== undefined) {
            startTime = startTimesRow[dataIndex];
            console.log(`Found start time for ${name} on day ${i+1}:`, startTime);
          }
        }

        // Look at hours to see if we need to infer any missing times
        let hasHours = false;
        if (dataIndex < hoursRow.length && hoursRow[dataIndex] !== null && hoursRow[dataIndex] !== undefined &&
            (typeof hoursRow[dataIndex] === 'number' ||
             (typeof hoursRow[dataIndex] === 'string' && !isNaN(parseFloat(hoursRow[dataIndex]))))) {
          hasHours = true;
        }

        // Add some heuristics - if we have hours but no times, try standard times
        if (hasHours && startTime === null && endTime === null) {
          // If we have hours but no times, assume standard 9-5 shift
          startTime = "9:00";
          endTime = "17:00";
          console.log(`Inferring standard times for ${name} on day ${i+1} based on hours presence`);
        }

        // Check for special values in the start/end times
        const isSpecialValue = (value: any): boolean => {
          if (!value) return false;

          // For Date objects, never consider them special values
          if (value instanceof Date) return false;

          // Convert to string if it's not already
          let strValue: string;
          if (typeof value !== 'string') {
            try {
              strValue = String(value);
            } catch (error) {
              console.error('Error converting value to string:', error);
              return false;
            }
          } else {
            strValue = value;
          }

          try {
            const upper = strValue.toUpperCase();
            // UW = Day off, SZ = Training, etc.
            return ['UW', 'SZ'].includes(upper);
          } catch (error) {
            console.error('Error in isSpecialValue:', error, 'value:', value, 'type:', typeof value);
            return false;
          }
        };

        // Track special markers
        const specialMarkers: string[] = [];

        // Helper to safely extract special marker text
        const extractSpecialMarker = (value: any): string | null => {
          if (!value) return null;

          // Skip Date objects
          if (value instanceof Date) return null;

          // Convert to string if needed
          let strValue: string;
          if (typeof value !== 'string') {
            try {
              strValue = String(value);
            } catch (e) {
              return null;
            }
          } else {
            strValue = value;
          }

          // Check if it's a special marker
          try {
            const upper = strValue.toUpperCase();
            if (['UW', 'SZ'].includes(upper)) {
              return upper;
            }
          } catch (e) {
            return null;
          }

          return null;
        };

        // Extract special markers before clearing them
        try {
          const startMarker = extractSpecialMarker(startTime);
          const endMarker = extractSpecialMarker(endTime);

          if (startMarker) specialMarkers.push(startMarker);
          if (endMarker) specialMarkers.push(endMarker);
        } catch (error) {
          console.error('Error extracting special markers:', error);
          console.log('startTime:', startTime, 'type:', typeof startTime);
          console.log('endTime:', endTime, 'type:', typeof endTime);
        }

        // Handle special values in the raw data fields
        if (isSpecialValue(startTime) || isSpecialValue(endTime)) {
          // Keep the original values but handle them specially in the calendar display
          // startTime and endTime will keep their special values
        }

        // Get hours from the hours row (third row)
        let hours: number | null = null;

        if (dataIndex < hoursRow.length && hoursRow[dataIndex] !== null && hoursRow[dataIndex] !== undefined) {
          if (typeof hoursRow[dataIndex] === 'number') {
            // Direct hours value
            hours = hoursRow[dataIndex];
            if (hours > 0) {
              totalHours += hours;
              console.log(`Direct hours for ${name} on day ${i+1}: ${hours}`);
            }
          } else if (typeof hoursRow[dataIndex] === 'string') {
            // Check if the hours row also contains a special marker
            if (isSpecialValue(hoursRow[dataIndex])) {
              specialMarkers.push(hoursRow[dataIndex].toUpperCase());
              hours = null;
            }
            // Try to parse string as number if it's not a special value
            else if (!isNaN(parseFloat(hoursRow[dataIndex]))) {
              hours = parseFloat(hoursRow[dataIndex]);
              if (hours > 0) {
                totalHours += hours;
                console.log(`Direct hours (string) for ${name} on day ${i+1}: ${hours}`);
              }
            } else {
              // Unparseable
              hours = null;
            }
          }
        }

        // If hours not found directly but we have start and end times, calculate
        if (hours === null && startTime && endTime &&
            typeof startTime === 'string' && typeof endTime === 'string' &&
            !isSpecialValue(startTime) && !isSpecialValue(endTime)) {
          try {
            // Parse time strings like "07:00", "7:00", or "7:00:00"
            const startParts = startTime.split(':').map(Number);
            const endParts = endTime.split(':').map(Number);

            if (!isNaN(startParts[0]) && !isNaN(endParts[0])) {
              // Calculate minutes for each time
              const startMinutes = startParts[0] * 60 + (startParts[1] || 0);
              const endMinutes = endParts[0] * 60 + (endParts[1] || 0);

              // Calculate hours, accounting for overnight shifts
              hours = (endMinutes - startMinutes) / 60;
              if (hours < 0) {
                hours += 24; // Overnight shift
              }

              // Round to 2 decimal places for readability
              hours = Math.round(hours * 100) / 100;

              if (hours > 0) {
                totalHours += hours;
                console.log(`Calculated hours for ${name} on day ${i+1}: ${hours} (${startTime} - ${endTime})`);
              }
            }
          } catch (e) {
            console.error(`Error calculating hours from ${startTime} - ${endTime}:`, e);
          }
        }

        // Ensure we have a valid date object (this prevents issues with date serialization)
        let shiftDate: Date;
        if (dates[i] instanceof Date) {
          // Clone the date to avoid reference issues
          shiftDate = new Date(dates[i]);
        } else {
          // If it's somehow not a Date, try to create one
          console.warn(`Date at index ${i} is not a Date object:`, dates[i]);
          if (typeof dates[i] === 'string') {
            shiftDate = new Date(dates[i]);
          } else {
            // Fallback to creating a date for this day in the current month/year
            shiftDate = new Date(year, month, i + 1);
          }
        }

        // Verify that the date is valid
        if (isNaN(shiftDate.getTime())) {
          console.error(`Created invalid date for day ${i+1}:`, shiftDate);
          // Fallback to creating a date for this day in the current month/year
          shiftDate = new Date(year, month, i + 1);
        }

        // Function to format a time value to a string regardless of its type
        const formatTimeValue = (value: any): string | null => {
          if (value === null || value === undefined) return null;

          // If it's a string, just clean it
          if (typeof value === 'string') {
            return value.trim() === '' ? null : value.trim();
          }

          // If it's a number, format as "hour:minute"
          if (typeof value === 'number') {
            const hours = Math.floor(value);
            const minutes = Math.round((value - hours) * 60);
            return `${hours}:${minutes.toString().padStart(2, '0')}`;
          }

          // If it's a Date object, extract the time part
          if (value instanceof Date) {
            const hours = value.getHours();
            const minutes = value.getMinutes();
            return `${hours}:${minutes.toString().padStart(2, '0')}`;
          }

          // Try to convert to string as a last resort
          try {
            const str = String(value).trim();
            return str === '' ? null : str;
          } catch (e) {
            console.error('Failed to format time value:', value);
            return null;
          }
        };

        // Ensure start time and end time are proper strings or null
        let cleanStartTime = formatTimeValue(startTime);
        let cleanEndTime = formatTimeValue(endTime);

        console.log(`Adding shift for ${name} on ${shiftDate.toISOString()}:`, {
          startTime: cleanStartTime,
          endTime: cleanEndTime,
          originalStartTime: startTime,
          originalEndTime: endTime,
          originalStartTimeType: startTime !== null ? typeof startTime : 'null',
          originalEndTimeType: endTime !== null ? typeof endTime : 'null',
          originalStartTimeIsDate: startTime instanceof Date,
          originalEndTimeIsDate: endTime instanceof Date,
          hours,
          specialMarkers
        });

        shifts.push({
          date: shiftDate,
          startTime: cleanStartTime, // Properly formatted string or null
          endTime: cleanEndTime,     // Properly formatted string or null
          hours,
          specialMarkers: specialMarkers.length > 0 ? specialMarkers : undefined
        });
      }

      // Check if the total hours are already provided in the last column
      const lastColumnIndex = hoursRow.length - 1;
      if (hoursRow[lastColumnIndex] !== null && hoursRow[lastColumnIndex] !== undefined) {
        // Extract total hours from the last column
        let providedTotal: number | null = null;

        if (typeof hoursRow[lastColumnIndex] === 'number') {
          providedTotal = hoursRow[lastColumnIndex];
        } else if (typeof hoursRow[lastColumnIndex] === 'string') {
          // Parse string value, e.g., "164.00"
          const match = String(hoursRow[lastColumnIndex]).match(/(\d+(?:\.\d+)?)/);
          if (match) {
            providedTotal = parseFloat(match[1]);
          }
        }

        if (providedTotal !== null && !isNaN(providedTotal) && providedTotal > 0) {
          // Use the provided total if available and valid
          totalHours = providedTotal;
          console.log(`Using provided total hours for ${name}: ${totalHours}`);
        }
      }

      // Round total hours to 2 decimal places
      totalHours = Math.round(totalHours * 100) / 100;

      // Filter out completely empty shifts (no start time, no end time, no hours)
      const validShifts = shifts.filter(shift =>
        (shift.startTime !== null) ||
        (shift.endTime !== null) ||
        (shift.hours !== null && shift.hours > 0) ||
        (shift.specialMarkers !== undefined && shift.specialMarkers.length > 0)
      );

      console.log(`Employee ${name}: Filtered ${shifts.length - validShifts.length} empty shifts, keeping ${validShifts.length}`);

      // Calculate stats on valid shifts
      const shiftsWithStartTime = validShifts.filter(s => s.startTime !== null).length;
      const shiftsWithEndTime = validShifts.filter(s => s.endTime !== null).length;
      const shiftsWithHours = validShifts.filter(s => s.hours !== null && s.hours > 0).length;

      console.log(`Employee ${name} - Shift data stats:`, {
        withStartTime: shiftsWithStartTime,
        withEndTime: shiftsWithEndTime,
        withHours: shiftsWithHours,
        total: validShifts.length
      });

      employees.push({
        id,
        name: String(name || 'Unknown Employee').trim(),
        department: String(department || 'Unknown').trim(),
        shifts: validShifts,
        totalHours
      });

      console.log(`Added employee: ${name}, Department: ${department}, Total Hours: ${totalHours}`);
    }

    console.log(`Processed ${employees.length} employees`);

    if (employees.length === 0) {
      // Add a sample employee if none were found
      employees.push({
        id: 1,
        name: 'Sample Employee',
        department: 'Demo Department',
        shifts: dates.map(date => ({
          date,
          startTime: '09:00',
          endTime: '17:00',
          hours: 8
        })),
        totalHours: 8 * dates.length
      });
      console.log('Added sample employee because none were parsed from the file');
    }

    return {
      employees,
      dates
    };
  }
}
