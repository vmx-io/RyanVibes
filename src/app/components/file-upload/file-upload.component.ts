import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExcelService } from '../../services/excel.service';
import { TimesheetService } from '../../services/timesheet.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.css']
})
export class FileUploadComponent {
  selectedFile: File | null = null;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private excelService: ExcelService,
    private timesheetService: TimesheetService,
    private router: Router
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.errorMessage = '';

      // Validate file type
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/csv'
      ];

      if (!validTypes.includes(this.selectedFile.type) &&
          !this.selectedFile.name.endsWith('.xlsx') &&
          !this.selectedFile.name.endsWith('.xls') &&
          !this.selectedFile.name.endsWith('.csv')) {
        this.errorMessage = 'Please select an Excel (.xlsx, .xls) or CSV (.csv) file.';
        this.selectedFile = null;
      }
    }
  }

  async uploadFile(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.selectedFile) {
      this.errorMessage = 'Please select a file first.';
      this.isLoading = false;
      return;
    }

    console.log('Processing file:', this.selectedFile.name, 'Size:', this.selectedFile.size, 'Type:', this.selectedFile.type);

    try {
      const timesheetData = await this.excelService.parseTimesheetFile(this.selectedFile);

      console.log('File processed successfully:', timesheetData);
      console.log('Employees found:', timesheetData.employees.length);

      if (timesheetData.dates.length > 0) {
        const startDate = timesheetData.dates[0].toLocaleDateString();
        const endDate = timesheetData.dates[timesheetData.dates.length - 1].toLocaleDateString();
        console.log(`Date range: ${startDate} to ${endDate} (${timesheetData.dates.length} days)`);
      }

      if (timesheetData.employees.length === 0) {
        throw new Error('No employee data could be extracted from the file. Please check the file format.');
      }

      this.timesheetService.setTimesheetData(timesheetData);
      this.successMessage = `File uploaded and processed successfully! Found ${timesheetData.employees.length} employees for ${timesheetData.dates.length} days.`;

      // Navigate to the timesheet viewer after a brief delay
      setTimeout(() => {
        this.router.navigate(['/timesheet']);
      }, 1500);
    } catch (error: any) {
      console.error('Error processing file:', error);
      this.errorMessage = error.message || 'Failed to process the file. Please check the format and try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
