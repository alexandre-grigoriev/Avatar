import { cn } from "../../utils";

export function ModeTabs({ view, setView }: { view: "chat" | "presentation"; setView: (v: "chat" | "presentation") => void }) {
  return (
    <div className="modeTabs">
      <button className={cn("modeTab", view === "presentation" && "modeTabActive")} onClick={() => setView("presentation")}>
        Presentation
      </button>
      <button className={cn("modeTab", view === "chat" && "modeTabActive")} onClick={() => setView("chat")}>
        Chat
      </button>
    </div>
  );
}
