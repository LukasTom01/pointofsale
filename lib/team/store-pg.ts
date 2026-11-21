// Postgres úložiště modulu Tým (když je nastavené DATABASE_URL).
// Tabulky s prefixem team_; schéma idempotentní a memoizované na proces.
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import type { NewShift, Shift, ShiftRole, Task, TaskAttachment, TeamEvent, TeamProfile } from "./types";
import type { TeamStore } from "./store-shared";

type Sql = ReturnType<typeof neon>;
type Row = Record<string, unknown>;

function db(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL není nastavené.");
  return neon(url);
}
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS team_profiles (
      staff_id TEXT PRIMARY KEY,
      phone TEXT,
      note TEXT,
      token TEXT UNIQUE
    )`;
    await sql`CREATE TABLE IF NOT EXISTS team_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date_from TEXT,
      date_to TEXT,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS team_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      event_id TEXT,
      assignee_ids TEXT NOT NULL DEFAULT '[]',
      done_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
    await sql`ALTER TABLE team_tasks ADD COLUMN IF NOT EXISTS due_time INT`;
    await sql`CREATE TABLE IF NOT EXISTS team_attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_team_attachments_task ON team_attachments(task_id)`;
    await sql`CREATE TABLE IF NOT EXISTS team_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS team_shifts (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      event_id TEXT,
      role_id TEXT,
      day TEXT NOT NULL,
      start_min INT NOT NULL,
      end_min INT NOT NULL,
      note TEXT,
      attendance TEXT NOT NULL DEFAULT 'planned',
      check_in_at TEXT,
      check_out_at TEXT,
      created_at TEXT NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_team_shifts_day ON team_shifts(day)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_team_shifts_staff ON team_shifts(staff_id, day)`;
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

async function q<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureSchema();
  return run(db());
}

const str = (v: unknown) => (v == null ? null : String(v));
const toProfile = (r: Row): TeamProfile => ({
  staffId: String(r.staff_id),
  phone: str(r.phone),
  note: str(r.note),
  token: str(r.token),
});
const toEvent = (r: Row): TeamEvent => ({
  id: String(r.id),
  name: String(r.name),
  dateFrom: str(r.date_from),
  dateTo: str(r.date_to),
  createdAt: String(r.created_at),
});
const toTask = (r: Row): Task => ({
  id: String(r.id),
  title: String(r.title),
  note: str(r.note),
  status: r.status as Task["status"],
  dueDate: str(r.due_date),
  dueTime: r.due_time == null ? null : Number(r.due_time),
  eventId: str(r.event_id),
  assigneeIds: JSON.parse(String(r.assignee_ids ?? "[]")) as string[],
  doneAt: str(r.done_at),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toAttachment = (r: Row): TaskAttachment => ({
  id: String(r.id),
  taskId: String(r.task_id),
  name: String(r.name),
  mime: String(r.mime),
  size: Number(r.size),
  createdAt: String(r.created_at),
});
const toRole = (r: Row): ShiftRole => ({
  id: String(r.id),
  name: String(r.name),
  color: str(r.color),
  sortOrder: Number(r.sort_order),
  createdAt: String(r.created_at),
});
const toShift = (r: Row): Shift => ({
  id: String(r.id),
  staffId: String(r.staff_id),
  eventId: str(r.event_id),
  roleId: str(r.role_id),
  day: String(r.day),
  startMin: Number(r.start_min),
  endMin: Number(r.end_min),
  note: str(r.note),
  attendance: r.attendance as Shift["attendance"],
  checkInAt: str(r.check_in_at),
  checkOutAt: str(r.check_out_at),
  createdAt: String(r.created_at),
});

export const pgTeamStore: TeamStore = {
  // --- Profily (kontakt + osobní odkaz) ---
  async listProfiles() {
    return q(async (sql) => ((await sql`SELECT * FROM team_profiles`) as Row[]).map(toProfile));
  },
  async profileByToken(token) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM team_profiles WHERE token = ${token}`) as Row[];
      return rows[0] ? toProfile(rows[0]) : null;
    });
  },
  async saveProfile(profile) {
    return q(async (sql) => {
      const rows = (await sql`INSERT INTO team_profiles (staff_id, phone, note, token)
        VALUES (${profile.staffId}, ${profile.phone}, ${profile.note}, ${profile.token})
        ON CONFLICT (staff_id) DO UPDATE SET phone = EXCLUDED.phone, note = EXCLUDED.note, token = EXCLUDED.token
        RETURNING *`) as Row[];
      return toProfile(rows[0]);
    });
  },

  // --- Akce ---
  async listEvents() {
    return q(async (sql) =>
      ((await sql`SELECT * FROM team_events ORDER BY date_from NULLS LAST, name`) as Row[]).map(toEvent),
    );
  },
  async saveEvent(input) {
    return q(async (sql) => {
      const rows = input.id
        ? ((await sql`UPDATE team_events SET name = ${input.name}, date_from = ${input.dateFrom}, date_to = ${input.dateTo}
            WHERE id = ${input.id} RETURNING *`) as Row[])
        : ((await sql`INSERT INTO team_events (id, name, date_from, date_to, created_at)
            VALUES (${newId()}, ${input.name}, ${input.dateFrom}, ${input.dateTo}, ${nowIso()}) RETURNING *`) as Row[]);
      return rows[0] ? toEvent(rows[0]) : null;
    });
  },
  async deleteEvent(eventId) {
    await q(async (sql) => {
      await sql`UPDATE team_tasks SET event_id = NULL WHERE event_id = ${eventId}`;
      await sql`UPDATE team_shifts SET event_id = NULL WHERE event_id = ${eventId}`;
      await sql`DELETE FROM team_events WHERE id = ${eventId}`;
    });
  },

  // --- Úkoly ---
  async listTasks() {
    return q(async (sql) => ((await sql`SELECT * FROM team_tasks`) as Row[]).map(toTask));
  },
  async getTask(taskId) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM team_tasks WHERE id = ${taskId}`) as Row[];
      return rows[0] ? toTask(rows[0]) : null;
    });
  },
  async createTask(input) {
    return q(async (sql) => {
      const now = nowIso();
      const rows = (await sql`INSERT INTO team_tasks
        (id, title, note, status, due_date, due_time, event_id, assignee_ids, done_at, created_at, updated_at)
        VALUES (${newId()}, ${input.title}, ${input.note}, 'todo', ${input.dueDate}, ${input.dueTime}, ${input.eventId},
          ${JSON.stringify(input.assigneeIds)}, NULL, ${now}, ${now}) RETURNING *`) as Row[];
      return toTask(rows[0]);
    });
  },
  async updateTask(task) {
    return q(async (sql) => {
      const rows = (await sql`UPDATE team_tasks SET title = ${task.title}, note = ${task.note},
        status = ${task.status}, due_date = ${task.dueDate}, due_time = ${task.dueTime}, event_id = ${task.eventId},
        assignee_ids = ${JSON.stringify(task.assigneeIds)}, done_at = ${task.doneAt}, updated_at = ${nowIso()}
        WHERE id = ${task.id} RETURNING *`) as Row[];
      return rows[0] ? toTask(rows[0]) : null;
    });
  },
  async deleteTask(taskId) {
    await q(async (sql) => {
      await sql`DELETE FROM team_attachments WHERE task_id = ${taskId}`;
      await sql`DELETE FROM team_tasks WHERE id = ${taskId}`;
    });
  },

  // --- Přílohy (obsah jako base64 v TEXT, načítá se jen při stažení) ---
  async listAttachments() {
    return q(async (sql) =>
      ((await sql`SELECT id, task_id, name, mime, size, created_at FROM team_attachments ORDER BY created_at`) as Row[]).map(
        toAttachment,
      ),
    );
  },
  async getAttachment(id) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM team_attachments WHERE id = ${id}`) as Row[];
      return rows[0] ? { meta: toAttachment(rows[0]), data: Buffer.from(String(rows[0].data), "base64") } : null;
    });
  },
  async addAttachment(input, data) {
    return q(async (sql) => {
      const rows = (await sql`INSERT INTO team_attachments (id, task_id, name, mime, size, data, created_at)
        VALUES (${newId()}, ${input.taskId}, ${input.name}, ${input.mime}, ${input.size}, ${data.toString("base64")}, ${nowIso()})
        RETURNING id, task_id, name, mime, size, created_at`) as Row[];
      return toAttachment(rows[0]);
    });
  },
  async deleteAttachment(id) {
    await q(async (sql) => {
      await sql`DELETE FROM team_attachments WHERE id = ${id}`;
    });
  },

  // --- Pozice ---
  async listRoles() {
    return q(async (sql) => ((await sql`SELECT * FROM team_roles ORDER BY sort_order, name`) as Row[]).map(toRole));
  },
  async saveRole(input) {
    return q(async (sql) => {
      if (input.id) {
        const rows = (await sql`UPDATE team_roles SET name = ${input.name}, color = ${input.color}
          WHERE id = ${input.id} RETURNING *`) as Row[];
        return rows[0] ? toRole(rows[0]) : null;
      }
      const next = Number(((await sql`SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM team_roles`) as Row[])[0].n);
      const rows = (await sql`INSERT INTO team_roles (id, name, color, sort_order, created_at)
        VALUES (${newId()}, ${input.name}, ${input.color}, ${next}, ${nowIso()}) RETURNING *`) as Row[];
      return toRole(rows[0]);
    });
  },
  async deleteRole(roleId) {
    await q(async (sql) => {
      await sql`UPDATE team_shifts SET role_id = NULL WHERE role_id = ${roleId}`;
      await sql`DELETE FROM team_roles WHERE id = ${roleId}`;
    });
  },

  // --- Směny a docházka ---
  async listShifts(filter) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM team_shifts
        WHERE day >= ${filter.from} AND day <= ${filter.to}
          AND (${filter.staffId ?? null}::text IS NULL OR staff_id = ${filter.staffId ?? null})
          AND (${filter.eventId ?? null}::text IS NULL OR event_id = ${filter.eventId ?? null})
        ORDER BY day, start_min`) as Row[];
      return rows.map(toShift);
    });
  },
  async getShift(shiftId) {
    return q(async (sql) => {
      const rows = (await sql`SELECT * FROM team_shifts WHERE id = ${shiftId}`) as Row[];
      return rows[0] ? toShift(rows[0]) : null;
    });
  },
  async recentShiftTimes() {
    return q(async (sql) =>
      ((await sql`SELECT start_min, end_min FROM team_shifts ORDER BY created_at DESC LIMIT 300`) as Row[]).map(
        (r) => ({ startMin: Number(r.start_min), endMin: Number(r.end_min) }),
      ),
    );
  },
  async createShifts(list: NewShift[]) {
    await q(async (sql) => {
      for (const s of list) {
        await sql`INSERT INTO team_shifts (id, staff_id, event_id, role_id, day, start_min, end_min, note, attendance, created_at)
          VALUES (${newId()}, ${s.staffId}, ${s.eventId}, ${s.roleId}, ${s.day}, ${s.startMin}, ${s.endMin}, ${s.note},
            'planned', ${nowIso()})`;
      }
    });
  },
  async updateShift(shift) {
    await q(async (sql) => {
      await sql`UPDATE team_shifts SET staff_id = ${shift.staffId}, event_id = ${shift.eventId}, role_id = ${shift.roleId},
        day = ${shift.day}, start_min = ${shift.startMin}, end_min = ${shift.endMin}, note = ${shift.note},
        attendance = ${shift.attendance}, check_in_at = ${shift.checkInAt}, check_out_at = ${shift.checkOutAt}
        WHERE id = ${shift.id}`;
    });
  },
  async deleteShift(shiftId) {
    await q(async (sql) => {
      await sql`DELETE FROM team_shifts WHERE id = ${shiftId}`;
    });
  },

  // Smazání člověka z Lidí: jeho směny, profil a přiřazení k úkolům.
  async forgetStaff(staffId) {
    await q(async (sql) => {
      await sql`DELETE FROM team_shifts WHERE staff_id = ${staffId}`;
      await sql`DELETE FROM team_profiles WHERE staff_id = ${staffId}`;
      const tasks = (await sql`SELECT id, assignee_ids FROM team_tasks`) as Row[];
      for (const t of tasks) {
        const ids = JSON.parse(String(t.assignee_ids ?? "[]")) as string[];
        if (ids.includes(staffId)) {
          const next = JSON.stringify(ids.filter((x) => x !== staffId));
          await sql`UPDATE team_tasks SET assignee_ids = ${next} WHERE id = ${String(t.id)}`;
        }
      }
    });
  },
};
