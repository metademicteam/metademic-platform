import { redirect } from "next/navigation";

export default function ProductionIndexPage() {
  redirect("/production/dashboard");
}
