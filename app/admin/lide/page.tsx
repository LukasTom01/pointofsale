import { listStaff } from "@/lib/store";
import StaffAdmin from "@/components/StaffAdmin";

export const dynamic = "force-dynamic";

export default async function LidePage() {
  const staff = await listStaff();
  return <StaffAdmin initialStaff={staff} />;
}
