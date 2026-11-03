import { AuditReportRecord, ShiftInfo, LocationOption, SectionDef, IssueReport } from '../types';
import { getStoredUsers } from './userStorage';

const STORAGE_KEY = 'bunk_hostel_audit_reports_v2';
// Earlier builds seeded demo audit reports; drop that store on upgrade.
if (typeof window !== 'undefined') {
  try { localStorage.removeItem('bunk_hostel_audit_reports_v1'); } catch { /* storage unavailable */ }
}

/** Reports only ever come from real staff submissions; a clean install starts empty. */
export function getStoredAuditReports(): AuditReportRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load audit reports from localStorage', err);
    return [];
  }
}

export function saveAuditReports(reports: AuditReportRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    console.error('Failed to save audit reports to localStorage', err);
  }
}

export function createAuditReportFromStaffSubmission(
  shiftInfo: ShiftInfo,
  location: LocationOption | null,
  section: SectionDef | null,
  report: IssueReport
): AuditReportRecord {
  const now = new Date();
  const reportId = `RPT-${now.getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const tasks = section?.tasks?.map((t) => ({
    id: t.id,
    titleEn: t.titleEn,
    titleHi: t.titleHi,
    tag: t.category || t.subCategoryEn || 'Task',
    completed: t.completed,
    adminVerification: 'unverified' as const,
  })) || [];

  // Link the submission to a real account rather than inventing a staff ID.
  const staffRecord = getStoredUsers().find(
    (u) => u.name.trim().toLowerCase() === shiftInfo.checkedBy.trim().toLowerCase()
  );

  const newRecord: AuditReportRecord = {
    id: reportId,
    submittedAt: now.toISOString(),
    date: shiftInfo.date,
    time: timeFormatted,
    locationId: location?.id || 'general',
    locationName: location?.nameEn || shiftInfo.roomArea,
    locationNameHi: location?.nameHi,
    formName: location?.formNameEn || 'Housekeeping',
    staffName: shiftInfo.checkedBy,
    staffId: staffRecord?.id || 'UNASSIGNED',
    shiftTiming: shiftInfo.shiftTiming,
    status: 'Pending',
    responseType: section?.responseType || 'Cleaned',
    photoUpload: section?.photoUpload,
    tasks,
    section10: {
      issuesIdentified: report.issuesIdentified,
      correctiveAction: report.correctiveAction,
      actionTakenBy: report.actionTakenBy,
      status: report.status,
      finalRemarks: report.finalRemarks,
    },
    adminNotes: '',
  };

  const existing = getStoredAuditReports();
  const updated = [newRecord, ...existing];
  saveAuditReports(updated);
  return newRecord;
}
