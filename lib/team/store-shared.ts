import type { NewShift, Shift, ShiftRole, Task, TeamEvent, TeamProfile } from "./types";

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
  createTask(input: Pick<Task, "title" | "note" | "dueDate" | "eventId" | "assigneeIds">): Promise<Task>;
  updateTask(task: Task): Promise<Task | null>;
  deleteTask(taskId: string): Promise<void>;

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
