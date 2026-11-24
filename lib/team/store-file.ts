// Souborové úložiště modulu Tým (lokální vývoj bez DATABASE_URL): data/team.json.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PushSub, RoleTask, Shift, ShiftRole, Task, TaskAttachment, TaskLogEntry, TeamEvent, TeamProfile } from "./types";
import { withTaskDefaults } from "./domain";
import type { TeamStore } from "./store-shared";

interface TeamDb {
  profiles: TeamProfile[];
  events: TeamEvent[];
  tasks: Task[];
  roles: ShiftRole[];
  shifts: Shift[];
  /** Přílohy včetně obsahu v base64 (jen pro lokální vývoj). */
  attachments: (TaskAttachment & { data: string })[];
  taskLog: TaskLogEntry[];
  roleTasks: RoleTask[];
  pushSubs: PushSub[];
  notices: string[];
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "team.json");
const empty = (): TeamDb => ({
  profiles: [],
  events: [],
  tasks: [],
  roles: [],
  shifts: [],
  attachments: [],
  taskLog: [],
  roleTasks: [],
  pushSubs: [],
  notices: [],
});

const g = globalThis as unknown as { __posTeam?: { db: TeamDb | null; chain: Promise<unknown> } };
const state = (g.__posTeam ??= { db: null, chain: Promise.resolve() });

async function load(): Promise<TeamDb> {
  if (state.db) return state.db;
  try {
    state.db = { ...empty(), ...(JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<TeamDb>) };
    // Starší úkoly bez nových polí (dřív je uzavíral kdokoli → 'any').
    state.db.tasks = state.db.tasks.map((t) => ({
      ...withTaskDefaults({ ...t, completion: t.completion ?? "any", dueTime: t.dueTime ?? null }),
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    for (const a of state.db.attachments) a.staffId ??= null;
  } catch {
    state.db = empty();
  }
  return state.db;
}

async function mutate<T>(fn: (db: TeamDb) => T): Promise<T> {
  const run = async () => {
    const db = await load();
    try {
      const result = fn(db);
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
      await fs.rename(tmp, FILE);
      return result;
    } catch (e) {
      state.db = null;
      throw e;
    }
  };
  const p = state.chain.then(run, run);
  state.chain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const copy = <T>(v: T): T => structuredClone(v);

export const fileTeamStore: TeamStore = {
  async listProfiles() {
    return copy((await load()).profiles);
  },
  async profileByToken(token) {
    return copy((await load()).profiles.find((p) => p.token === token) ?? null);
  },
  async saveProfile(profile) {
    return mutate((db) => {
      db.profiles = db.profiles.filter((p) => p.staffId !== profile.staffId);
      db.profiles.push(copy(profile));
      return copy(profile);
    });
  },

  async listEvents() {
    return copy(
      (await load()).events
        .slice()
        .sort((a, b) => (a.dateFrom ?? "9999").localeCompare(b.dateFrom ?? "9999") || a.name.localeCompare(b.name, "cs")),
    );
  },
  async saveEvent(input) {
    return mutate((db) => {
      if (input.id) {
        const ev = db.events.find((e) => e.id === input.id);
        if (!ev) return null;
        Object.assign(ev, { name: input.name, dateFrom: input.dateFrom, dateTo: input.dateTo });
        return copy(ev);
      }
      const ev: TeamEvent = { id: newId(), name: input.name, dateFrom: input.dateFrom, dateTo: input.dateTo, createdAt: nowIso() };
      db.events.push(ev);
      return copy(ev);
    });
  },
  async deleteEvent(eventId) {
    await mutate((db) => {
      db.events = db.events.filter((e) => e.id !== eventId);
      for (const t of db.tasks) if (t.eventId === eventId) t.eventId = null;
      for (const s of db.shifts) if (s.eventId === eventId) s.eventId = null;
    });
  },

  async listTasks() {
    return copy((await load()).tasks);
  },
  async getTask(taskId) {
    return copy((await load()).tasks.find((t) => t.id === taskId) ?? null);
  },
  async createTask(input) {
    return mutate((db) => {
      const now = nowIso();
      const task: Task = { ...withTaskDefaults(copy(input)), id: newId(), createdAt: now, updatedAt: now };
      db.tasks.push(task);
      return copy(task);
    });
  },
  async updateTask(task) {
    return mutate((db) => {
      const i = db.tasks.findIndex((t) => t.id === task.id);
      if (i < 0) return null;
      db.tasks[i] = { ...copy(task), updatedAt: nowIso() };
      return copy(db.tasks[i]);
    });
  },
  async deleteTask(taskId) {
    await mutate((db) => {
      db.tasks = db.tasks.filter((t) => t.id !== taskId);
      db.attachments = db.attachments.filter((a) => a.taskId !== taskId);
      db.taskLog = db.taskLog.filter((e) => e.taskId !== taskId);
    });
  },

  async listAttachments() {
    return (await load()).attachments.map(({ data: _data, ...meta }) => copy(meta));
  },
  async getAttachment(id) {
    const row = (await load()).attachments.find((a) => a.id === id);
    if (!row) return null;
    const { data, ...meta } = row;
    return { meta: copy(meta), data: Buffer.from(data, "base64") };
  },
  async addAttachment(input, data) {
    return mutate((db) => {
      const meta: TaskAttachment = { ...input, id: newId(), createdAt: nowIso() };
      db.attachments.push({ ...meta, data: data.toString("base64") });
      return copy(meta);
    });
  },
  async deleteAttachment(id) {
    await mutate((db) => {
      db.attachments = db.attachments.filter((a) => a.id !== id);
    });
  },

  async listTaskLog(taskId) {
    return copy((await load()).taskLog.filter((e) => !taskId || e.taskId === taskId));
  },
  async addTaskLog(e) {
    await mutate((db) => {
      db.taskLog.push({ ...copy(e), id: newId(), createdAt: nowIso() });
    });
  },

  async listRoleTasks() {
    return copy((await load()).roleTasks.slice().sort((a, b) => a.sortOrder - b.sortOrder));
  },
  async saveRoleTask(input) {
    return mutate((db) => {
      if (input.id) {
        const i = db.roleTasks.findIndex((t) => t.id === input.id);
        if (i < 0) return null;
        db.roleTasks[i] = { ...db.roleTasks[i], ...copy(input), id: db.roleTasks[i].id };
        return copy(db.roleTasks[i]);
      }
      const row: RoleTask = {
        ...copy(input),
        id: newId(),
        sortOrder: db.roleTasks.reduce((m, t) => Math.max(m, t.sortOrder + 1), 0),
        createdAt: nowIso(),
      };
      db.roleTasks.push(row);
      return copy(row);
    });
  },
  async deleteRoleTask(id) {
    await mutate((db) => {
      db.roleTasks = db.roleTasks.filter((t) => t.id !== id);
    });
  },

  async listPushSubs() {
    return copy((await load()).pushSubs);
  },
  async savePushSub(sub) {
    await mutate((db) => {
      db.pushSubs = db.pushSubs.filter((p) => p.endpoint !== sub.endpoint);
      db.pushSubs.push({ ...copy(sub), createdAt: nowIso() });
    });
  },
  async deletePushSub(endpoint) {
    await mutate((db) => {
      db.pushSubs = db.pushSubs.filter((p) => p.endpoint !== endpoint);
    });
  },
  async claimNotice(key) {
    return mutate((db) => {
      if (db.notices.includes(key)) return false;
      db.notices.push(key);
      if (db.notices.length > 5000) db.notices = db.notices.slice(-4000);
      return true;
    });
  },

  async listRoles() {
    return copy((await load()).roles.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "cs")));
  },
  async saveRole(input) {
    return mutate((db) => {
      if (input.id) {
        const role = db.roles.find((r) => r.id === input.id);
        if (!role) return null;
        Object.assign(role, { name: input.name, color: input.color });
        return copy(role);
      }
      const role: ShiftRole = {
        id: newId(),
        name: input.name,
        color: input.color,
        sortOrder: db.roles.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0),
        createdAt: nowIso(),
      };
      db.roles.push(role);
      return copy(role);
    });
  },
  async deleteRole(roleId) {
    await mutate((db) => {
      db.roles = db.roles.filter((r) => r.id !== roleId);
      db.roleTasks = db.roleTasks.filter((t) => t.roleId !== roleId);
      for (const s of db.shifts) if (s.roleId === roleId) s.roleId = null;
    });
  },

  async listShifts(filter) {
    return copy(
      (await load()).shifts
        .filter(
          (s) =>
            s.day >= filter.from &&
            s.day <= filter.to &&
            (!filter.staffId || s.staffId === filter.staffId) &&
            (!filter.eventId || s.eventId === filter.eventId),
        )
        .sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin),
    );
  },
  async getShift(shiftId) {
    return copy((await load()).shifts.find((s) => s.id === shiftId) ?? null);
  },
  async recentShiftTimes() {
    return (await load()).shifts.slice(-300).map((s) => ({ startMin: s.startMin, endMin: s.endMin }));
  },
  async createShifts(list) {
    await mutate((db) => {
      for (const s of list) {
        db.shifts.push({ ...copy(s), id: newId(), attendance: "planned", checkInAt: null, checkOutAt: null, createdAt: nowIso() });
      }
    });
  },
  async updateShift(shift) {
    await mutate((db) => {
      const i = db.shifts.findIndex((s) => s.id === shift.id);
      if (i >= 0) db.shifts[i] = copy(shift);
    });
  },
  async deleteShift(shiftId) {
    await mutate((db) => {
      db.shifts = db.shifts.filter((s) => s.id !== shiftId);
    });
  },
  async forgetStaff(staffId) {
    await mutate((db) => {
      db.shifts = db.shifts.filter((s) => s.staffId !== staffId);
      db.profiles = db.profiles.filter((p) => p.staffId !== staffId);
      db.pushSubs = db.pushSubs.filter((p) => p.staffId !== staffId);
      for (const t of db.tasks) {
        t.assigneeIds = t.assigneeIds.filter((id) => id !== staffId);
        t.doneBy = t.doneBy.filter((id) => id !== staffId);
      }
    });
  },
};
