import { redirect } from "next/navigation";

/** Okuyucu simülatörü kasa ekranının yanında panel olarak açılır. */
export default function SimulatorPage() {
  redirect("/kasa?sim=1");
}
