import type { SyncPayload } from '../types/sync';
import { assertSupportedSyncPayload, ensureSyncPayload } from './syncPayload';
import { SyncEngine } from './syncEngine';
import { db } from './db';

const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SYNC_FILE_NAME = 'emberlist_sync.json';
export const GOOGLE_AUTH_TIMEOUT_MS = 180_000;

type DriveFileListResponse = {
    files?: Array<{ id?: string | null; modifiedTime?: string | null }>;
};

export type CloudSession = {
    email: string | null;
    name: string | null;
};

export type SyncOptions = {
    interactiveAuth?: boolean;
};

export function resolveGoogleAuthPrompt(interactive: boolean, hasAccessToken: boolean): '' | 'consent' {
    return interactive && !hasAccessToken ? 'consent' : '';
}

export function resolveGoogleLoginHint(preferredEmail: string | null): string | undefined {
    const normalized = preferredEmail?.trim() ?? '';
    return normalized.length ? normalized : undefined;
}

export class DriveSyncService {
    private static gisScriptPromise: Promise<void> | null = null;

    private tokenClient: TokenClient | null = null;
    private accessToken: string | null = null;
    private session: CloudSession | null = null;
    private preferredLoginHint: string | null = null;
    private readonly syncEngine = new SyncEngine();
    private readonly clientId: string;
    private syncInFlight: Promise<SyncPayload> | null = null;

    constructor(clientId: string) {
        this.clientId = clientId;
    }

    async init() {
        if (this.tokenClient) return;

        await this.loadGoogleIdentityScript();
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: SCOPES,
            callback: () => {
                throw new Error('DriveSyncService callback was invoked without an active token request.');
            },
        });
    }

    async login(interactive: boolean = true) {
        if (!this.tokenClient) await this.init();
        const prompt = resolveGoogleAuthPrompt(interactive, Boolean(this.accessToken));
        const loginHint = resolveGoogleLoginHint(this.preferredLoginHint);

        try {
            this.accessToken = await this.requestAccessToken(prompt, loginHint);
        } catch (error) {
            if (!interactive) {
                throw new Error('Google Drive sign-in is required in this browser.');
            }
            throw error;
        }
        this.session = await this.fetchSessionProfile(interactive);
        return this.session;
    }

    async sync(options: SyncOptions = {}) {
        if (this.syncInFlight) {
            return this.syncInFlight;
        }

        const syncPromise = this.performSync(options);
        this.syncInFlight = syncPromise;
        try {
            return await syncPromise;
        } finally {
            if (this.syncInFlight === syncPromise) {
                this.syncInFlight = null;
            }
        }
    }

    private async performSync(options: SyncOptions = {}) {
        const interactiveAuth = options.interactiveAuth ?? true;
        if (!this.accessToken) await this.login(interactiveAuth);

        const fileId = await this.findSyncFileId(interactiveAuth);

        let remotePayload: SyncPayload | null = null;
        if (fileId) {
            const response = await this.authorizedFetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                {},
                true,
                interactiveAuth
            );
            if (response.ok) {
                try {
                    remotePayload = assertSupportedSyncPayload(
                        ensureSyncPayload(await response.json(), 'Cloud sync file'),
                        'Cloud sync file'
                    );
                } catch (error) {
                    if (error instanceof Error && error.message.includes('newer app version')) {
                        throw error;
                    }
                    if (error instanceof Error && error.message.startsWith('Cloud sync file')) {
                        throw new Error(
                            'Cloud sync file is invalid or corrupted. Local web data was not changed. Reset cloud sync and sync again to recreate it.'
                        );
                    }
                    throw error;
                }
            } else if (response.status !== 404) {
                throw new Error(`Failed to download sync payload (${response.status})`);
            }
        }

        const localPayload = await db.getPayload();
        const finalPayload = remotePayload
            ? this.syncEngine.mergePayloads(localPayload, remotePayload)
            : localPayload;

        await this.uploadPayload(fileId, finalPayload, interactiveAuth);
        return finalPayload;
    }

    async disconnect() {
        if (!this.accessToken) {
            this.session = null;
            return;
        }

        const token = this.accessToken;
        this.accessToken = null;
        this.session = null;

        await new Promise<void>((resolve) => {
            google.accounts.oauth2.revoke(token, () => resolve());
        });
    }

    getSession(): CloudSession | null {
        return this.session;
    }

    setPreferredLoginHint(email: string | null) {
        this.preferredLoginHint = email?.trim() || null;
    }

    hasActiveSession(): boolean {
        return Boolean(this.accessToken);
    }

    async resetRemoteSyncFile() {
        if (!this.accessToken) await this.login();

        const fileIds = await this.findSyncFileIds(true);
        if (!fileIds.length) {
            return;
        }

        for (const fileId of fileIds) {
            const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
            }, true, true);
            if (!response.ok) {
                throw new Error(await this.buildGoogleApiError('reset cloud sync file', response));
            }
        }
    }

    private async findSyncFileId(interactiveAuth: boolean): Promise<string | null> {
        const fileIds = await this.findSyncFileIds(interactiveAuth);
        return fileIds[0] ?? null;
    }

    private async findSyncFileIds(interactiveAuth: boolean): Promise<string[]> {
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id,modifiedTime)',
            q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
        });

        const response = await this.authorizedFetch(
            `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
            {},
            true,
            interactiveAuth
        );
        if (!response.ok) {
            throw new Error(await this.buildGoogleApiError('query Drive sync file', response));
        }

        const body = await response.json() as DriveFileListResponse;
        return (body.files ?? [])
            .filter((file): file is { id: string; modifiedTime?: string | null } => typeof file.id === 'string' && file.id.length > 0)
            .sort((left, right) => {
                const leftTime = parseDriveModifiedTime(left.modifiedTime);
                const rightTime = parseDriveModifiedTime(right.modifiedTime);
                if (leftTime !== rightTime) {
                    return rightTime - leftTime;
                }
                return right.id.localeCompare(left.id);
            })
            .map(file => file.id);
    }

    private async uploadPayload(fileId: string | null, payload: SyncPayload, interactiveAuth: boolean) {
        const metadata: {
            name: string;
            mimeType: string;
            parents?: string[];
        } = {
            name: SYNC_FILE_NAME,
            mimeType: 'application/json',
        };
        if (!fileId) {
            metadata.parents = ['appDataFolder'];
        }

        const boundary = 'foo_bar_baz';
        const delimiter = `--${boundary}\r\n`;
        const middleDelimiter = `\r\n--${boundary}\r\n`;
        const closingDelimiter = `\r\n--${boundary}--`;
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            middleDelimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(payload) +
            closingDelimiter;

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

        const response = await this.authorizedFetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
        }, true, interactiveAuth);
        if (!response.ok) {
            throw new Error(await this.buildGoogleApiError('upload sync payload', response));
        }
    }

    private createAuthHeaders(): HeadersInit {
        if (!this.accessToken) {
            throw new Error('Google Drive access token is unavailable.');
        }
        return { Authorization: `Bearer ${this.accessToken}` };
    }

    private async authorizedFetch(
        input: string,
        init: RequestInit = {},
        allowRefresh: boolean = true,
        interactiveAuth: boolean = true
    ): Promise<Response> {
        if (!this.accessToken) {
            await this.login(interactiveAuth);
        }

        const response = await fetch(input, {
            ...init,
            headers: {
                ...init.headers,
                ...this.createAuthHeaders(),
            },
        });

        if (response.status === 401 && allowRefresh && interactiveAuth) {
            this.accessToken = null;
            await this.login(interactiveAuth);
            return this.authorizedFetch(input, init, false, interactiveAuth);
        }

        return response;
    }

    private async buildGoogleApiError(action: string, response: Response): Promise<string> {
        const fallback = `Failed to ${action} (${response.status})`;

        try {
            const text = await response.text();
            if (!text) return fallback;

            let detail = text;
            try {
                const parsed = JSON.parse(text) as {
                    error?: {
                        message?: string;
                        errors?: Array<{ reason?: string; message?: string }>;
                    };
                };
                const reason = parsed.error?.errors?.[0]?.reason;
                const message = parsed.error?.message ?? parsed.error?.errors?.[0]?.message;
                detail = [reason, message].filter(Boolean).join(': ') || text;
            } catch {
                // Keep the raw text when Google doesn't return JSON.
            }

            return `${fallback} - ${detail}`;
        } catch {
            return fallback;
        }
    }

    private async fetchSessionProfile(interactiveAuth: boolean): Promise<CloudSession> {
        try {
            const response = await this.authorizedFetch(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                {},
                false,
                interactiveAuth
            );
            if (!response.ok) {
                return { email: null, name: null };
            }

            const body = await response.json() as { email?: string; name?: string };
            return {
                email: typeof body.email === 'string' ? body.email : null,
                name: typeof body.name === 'string' ? body.name : null,
            };
        } catch {
            return { email: null, name: null };
        }
    }

    private async requestAccessToken(prompt: '' | 'consent', loginHint?: string): Promise<string> {
        if (!this.tokenClient) {
            throw new Error('Google token client is not initialized.');
        }

        return new Promise<string>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                reject(new Error('Google sign-in timed out.'));
            }, GOOGLE_AUTH_TIMEOUT_MS);

            this.tokenClient!.callback = (response: TokenResponse) => {
                window.clearTimeout(timeoutId);

                if (response.error) {
                    reject(new Error(`Google sign-in failed: ${response.error}`));
                    return;
                }

                if (!response.access_token) {
                    reject(new Error('Google sign-in did not return an access token.'));
                    return;
                }

                resolve(response.access_token);
            };

            this.tokenClient!.error_callback = (error) => {
                window.clearTimeout(timeoutId);
                reject(new Error(`Google sign-in failed: ${error.type}`));
            };

            try {
                const config = {
                    prompt,
                    ...(loginHint ? { login_hint: loginHint } : {}),
                };
                this.tokenClient!.requestAccessToken(
                    config as unknown as Parameters<TokenClient['requestAccessToken']>[0]
                );
            } catch (error) {
                window.clearTimeout(timeoutId);
                reject(error instanceof Error ? error : new Error('Google sign-in failed.'));
            }
        });
    }

    private loadGoogleIdentityScript(): Promise<void> {
        if (DriveSyncService.gisScriptPromise) {
            return DriveSyncService.gisScriptPromise;
        }

        DriveSyncService.gisScriptPromise = new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
            if (existingScript?.dataset.loaded === 'true') {
                resolve();
                return;
            }

            const script = existingScript ?? document.createElement('script');
            script.src = GIS_SCRIPT_SRC;
            script.async = true;
            script.defer = true;

            const handleLoad = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            const handleError = () => {
                reject(new Error('Failed to load Google Identity Services.'));
            };

            script.addEventListener('load', handleLoad, { once: true });
            script.addEventListener('error', handleError, { once: true });

            if (!existingScript) {
                document.head.appendChild(script);
            }
        });

        return DriveSyncService.gisScriptPromise;
    }
}

function parseDriveModifiedTime(value?: string | null): number {
    if (!value) return Number.MIN_SAFE_INTEGER;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.MIN_SAFE_INTEGER : parsed;
}
