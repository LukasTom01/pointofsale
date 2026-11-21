import type {
  NewShift,
  NewTask,
  PushSub,
  RoleTask,
  Shift,
  ShiftRole,
  Task,
  TaskAttachment,
  TaskLogEntry,
  TeamEvent,
  TeamProfile,
} from "./types";

// Společné rozhraní úložišť modulu Tým (Postgres i soubor).
export interface TeamStore {
  listProfiles(): Promise<TeamProfile[]>;
  profileByToken(token: string): Promise<TeamProfile | null>;
  saveProfile(profile: TeamProfile): Promise<TeamProfile>;

  listEvents(): Promise<TeamEvent[]>;
  saveEvent(input: { id?: string; name: string; dateFrom: string | null; dateTo: string | null }): Promise<TeamEvent | null>;
  deleteEvent(eventId: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(task: Task): Promise<Task | null>;
  /** Smaže úkol i jeho přílohy a historii. */
  deleteTask(taskId: string): Promise<void>;

  /** Metadata všech příloh (bez obsahu). */
  listAttachments(): Promise<TaskAttachment[]>;
  getAttachment(id: string): Promise<{ meta: TaskAttachment; data: Buffer } | null>;
  addAttachment(input: Omit<TaskAttachment, "id" | "createdAt">, data: Buffer): Promise<TaskAttachment>;
  deleteAttachment(id: string): Promise<void>;

  /** Historie úkolů (bez taskId všech), od nejstarší. */
  listTaskLog(taskId?: string): Promise<TaskLogEntry[]>;
  addTaskLog(entry: Omit<TaskLogEntry, "id" | "createdAt">): Promise<void>;

  /** Úkoly pozic (šablony pro směny). */
  listRoleTasks(): Promise<RoleTask[]>;
  saveRoleTask(input: Omit<RoleTask, "id" | "createdAt" | "sortOrder"> & { id?: string }): Promise<RoleTask | null>;
  deleteRoleTask(id: string): Promise<void>;

  listPushSubs(): Promise<PushSub[]>;
  savePushSub(sub: Omit<PushSub, "createdAt">): Promise<void>;
  deletePushSub(endpoint: string): Promise<void>;
  /** Zapíše klíč odeslané notifikace; true = poprvé (poslat), false = už bylo. */
  claimNotice(key: string): Promise<boolean>;

  listRoles(): Promise<ShiftRole[]>;
  saveRole(input: { id?: string; name: string; color: string | null }): Promise<ShiftRole | null>;
  deleteRole(roleId: string): Promise<void>;

  listShifts(filter: { from: string; to: string; staffId?: string | null; eventId?: string | null }): Promise<Shift[]>;
  getShift(shiftId: string): Promise<Shift | null>;
  recentShiftTimes(): Promise<{ startMin: number; endMin: number }[]>;
  createShifts(list: NewShift[]): Promise<void>;
  updateShift(shift: Shift): Promise<void>;
  deleteShift(shiftId: string): Promise<void>;

  forgetStaff(staffId: string): Promise<void>;
}
