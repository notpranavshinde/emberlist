import { Plus, X } from "lucide-react";

export function GettingStartedDialog({
  workspaceEmpty,
  onClose,
  onShowWelcome,
  onOpenQuickAdd,
}: {
  workspaceEmpty: boolean;
  onClose: () => void;
  onShowWelcome: () => void;
  onOpenQuickAdd: () => void;
}) {
  return (
      <section
        aria-labelledby="getting-started-title"
        className="mt-4 w-full rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#B25B3C]">
              Emberlist basics
            </p>
            <h2 id="getting-started-title" className="mt-2 text-2xl font-bold text-[#1E2D2F]">
              Getting started
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close getting started"
            className="rounded-full p-2 text-[#6D5C50] hover:bg-[var(--app-surface-soft)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {[
            ["Capture quickly", "Use + from anywhere, or press Q on the web, to open Quick Add."],
            ["Write naturally", "Add dates, times, priorities, and repeat schedules in the same sentence."],
            ["Organize only when useful", "Projects group related work, but every task can stand on its own."],
            ["Sync is optional", "Connect Google Drive when you want the same workspace on another device."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-[18px] bg-[var(--app-surface-soft)] px-4 py-3">
              <p className="text-sm font-semibold text-[#1E2D2F]">{title}</p>
              <p className="mt-1 text-sm leading-6 text-[#6D5C50]">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={workspaceEmpty ? onShowWelcome : onOpenQuickAdd}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#dc4c3e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#c84335]"
          >
            <Plus size={17} />
            {workspaceEmpty ? "Show welcome on Today" : "Open Quick Add"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full border border-[#E1D5CA] px-5 py-2.5 text-sm font-semibold text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
          >
            Done
          </button>
        </div>
      </section>
  );
}
