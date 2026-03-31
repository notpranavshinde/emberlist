import type { SyncPayload } from '../types/sync';
import { ensureSyncPayload } from './syncPayload';
import { SyncEngine } from './syncEngine';
import { db } from './db';

const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SYNC_FILE_NAME = 'emberlist_sync.json';
const AUTH_TIMEOUT_MS = 60_000;

type DriveFileListResponse = {
    files?: Array<{ id?: string | null; modifiedTime?: string | null }>;
};

export type CloudSession = {
    email: string | null;
    name: string | null;
};

export class DriveSyncService {
    private static gisScriptPromise: Promise<void> | null = null;

    private tokenClient: TokenClient | null = null;
    private accessToken: string | null = null;
    private session: CloudSession | null = null;
    private readonly syncEngine = new SyncEngine();
    private readonly clientId: string;

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

    async login() {
        if (!this.tokenClient) await this.init();
        this.accessToken = await this.requestAccessToken(this.accessToken ? '' : 'consent');
        this.session = await this.fetchSessionProfile();
        return this.session;
    }

    async sync() {
        if (!this.accessToken) await this.login();

        const fileId = await this.findSyncFileId();

        let remotePayload: SyncPayload | null = null;
        if (fileId) {
            const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
            if (response.ok) {
                try {
                    remotePayload = ensureSyncPayload(await response.json(), 'Cloud sync file');
                } catch (error) {
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

        await this.uploadPayload(fileId, finalPayload);
        await db.savePayload(finalPayload);
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

    hasActiveSession(): boolean {
        return Boolean(this.accessToken);
    }

    async resetRemoteSyncFile() {
        if (!this.accessToken) await this.login();

        const fileIds = await this.findSyncFileIds();
        if (!fileIds.length) {
            return;
        }

        for (const fileId of fileIds) {
            const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error(await this.buildGoogleApiError('reset cloud sync file', response));
            }
        }
    }

    private async findSyncFileId(): Promise<string | null> {
        const fileIds = await this.findSyncFileIds();
        return fileIds[0] ?? null;
    }

    private async findSyncFileIds(): Promise<string[]> {
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            fields: 'files(id,modifiedTime)',
            q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
        });

        const response = await this.authorizedFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
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

    private async uploadPayload(fileId: string | null, payload: SyncPayload) {
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
        });
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

    private async authorizedFetch(input: string, init: RequestInit = {}, allowRefresh: boolean = true): Promise<Response> {
        if (!this.accessToken) {
            await this.login();
        }

        const response = await fetch(input, {
            ...init,
            headers: {
                ...init.headers,
                ...this.createAuthHeaders(),
            },
        });

        if (response.status === 401 && allowRefresh) {
            this.accessToken = null;
            await this.login();
            return this.authorizedFetch(input, init, false);
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

    private async fetchSessionProfile(): Promise<CloudSession> {
        try {
            const response = await this.authorizedFetch('https://www.googleapis.com/oauth2/v3/userinfo', {}, false);
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

    private async requestAccessToken(prompt: '' | 'consent'): Promise<string> {
        if (!this.tokenClient) {
            throw new Error('Google token client is not initialized.');
        }

        return new Promise<string>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                reject(new Error('Google sign-in timed out.'));
            }, AUTH_TIMEOUT_MS);

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
                this.tokenClient!.requestAccessToken({ prompt });
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
