type RecoveryScreenProps = {
    message: string;
    onRetry: () => void;
    onResetLocalCache: () => void;
    isResetting: boolean;
};

export function RecoveryScreen({
    message,
    onRetry,
    onResetLocalCache,
    isResetting,
}: RecoveryScreenProps) {
    return (
        <div className="min-h-screen bg-stone-50 px-6 py-10 text-slate-900">
            <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Recovery</p>
                <h1 className="mt-3 text-3xl font-semibold">Workspace failed to load</h1>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                    Emberlist could not load the local web workspace. Your Google Drive data is unchanged.
                </p>
                <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        onClick={onRetry}
                        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        Retry
                    </button>
                    <button
                        onClick={onResetLocalCache}
                        disabled={isResetting}
                        className="rounded-full border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isResetting ? 'Resetting web cache…' : 'Reset web cache'}
                    </button>
                </div>
            </div>
        </div>
    );
}
