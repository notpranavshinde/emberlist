import { openDB, type IDBPDatabase } from 'idb';
import type { SyncPayload, Project, Section, Task, Reminder, Location } from '../types/sync';

const DB_NAME = 'emberlist_db';
const DB_VERSION = 1;

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
        const tx = this.db!.transaction(['projects', 'sections', 'tasks', 'reminders', 'locations', 'metadata'], 'readwrite');

        await Promise.all([
            tx.objectStore('projects').clear(),
            tx.objectStore('sections').clear(),
            tx.objectStore('tasks').clear(),
            tx.objectStore('reminders').clear(),
            tx.objectStore('locations').clear(),
            tx.objectStore('metadata').clear(),
        ]);

        await Promise.all([
            ...payload.projects.map(p => tx.objectStore('projects').put(p)),
            ...payload.sections.map(s => tx.objectStore('sections').put(s)),
            ...payload.tasks.map(t => tx.objectStore('tasks').put(t)),
            ...payload.reminders.map(r => tx.objectStore('reminders').put(r)),
            ...payload.locations.map(l => tx.objectStore('locations').put(l)),
            tx.objectStore('metadata').put(payload.deviceId, 'deviceId'),
            tx.objectStore('metadata').put(payload.schemaVersion, 'schemaVersion'),
            tx.objectStore('metadata').put(payload.exportedAt, 'lastSync'),
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

        return {
            schemaVersion: schemaVersion || 1,
            exportedAt: exportedAt || 0,
            deviceId: deviceId || crypto.randomUUID(),
            payloadId: crypto.randomUUID(),
            source: 'web',
            projects: projects as Project[],
            sections: sections as Section[],
            tasks: tasks as Task[],
            reminders: reminders as Reminder[],
            locations: locations as Location[],
        };
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
}

export const db = new EmberlistDB();
