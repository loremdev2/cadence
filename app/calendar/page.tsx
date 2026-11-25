import { CalendarWorkspace } from "@/components/calendar-workspace";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const viewer = await getViewer();
  return <CalendarWorkspace viewer={viewer} />;
}
