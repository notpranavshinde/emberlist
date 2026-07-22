import { Cloud, Plus } from "lucide-react";
import {
  ONBOARDING_EXAMPLES,
  type OnboardingExampleId,
} from "../lib/onboarding";

export type OnboardingRestoreStatus =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

export function FirstRunWelcome({
  cloudConfigured,
  isOnline,
  restoreStatus,
  onAddTask,
  onChooseExample,
  onRestore,
  onUseAnotherAccount,
  onSkip,
}: {
  cloudConfigured: boolean;
  isOnline: boolean;
  restoreStatus: OnboardingRestoreStatus;
  onAddTask: () => void;
  onChooseExample: (id: OnboardingExampleId, value: string) => void;
  onRestore: () => void;
  onUseAnotherAccount: () => void;
  onSkip: () => void;
}) {
  const restoring = restoreStatus.kind === "working";

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 bg-[rgba(250,246,242,0.38)] backdrop-blur-[4px]"
      />
      <section
        data-testid="first-run-welcome"
        className="relative z-40 mx-auto w-full max-w-3xl rounded-[30px] border border-[#E7D4C6] bg-[linear-gradient(145deg,var(--app-surface),#fff4ee)] p-6 shadow-[0_24px_70px_rgba(84,55,39,0.18)] sm:p-8"
      >
        <h2 className="text-2xl font-bold tracking-tight text-[#1E2D2F] sm:text-3xl">
          What do you need to get done?
        </h2>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="Example tasks">
        {ONBOARDING_EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => onChooseExample(example.id, example.label)}
            className="rounded-full border border-[#E6C8B7] bg-[var(--app-surface)] px-3.5 py-2 text-left text-sm font-medium text-[#6D4939] transition hover:border-[#EE6A3C] hover:bg-[#FFF9F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EE6A3C]"
          >
            {example.label}
          </button>
        ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="onboarding-add-first-task"
          autoFocus
          onClick={onAddTask}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#dc4c3e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc4c3e]"
        >
          <Plus size={17} />
          Add your first task
        </button>
        <button
          type="button"
          data-testid="onboarding-restore-drive"
          onClick={onRestore}
          disabled={!cloudConfigured || restoring}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D8C9BD] bg-[var(--app-surface)] px-5 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Cloud size={17} />
          {restoring ? "Restoring..." : "Restore from Google Drive"}
        </button>
        <button
          type="button"
          data-testid="onboarding-skip"
          onClick={onSkip}
          disabled={restoring}
          className="min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold text-[#7A675B] transition hover:bg-black/5 disabled:opacity-55"
        >
          Skip for now
        </button>
        </div>

        {!cloudConfigured ? (
        <p className="mt-3 text-sm text-[#8A5A44]">
          Google Drive restore is unavailable in this deployment.
        </p>
      ) : !isOnline ? (
        <p className="mt-3 text-sm text-[#8A5A44]">
          Connect to the internet to restore your workspace.
        </p>
        ) : null}

        {restoreStatus.kind !== "idle" ? (
        <div
          aria-live="polite"
          data-testid="onboarding-restore-status"
          className={`mt-4 rounded-[18px] px-4 py-3 text-sm leading-6 ${
            restoreStatus.kind === "error"
              ? "bg-[#FFF1EB] text-[#A24628]"
              : "bg-[var(--app-surface-soft)] text-[#6D5C50]"
          }`}
        >
          <p>{restoreStatus.message}</p>
          {restoreStatus.kind === "empty" ? (
            <button
              type="button"
              onClick={onUseAnotherAccount}
              className="mt-2 font-semibold text-[#B64B28] underline decoration-[#E8A78E] underline-offset-4"
            >
              Use another Google account
            </button>
          ) : null}
        </div>
        ) : null}
      </section>
    </>
  );
}
