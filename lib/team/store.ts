// Výběr úložiště modulu Tým: Postgres (DATABASE_URL), jinak soubor data/team.json.
import { fileTeamStore } from "./store-file";
import { pgTeamStore } from "./store-pg";

export const teamStore = process.env.DATABASE_URL ? pgTeamStore : fileTeamStore;
