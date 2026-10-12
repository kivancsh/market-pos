import { PanelScreen } from "./PanelScreen";

export const metadata = { title: "Panel · Optiva" };

export default async function PanelPage(props: PageProps<"/panel">) {
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  return <PanelScreen initialDate={date} />;
}
