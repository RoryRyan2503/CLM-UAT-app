import { redirect } from "next/navigation";
import { getTesterSession } from "@/lib/auth/testerSession";

export default async function HomePage() {
  const tester = await getTesterSession();
  redirect(tester ? "/dashboard" : "/login");
}
