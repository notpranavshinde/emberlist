import { openDB, type IDBPDatabase } from 'idb';
import type { SyncPayload, Project, Section, Task, Reminder, Location } from '../types/sync';
import { createEmptySyncPayload, ensureSyncPayload } from './syncPayload';

const DB_NAME = 'emberlist_db';
const DB_VERSION = 1;
const ACCOUNT_BINDING_KEY = 'accountBinding';
const MUTATION_GENERATION_KEY = 'mutationGeneration';
const UPLOADED_GENERATION_KEY = 'uploadedGeneration';

export type AccountBinding = {
    accountId: string;
    email: string | null;
    name: string | null;
    boundAt: number;
    initialSyncCompleted: boolean;
};

export type WorkspaceMetadata = {
    binding: AccountBinding | null;
    mutationGeneration: number;
    uploadedGeneration: number;
};

export class EmberlistDB {
    private db: IDBPDatabase | null = null;

    async init() {
        if (this.db) return;

        this.db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                db.createObjectStore('projects', { keyPath: 'id' });
                db.createObjectStore('sections', { keyPath: 'id' });
                db.createObjectStore('tasks', { keyPath: 'id' });
                db.createObjectStore('reminders', { keyPath: 'id' });
                db.createObjectStore('locations', { keyPath: 'id' });
                db.createObjectStore('metadata'); // For deviceId, lastSync, etc.
            },
        });
    }

    async savePayload(payload: SyncPayload) {
        if (!this.db) await this.init();
        const normalizedPayload = ensureSyncPayload(payload, 'Local workspace payload');
        const tx = this.db!.transaction(['projects', 'sections', 'tasks', 'reminders', 'locations', 'metadata'], 'readwrite');

        await Promise.all([
            tx.objectStore('projects').clear(),
            tx.objectStore('sections').clear(),
            tx.objectStore('tasks').clear(),
            tx.objectStore('reminders').clear(),
            tx.objectStore('locations').clear(),
        ]);

        await Promise.all([
            ...normalizedPayload.projects.map(p => tx.objectStore('projects').put(p)),
            ...normalizedPayload.sections.map(s => tx.objectStore('sections').put(s)),
            ...normalizedPayload.tasks.map(t => tx.objectStore('tasks').put(t)),
            ...normalizedPayload.reminders.map(r => tx.objectStore('reminders').put(r)),
            ...normalizedPayload.locations.map(l => tx.objectStore('locations').put(l)),
            tx.objectStore('metadata').put(normalizedPayload.deviceId, 'deviceId'),
            tx.objectStore('metadata').put(normalizedPayload.schemaVersion, 'schemaVersion'),
            tx.objectStore('metadata').put(normalizedPayload.exportedAt, 'lastSync'),
        ]);
        
        await tx.done;
    }

    async getPayload(): Promise<SyncPayload> {
        if (!this.db) await this.init();
        const tx = this.db!.transaction(['projects', 'sections', 'tasks', 'reminders', 'locations', 'metadata'], 'readonly');
        
        const [projects, sections, tasks, reminders, locations, deviceId, schemaVersion, exportedAt] = await Promise.all([
            tx.objectStore('projects').getAll(),
            tx.objectStore('sections').getAll(),
            tx.objectStore('tasks').getAll(),
            tx.objectStore('reminders').getAll(),
            tx.objectStore('locations').getAll(),
            tx.objectStore('metadata').get('deviceId'),
            tx.objectStore('metadata').get('schemaVersion'),
            tx.objectStore('metadata').get('lastSync'),
        ]);

        return ensureSyncPayload({
            ...createEmptySyncPayload(typeof deviceId === 'string' ? deviceId : undefined),
            schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 1,
            exportedAt: typeof exportedAt === 'number' ? exportedAt : 0,
            projects: projects as Project[],
            sections: sections as Section[],
            tasks: tasks as Task[],
            reminders: reminders as Reminder[],
            locations: locations as Location[],
        }, 'Local workspace payload');
    }

    async getWorkspaceMetadata(): Promise<WorkspaceMetadata> {
        if (!this.db) await this.init();
        const store = this.db!.transaction('metadata', 'readonly').objectStore('metadata');
        const [binding, mutationGeneration, uploadedGeneration] = await Promise.all([
            store.get(ACCOUNT_BINDING_KEY),
            store.get(MUTATION_GENERATION_KEY),
            store.get(UPLOADED_GENERATION_KEY),
        ]);
        return {
            binding: isAccountBinding(binding) ? binding : null,
            mutationGeneration: typeof mutationGeneration === 'number' ? mutationGeneration : 0,
            uploadedGeneration: typeof uploadedGeneration === 'number' ? uploadedGeneration : 0,
        };
    }

    async bindWorkspace(binding: AccountBinding) {
        if (!this.db) await this.init();
        await this.db!.put('metadata', binding, ACCOUNT_BINDING_KEY);
    }

    async markLocalMutation(): Promise<number> {
        if (!this.db) await this.init();
        const tx = this.db!.transaction('metadata', 'readwrite');
        const store = tx.objectStore('metadata');
        const current = await store.get(MUTATION_GENERATION_KEY);
        const next = (typeof current === 'number' ? current : 0) + 1;
        await store.put(next, MUTATION_GENERATION_KEY);
        await tx.done;
        return next;
    }

    async markUploaded(generation: number) {
        if (!this.db) await this.init();
        const tx = this.db!.transaction('metadata', 'readwrite');
        const store = tx.objectStore('metadata');
        const current = await store.get(MUTATION_GENERATION_KEY);
        if ((typeof current === 'number' ? current : 0) === generation) {
            await store.put(generation, UPLOADED_GENERATION_KEY);
        }
        await tx.done;
    }

    async clearWorkspace() {
        if (!this.db) await this.init();
        const tx = this.db!.transaction(
            ['projects', 'sections', 'tasks', 'reminders', 'locations', 'metadata'],
            'readwrite',
        );
        await Promise.all([
            tx.objectStore('projects').clear(),
            tx.objectStore('sections').clear(),
            tx.objectStore('tasks').clear(),
            tx.objectStore('reminders').clear(),
            tx.objectStore('locations').clear(),
            tx.objectStore('metadata').clear(),
        ]);
        await tx.done;
    }

    /**
     * Helper to get data for the UI, filtering out deleted items.
     */
    async getActiveData() {
        const payload = await this.getPayload();
        return {
            ...payload,
            projects: payload.projects.filter(p => !p.deletedAt),
            sections: payload.sections.filter(s => !s.deletedAt),
            tasks: payload.tasks.filter(t => !t.deletedAt),
            reminders: payload.reminders.filter(r => !r.deletedAt),
        };
    }

    async reset() {
        this.db?.close();
        this.db = null;

        await new Promise<void>((resolve, reject) => {
            const request = window.indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error('Failed to delete local database.'));
            request.onblocked = () => reject(new Error('Local database reset is blocked by another open tab.'));
        });
    }
}

export const db = new EmberlistDB();

function isAccountBinding(value: unknown): value is AccountBinding {
    if (!value || typeof value !== 'object') return false;
    const binding = value as Partial<AccountBinding>;
    return typeof binding.accountId === 'string'
        && binding.accountId.length > 0
        && (binding.email === null || typeof binding.email === 'string')
        && (binding.name === null || typeof binding.name === 'string')
        && typeof binding.boundAt === 'number'
        && binding.initialSyncCompleted === true;
}
