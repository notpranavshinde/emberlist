import type { SyncPayload } from '../types/sync';
import { assertSupportedSyncPayload, ensureSyncPayload } from './syncPayload';
import { SyncEngine } from './syncEngine';
import { db } from './db';

export type RedirectAuthCompletion = {
    handled: boolean;
    session?: CloudSession | null;
    error?: Error;
};

export type CloudSession = {
    accountId: string;
    email: string | null;
    name: string | null;
};

export type SyncOptions = {
    interactiveAuth?: boolean;
};

export type CloudSyncService = {
    init: () => Promise<void>;
    login: (interactive?: boolean) => Promise<CloudSession>;
    sync: (options?: SyncOptions) => Promise<SyncPayload>;
    replaceCorruptRemoteWithLocal: () => Promise<SyncPayload>;
    disconnect: () => Promise<void>;
    getSession: () => CloudSession | null;
    completeRedirectLoginIfPresent: () => Promise<RedirectAuthCompletion>;
    hasActiveSession: () => boolean;
};

type BackendRemotePayloadResponse = {
    fileId: string | null;
    payload: unknown;
};

type BackendSessionResponse = {
    authenticated: boolean;
    session: CloudSession | null;
};

export function createCloudSyncService(): CloudSyncService {
    return new BackendDriveSyncService();
}

export function buildBackendAuthStartUrl(returnTo: string): string {
    return `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export class BackendDriveSyncService implements CloudSyncService {
    private session: CloudSession | null = null;
    private readonly syncEngine = new SyncEngine();
    private syncInFlight: Promise<SyncPayload> | null = null;

    async init() {
        await this.refreshSession();
    }

    async login(interactive: boolean = true) {
        if (this.session) return this.session;
        const session = await this.refreshSession();
        if (session) return session;
        if (!interactive) {
            throw new Error('Google Drive sign-in is required in this browser.');
        }

        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || '#/today'}`;
        window.location.assign(buildBackendAuthStartUrl(returnTo));
        return new Promise<CloudSession>(() => {});
    }

    async sync(options: SyncOptions = {}) {
        if (this.syncInFlight) return this.syncInFlight;
        const syncPromise = this.performSync(options);
        this.syncInFlight = syncPromise;
        try {
            return await syncPromise;
        } finally {
            if (this.syncInFlight === syncPromise) this.syncInFlight = null;
        }
    }

    async disconnect() {
        await this.backendFetch('/api/auth/google/logout', { method: 'POST' });
        this.session = null;
    }

    async replaceCorruptRemoteWithLocal(): Promise<SyncPayload> {
        const session = await this.login(true);
        const metadata = await db.getWorkspaceMetadata();
        if (metadata.binding && metadata.binding.accountId !== session.accountId) {
            throw new Error('A different Google account owns this browser cache.');
        }
        const localPayload = await db.getPayload();
        await this.backendFetch('/api/drive/sync-file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localPayload),
        });
        await db.markUploaded(metadata.mutationGeneration);
        return localPayload;
    }

    getSession(): CloudSession | null {
        return this.session;
    }

    async completeRedirectLoginIfPresent(): Promise<RedirectAuthCompletion> {
        if (!this.consumeBackendAuthCompletionMarker()) return { handled: false };
        try {
            const session = await this.refreshSession();
            return session ? { handled: true, session } : { handled: false };
        } catch (error) {
            return {
                handled: true,
                error: error instanceof Error ? error : new Error('Google sign-in could not be completed.'),
            };
        }
    }

    hasActiveSession(): boolean {
        return Boolean(this.session);
    }

    private async performSync(options: SyncOptions = {}) {
        const session = await this.login(options.interactiveAuth ?? true);
        const metadataBeforeSync = await db.getWorkspaceMetadata();
        if (metadataBeforeSync.binding && metadataBeforeSync.binding.accountId !== session.accountId) {
            throw new Error('A different Google account owns this browser cache.');
        }
        const response = await this.backendFetch('/api/drive/sync-file');
        const remote = (await response.json()) as BackendRemotePayloadResponse;
        let remotePayload: SyncPayload | null = null;

        if (remote.payload) {
            try {
                remotePayload = assertSupportedSyncPayload(
                    ensureSyncPayload(remote.payload, 'Google Drive workspace'),
                    'Google Drive workspace',
                );
            } catch (error) {
                if (error instanceof Error && error.message.includes('newer app version')) throw error;
                throw new Error(
                    'Google Drive workspace is invalid or corrupted. Local cached data was not changed.',
                );
            }
        }

        const localPayload = await db.getPayload();
        const finalPayload = remotePayload
            ? this.syncEngine.mergePayloads(localPayload, remotePayload)
            : localPayload;

        await this.backendFetch('/api/drive/sync-file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload),
        });
        await db.markUploaded(metadataBeforeSync.mutationGeneration);
        return finalPayload;
    }

    private async refreshSession(): Promise<CloudSession | null> {
        const response = await this.backendFetch('/api/auth/session', {}, false);
        if (!response.ok) {
            throw new Error(`Google session check failed (${response.status}).`);
        }
        const body = (await response.json()) as BackendSessionResponse;
        this.session = body.authenticated ? body.session : null;
        return this.session;
    }

    private async backendFetch(
        input: string,
        init: RequestInit = {},
        requireOk: boolean = true,
    ): Promise<Response> {
        const response = await fetch(input, {
            ...init,
            credentials: 'same-origin',
            headers: { ...init.headers },
        });
        if (requireOk && !response.ok) {
            throw new Error(await this.buildBackendError(response));
        }
        return response;
    }

    private async buildBackendError(response: Response): Promise<string> {
        const fallback = `Google Drive request failed (${response.status})`;
        try {
            const body = await response.json() as { message?: string };
            return body.message ? `${fallback} - ${body.message}` : fallback;
        } catch {
            return fallback;
        }
    }

    private consumeBackendAuthCompletionMarker(): boolean {
        const hash = window.location.hash || '';
        const [path, query = ''] = hash.split('?');
        const params = new URLSearchParams(query);
        if (params.get('googleAuth') !== 'connected') return false;
        params.delete('googleAuth');
        const nextQuery = params.toString();
        window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${window.location.search}${path}${nextQuery ? `?${nextQuery}` : ''}`,
        );
        return true;
    }
}
