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

/** review = splněno, čeká na kontrolu vedoucím. */
export type TaskStatus = "todo" | "doing" | "review" | "done";

/** each = musí odškrtnout každý přiřazený; any = stačí jeden za všechny. */
export type TaskCompletion = "each" | "any";

export interface ChecklistItem {
  id: string;
  text: string;
  doneBy: string | null; // staff id; "admin" = vedoucí
  doneAt: string | null;
}

/** Nahlášený problém – trvá, dokud ho vedoucí nevyřeší. */
export interface TaskProblem {
  staffId: string;
  reason: string;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  note: string | null;
  status: TaskStatus;
  dueDate: string | null;
  /** Čas termínu v minutách dne (česká zóna); null = kdykoli během dne. */
  dueTime: number | null;
  eventId: string | null;
  assigneeIds: string[]; // staff ids
  completion: TaskCompletion;
  /** Kdo už svou část odškrtl (u `any` ten, kdo uzavřel). */
  doneBy: string[];
  requiresPhoto: boolean;
  requiresReview: boolean;
  /** Připomenout X minut před termínem; null = nepřipomínat. */
  remindMin: number | null;
  checklist: ChecklistItem[];
  problem: TaskProblem | null;
  /** Komentář vedoucího při vrácení z kontroly / vyřešení problému. */
  adminNote: string | null;
  /** Úkol vygenerovaný z úkolu pozice pro konkrétní směnu. */
  shiftId: string | null;
  templateId: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewTask = Pick<Task, "title" | "note" | "dueDate" | "dueTime" | "eventId" | "assigneeIds"> &
  Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>;

export type TaskLogKind =
  | "created"
  | "edited"
  | "done"
  | "undone"
  | "review"
  | "approved"
  | "returned"
  | "problem"
  | "resolved"
  | "photo"
  | "check"
  | "uncheck"
  | "copied";

/** Historie úkolu. staffId null = vedoucí (administrace). */
export interface TaskLogEntry {
  id: string;
  taskId: string;
  staffId: string | null;
  kind: TaskLogKind;
  text: string | null;
  createdAt: string;
}

/** Úkol pozice: vytvoří se automaticky každému, kdo má směnu s touto pozicí. */
export interface RoleTask {
  id: string;
  roleId: string;
  title: string;
  note: string | null;
  checklist: string[];
  /** Vůči čemu se počítá termín: začátek, nebo konec směny. */
  anchor: "start" | "end";
  /** Posun v minutách (záporný = před). */
  offsetMin: number;
  requiresPhoto: boolean;
  requiresReview: boolean;
  remindMin: number | null;
  sortOrder: number;
  createdAt: string;
}

/** Odběr push notifikací jednoho zařízení. staffId null = vedoucí. */
export interface PushSub {
  endpoint: string;
  staffId: string | null;
  p256dh: string;
  auth: string;
  createdAt: string;
}

/** Příloha úkolu (metadata; obsah se načítá zvlášť). */
export interface TaskAttachment {
  id: string;
  taskId: string;
  name: string;
  mime: string;
  size: number; // bajty
  /** Kdo nahrál: staff id brigádníka (fotka jako důkaz), null = vedoucí. */
  staffId: string | null;
  createdAt: string;
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
