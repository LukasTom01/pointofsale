// Modul Tým: úkoly a docházka brigádníků (viz docs/tym.md).
// Lidé jsou existující „Lidé“ (StaffMember); modul k nim přidává kontakt
// a osobní tajný odkaz. Časy směn jsou minuty dne v české zóně.

export interface TeamProfile {
  staffId: string;
  phone: string | null;
  note: string | null;
  /** Tajná část osobního odkazu /muj/<token>; null = odkaz zatím není. */
  token: string | null;
}

export interface TeamEvent {
  id: string;
  name: string;
  dateFrom: string | null; // "YYYY-MM-DD"
  dateTo: string | null;
  createdAt: string;
}

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  note: string | null;
  status: TaskStatus;
  dueDate: string | null;
  eventId: string | null;
  assigneeIds: string[]; // staff ids
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftRole {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
}

export type Attendance = "planned" | "present" | "absent";

export interface Shift {
  id: string;
  staffId: string;
  eventId: string | null;
  roleId: string | null;
  day: string; // "YYYY-MM-DD"
  startMin: number;
  endMin: number;
  note: string | null;
  attendance: Attendance;
  checkInAt: string | null; // ISO
  checkOutAt: string | null; // ISO
  createdAt: string;
}

export type NewShift = Omit<Shift, "id" | "createdAt" | "attendance" | "checkInAt" | "checkOutAt">;
