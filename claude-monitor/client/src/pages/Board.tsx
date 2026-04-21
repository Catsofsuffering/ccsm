import { KanbanBoard } from "./KanbanBoard";
import { OpenSpecBoard } from "./OpenSpecBoard";
import { ActivityFeed } from "./ActivityFeed";

export function Board() {
  return (
    <div className="animate-fade-in space-y-10">
      <h1 className="text-base font-semibold text-gray-100">Board</h1>

      <BoardSection title="OpenSpec">
        <OpenSpecBoard embedded />
      </BoardSection>

      <BoardSection title="Agents">
        <KanbanBoard embedded />
      </BoardSection>

      <BoardSection title="Activity">
        <ActivityFeed embedded />
      </BoardSection>
    </div>
  );
}

function BoardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      {children}
    </section>
  );
}
