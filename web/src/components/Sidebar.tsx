import React from 'react';
import { Star, Calendar } from 'lucide-react';
import type { Project } from '../types/sync';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onProjectSelect: (id: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ projects, activeProjectId, onProjectSelect }) => {
  const favorites = projects.filter(p => p.favorite);
  const otherProjects = projects.filter(p => !p.favorite);

  return (
    <div className="w-64 h-full bg-slate-50 border-r border-slate-200 flex flex-col p-4 gap-6">
      <div className="flex flex-col gap-1">
        <button 
          onClick={() => onProjectSelect(null)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${!activeProjectId ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Calendar size={18} />
          <span>Inbox</span>
        </button>
      </div>

      {favorites.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Star size={12} fill="currentColor" /> Favorites
          </h3>
          {favorites.map(project => (
            <ProjectItem 
              key={project.id} 
              project={project} 
              active={activeProjectId === project.id} 
              onClick={() => onProjectSelect(project.id)} 
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        <h3 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Projects</h3>
        {otherProjects.map(project => (
          <ProjectItem 
            key={project.id} 
            project={project} 
            active={activeProjectId === project.id} 
            onClick={() => onProjectSelect(project.id)} 
          />
        ))}
      </div>
    </div>
  );
};

const ProjectItem: React.FC<{ project: Project; active: boolean; onClick: () => void }> = ({ project, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color || '#cbd5e1' }} />
      <span className="truncate">{project.name}</span>
    </button>
  );
};
