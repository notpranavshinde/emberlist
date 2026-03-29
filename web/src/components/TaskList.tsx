import React from 'react';
import { CheckCircle2, MoreHorizontal } from 'lucide-react';
import type { Task, Section } from '../types/sync';

interface TaskListProps {
  tasks: Task[];
  sections: Section[];
  onToggleTask: (taskId: string) => void;
  activeProjectName: string;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, sections, onToggleTask, activeProjectName }) => {
  const tasksBySection = sections.reduce((acc, section) => {
    acc[section.id] = tasks.filter(t => t.sectionId === section.id);
    return acc;
  }, {} as Record<string, Task[]>);

  const unsectionedTasks = tasks.filter(t => !t.sectionId);

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <header className="p-8 pb-4">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{activeProjectName}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-12">
        <div className="flex flex-col gap-1 mb-8">
          {unsectionedTasks.map(task => (
            <TaskItem key={task.id} task={task} onToggle={() => onToggleTask(task.id)} />
          ))}
        </div>

        {sections.map(section => (
          <div key={section.id} className="flex flex-col gap-1 mb-8">
            <h4 className="text-sm font-bold text-slate-900 mb-2 border-b border-slate-100 pb-2">{section.name}</h4>
            {tasksBySection[section.id]?.map(task => (
              <TaskItem key={task.id} task={task} onToggle={() => onToggleTask(task.id)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const TaskItem: React.FC<{ task: Task; onToggle: () => void }> = ({ task, onToggle }) => {
  const isCompleted = task.status === 'COMPLETED';
  
  const priorityColors: Record<string, string> = {
    'P1': 'border-red-500 text-red-500',
    'P2': 'border-orange-500 text-orange-500',
    'P3': 'border-blue-500 text-blue-500',
    'P4': 'border-slate-300 text-slate-400',
  };

  return (
    <div className="group flex items-start gap-3 py-3 px-2 border-b border-slate-50 hover:bg-slate-50 transition-colors">
      <button 
        onClick={onToggle}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted ? 'bg-slate-400 border-slate-400' : (priorityColors[task.priority] || priorityColors['P4'])}`}
      >
        {isCompleted && <CheckCircle2 size={12} className="text-white" />}
      </button>
      
      <div className="flex-1 flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </span>
        {task.description && (
          <span className="text-xs text-slate-500 truncate mt-0.5">{task.description}</span>
        )}
      </div>

      <button className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 transition-opacity">
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
};
