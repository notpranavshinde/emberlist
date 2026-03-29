import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskList } from './components/TaskList';
import { db } from './lib/db';
import { SyncEngine } from './lib/syncEngine';
import { DriveSyncService } from './lib/syncService';
import type { SyncPayload } from './types/sync';
import { Upload, Cloud, RefreshCw } from 'lucide-react';

const syncEngine = new SyncEngine();

// TODO: Replace with your actual Google Client ID from Google Cloud Console
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';

function App() {
  const [payload, setPayload] = useState<SyncPayload | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncService = useMemo(() => new DriveSyncService(GOOGLE_CLIENT_ID), []);

  useEffect(() => {
    async function loadData() {
      const data = await db.getPayload();
      setPayload(data);
    }
    loadData();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const remotePayload = JSON.parse(event.target?.result as string) as SyncPayload;
        const localPayload = await db.getPayload();
        
        const mergedPayload = syncEngine.mergePayloads(localPayload, remotePayload);
        await db.savePayload(mergedPayload);
        setPayload(mergedPayload);
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Failed to import JSON. Check console for details.");
      }
    };
    reader.readAsText(file);
  };

  const handleCloudSync = async () => {
    if (GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID')) {
      alert("Please set your Google Client ID in App.tsx first!");
      return;
    }

    setIsSyncing(true);
    try {
      const mergedPayload = await syncService.sync();
      setPayload(mergedPayload);
      alert("Sync Complete!");
    } catch (err) {
      console.error("Sync Failed", err);
      alert("Cloud Sync failed. Check the console for details.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    if (!payload) return;

    const updatedTasks = payload.tasks.map(t => {
      if (t.id === taskId) {
        const isCompleted = t.status === 'COMPLETED';
        return {
          ...t,
          status: (isCompleted ? 'OPEN' : 'COMPLETED') as 'OPEN' | 'COMPLETED',
          completedAt: isCompleted ? null : Date.now(),
          updatedAt: Date.now()
        };
      }
      return t;
    });

    const newPayload = { ...payload, tasks: updatedTasks };
    await db.savePayload(newPayload);
    setPayload(newPayload);
  };

  if (!payload) return <div className="p-8 text-slate-500 italic">Loading your workspace...</div>;

  const activeProject = payload.projects.find(p => p.id === activeProjectId);
  const filteredSections = payload.sections.filter(s => s.projectId === activeProjectId && !s.deletedAt);
  const filteredTasks = payload.tasks.filter(t => t.projectId === activeProjectId && !t.deletedAt);

  return (
    <div className="flex h-screen bg-white text-slate-900 antialiased">
      <Sidebar 
        projects={payload.projects.filter(p => !p.deletedAt)} 
        activeProjectId={activeProjectId}
        onProjectSelect={setActiveProjectId}
      />
      
      <main className="flex-1 relative overflow-hidden">
        <div className="absolute top-4 right-8 z-10 flex gap-2">
          <button 
            onClick={handleCloudSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50`}
          >
            {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
            <span>{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer shadow-sm transition-all active:scale-95">
            <Upload size={16} />
            <span>Import JSON</span>
            <input type="file" className="hidden" onChange={handleImport} accept=".json" />
          </label>
        </div>

        <TaskList 
          tasks={filteredTasks}
          sections={filteredSections}
          onToggleTask={handleToggleTask}
          activeProjectName={activeProject?.name || 'Inbox'}
        />
      </main>
    </div>
  );
}

export default App;
