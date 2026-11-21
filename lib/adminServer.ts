import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminCookie } from "./adminAuth";

/** Pro server actions: akce administrace se dají volat odkudkoli, proto kontrola i tady. */
export async function requireAdmin(): Promise<void> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await isAdminCookie(value))) throw new Error("Nejste přihlášeni do administrace.");
}
