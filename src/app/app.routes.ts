import { Routes } from '@angular/router';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { TimesheetViewerComponent } from './components/timesheet-viewer/timesheet-viewer.component';

export const routes: Routes = [
  { path: '', redirectTo: '/upload', pathMatch: 'full' },
  { path: 'upload', component: FileUploadComponent },
  { path: 'timesheet', component: TimesheetViewerComponent },
  { path: '**', redirectTo: '/upload' }
];
