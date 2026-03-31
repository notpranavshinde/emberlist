import type { SyncPayload } from '../types/sync';
import { SyncEngine } from './syncEngine';
import { db } from './db';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/rest?version=v3';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

export class DriveSyncService {
    private tokenClient: TokenClient | null = null;
    private accessToken: string | null = null;
    private readonly syncEngine = new SyncEngine();
    private readonly clientId: string;

    constructor(clientId: string) {
        this.clientId = clientId;
    }

    async init() {
        return new Promise<void>((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.clientId,
                    scope: SCOPES,
                    callback: (response: TokenResponse) => {
                        this.accessToken = response.access_token;
                        resolve();
                    },
                });
                
                // Also load the gapi client
                const gapiScript = document.createElement('script');
                gapiScript.src = 'https://apis.google.com/js/api.js';
                gapiScript.onload = () => {
                    gapi.load('client', async () => {
                        await gapi.client.init({
                            discoveryDocs: [DISCOVERY_DOC],
                        });
                        resolve();
                    });
                };
                document.body.appendChild(gapiScript);
            };
            document.body.appendChild(script);
        });
    }

    async login() {
        if (!this.tokenClient) await this.init();
        return new Promise<void>((resolve) => {
            this.tokenClient!.requestAccessToken({ prompt: 'consent' });
            // The callback in init will resolve this flow
            const checkToken = setInterval(() => {
                if (this.accessToken) {
                    clearInterval(checkToken);
                    resolve();
                }
            }, 100);
        });
    }

    async sync() {
        if (!this.accessToken) await this.login();

        // 1. Find the file in appDataFolder
        const response = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
            q: "name = 'emberlist_sync.json'",
        });

        const files = response.result.files || [];
        let fileId = files.length > 0 ? files[0].id : null;

        // 2. Download remote payload if it exists
        let remotePayload: SyncPayload | null = null;
        if (fileId) {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${this.accessToken}` },
            });
            if (res.ok) {
                remotePayload = await res.json();
            }
        }

        // 3. Merge with local payload
        const localPayload = await db.getPayload();
        let finalPayload = localPayload;

        if (remotePayload) {
            finalPayload = this.syncEngine.mergePayloads(localPayload, remotePayload);
        }

        // 4. Upload the merged payload
        const metadata = {
            name: 'emberlist_sync.json',
            parents: ['appDataFolder'],
        };

        const fileContent = JSON.stringify(finalPayload);
        const boundary = 'foo_bar_baz';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            fileContent +
            close_delim;

        const url = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        await fetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
        });

        // 5. Update local DB
        await db.savePayload(finalPayload);
        return finalPayload;
    }
}
