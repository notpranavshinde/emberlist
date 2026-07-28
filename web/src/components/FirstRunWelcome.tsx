import { Plus } from "lucide-react";
import {
  ONBOARDING_EXAMPLES,
  type OnboardingExampleId,
} from "../lib/onboarding";

export function FirstRunWelcome({
  onAddTask,
  onChooseExample,
  onSkip,
}: {
  onAddTask: () => void;
  onChooseExample: (id: OnboardingExampleId, value: string) => void;
  onSkip: () => void;
}) {
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
          data-testid="onboarding-skip"
          onClick={onSkip}
          className="min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold text-[#7A675B] transition hover:bg-black/5 disabled:opacity-55"
        >
          Skip for now
        </button>
        </div>

      </section>
    </>
  );
}
