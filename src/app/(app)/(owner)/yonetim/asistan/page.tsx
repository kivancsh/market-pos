import { requirePageUser } from "@/server/auth/pageSession";
import { getDb } from "@/server/db/connection";
import { getAssistantPageData } from "@/server/services/assistant";
import { AssistantScreen } from "./AssistantScreen";

export const metadata = { title: "Yapay zekâ asistanı · Market Kasa" };

export default async function AssistantPage(props: PageProps<"/yonetim/asistan">) {
  await requirePageUser("owner");
  const sp = await props.searchParams;
  const data = getAssistantPageData({ db: getDb(), now: () => new Date() }, typeof sp.ay === "string" ? sp.ay : null);
  return <AssistantScreen initial={data} />;
}
