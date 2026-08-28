import React, { useState, useEffect } from 'react';
import { CheckSquare, Plus, Bot, Calendar, CheckCircle2, Circle, ChevronRight, Timer, Search, X } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId?: string;
  agentName?: string;
  source: 'autonomous' | 'manual' | 'agent';
  dueDate?: Date;
  createdAt: Date;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const agents = [
  { id: 'agent-1', name: 'Orchestrator', type: 'ai' },
  { id: 'agent-2', name: 'Researcher', type: 'ai' },
  { id: 'agent-3', name: 'CodeWarden', type: 'ai' },
  { id: 'agent-4', name: 'DataAnalyst', type: 'ai' },
  { id: 'agent-5', name: 'ScribeWarden', type: 'ai' },
];

export const TasksDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>(() => coreBridge.getTasks());
  useEffect(() => { coreBridge.saveTasks(tasks); }, [tasks]);
  const [filter, setFilter] = useState<'all' | 'autonomous' | 'manual' | 'agent'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskItem['priority']>('medium');
  const [newTaskSource, setNewTaskSource] = useState<TaskItem['source']>('manual');

  const filteredTasks = tasks.filter(t => {
    const matchesFilter = filter === 'all' || t.source === filter;
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesStatus && matchesSearch;
  });

  const handleStatusToggle = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const next: Record<string, TaskItem['status']> = { todo: 'in_progress', in_progress: 'completed', completed: 'todo' };
      return { ...t, status: next[t.status], completedAt: next[t.status] === 'completed' ? new Date() : undefined };
    }));
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    const task: TaskItem = {
      id: generateId(),
      title: newTaskTitle,
      description: newTaskDesc,
      status: 'todo',
      priority: newTaskPriority,
      source: newTaskSource,
      createdAt: new Date(),
    };
    setTasks(prev => [task, ...prev]);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskPriority('medium');
    setNewTaskSource('manual');
    setShowNewTask(false);
  };

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    autonomous: tasks.filter(t => t.source === 'autonomous').length,
    agent: tasks.filter(t => t.source === 'agent').length,
    manual: tasks.filter(t => t.source === 'manual').length,
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <CheckSquare size={22} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white font-orbitron">TASKS</h2>
              <span className="text-[9px] text-stonic-textDim tracking-[0.2em] uppercase font-mono-tech">Multi-Agent Task Management</span>
            </div>
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            className="px-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-400 hover:bg-amber-400/20 transition-all flex items-center gap-2 font-mono-tech text-[10px] font-bold tracking-wider"
          >
            <Plus size={14} /> NEW TASK
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-6 gap-2 mb-3">
          {[
            { label: 'Total', value: stats.total, color: 'white' },
            { label: 'In Progress', value: stats.inProgress, color: 'amber' },
            { label: 'Completed', value: stats.completed, color: 'green' },
            { label: 'Autonomous', value: stats.autonomous, color: 'purple' },
            { label: 'Agent', value: stats.agent, color: 'cyan' },
            { label: 'Manual', value: stats.manual, color: 'slate' },
          ].map(s => (
            <div key={s.label} className="bg-stonic-card border border-stonic-b1 rounded-xl p-2.5 text-center">
              <span className={`text-lg font-bold text-${s.color === 'white' ? 'white' : s.color + '-400'} font-mono-tech block`}>{s.value}</span>
              <span className="text-[7px] text-stonic-textDim font-mono-tech tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1 bg-stonic-card border border-stonic-b1 rounded-lg p-1">
            {(['all', 'autonomous', 'agent', 'manual'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-md text-[9px] font-mono-tech tracking-wider transition-all ${
                filter === f ? 'bg-amber-400/10 text-amber-400' : 'text-stonic-textMuted hover:text-stonic-text'
              }`}>{f === 'all' ? 'ALL' : f.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-stonic-card border border-stonic-b1 rounded-lg p-1">
            {(['all', 'todo', 'in_progress', 'completed'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-md text-[9px] font-mono-tech tracking-wider transition-all ${
                statusFilter === f ? 'bg-amber-400/10 text-amber-400' : 'text-stonic-textMuted hover:text-stonic-text'
              }`}>{f === 'all' ? 'ALL' : f.replace('_', ' ').toUpperCase()}</button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tasks..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-card border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-amber-400/40" />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 bg-stonic-card border border-stonic-b1 rounded-xl overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-stonic-textDim gap-2">
                <CheckSquare size={32} className="opacity-20" />
                <span className="text-[10px] font-mono-tech">No tasks found</span>
              </div>
            ) : (
              filteredTasks.map(task => {
                const isSelected = selectedTask?.id === task.id;
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(isSelected ? null : task)}
                    className={`flex items-start gap-3 p-3 border-b border-stonic-b1/30 hover:bg-stonic-hover/20 transition-colors cursor-pointer ${
                      isSelected ? 'bg-amber-400/5 border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    <button onClick={(e) => { e.stopPropagation(); handleStatusToggle(task.id); }} className="mt-0.5 shrink-0">
                      {task.status === 'completed' ? <CheckCircle2 size={16} className="text-green-400" /> :
                       task.status === 'in_progress' ? <Timer size={16} className="text-amber-400" /> :
                       <Circle size={16} className="text-stonic-textDim" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold font-mono-tech ${task.status === 'completed' ? 'text-stonic-textDim line-through' : 'text-stonic-text'}`}>{task.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono-tech ${
                          task.priority === 'critical' ? 'bg-red-500/10 text-red-400' :
                          task.priority === 'high' ? 'bg-amber-500/10 text-amber-400' :
                          task.priority === 'medium' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>{task.priority}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono-tech ${
                          task.source === 'autonomous' ? 'bg-purple-500/10 text-purple-400' :
                          task.source === 'agent' ? 'bg-cyan-500/10 text-cyan-400' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>{task.source}</span>
                      </div>
                      <p className="text-[8px] text-stonic-textMuted mt-0.5 truncate">{task.description}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-3 text-[8px] text-stonic-textDim font-mono-tech">
                      {task.agentName && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stonic-surface border border-stonic-b1">
                          <Bot size={10} />
                          <span>{task.agentName}</span>
                        </div>
                      )}
                      {task.dueDate && <span className="flex items-center gap-1"><Calendar size={10} />{task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>
                    <ChevronRight size={12} className={`text-stonic-textDim transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <div className="w-[320px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-stonic-text font-mono-tech tracking-wider">TASK DETAILS</span>
            <button onClick={() => setSelectedTask(null)} className="p-1 rounded hover:bg-stonic-hover text-stonic-textMuted"><X size={14} /></button>
          </div>
          <h3 className="text-sm font-bold text-white font-mono-tech mb-2">{selectedTask.title}</h3>
          <p className="text-[10px] text-stonic-textMuted mb-4 leading-relaxed">{selectedTask.description}</p>
          <div className="space-y-2 text-[9px] font-mono-tech">
            <div className="flex justify-between"><span className="text-stonic-textDim">Status</span><span className={`${selectedTask.status === 'completed' ? 'text-green-400' : selectedTask.status === 'in_progress' ? 'text-amber-400' : 'text-stonic-textMuted'}`}>{selectedTask.status.replace('_', ' ').toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Priority</span><span className={selectedTask.priority === 'critical' ? 'text-red-400' : 'text-stonic-textMuted'}>{selectedTask.priority.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Source</span><span className="text-stonic-textMuted">{selectedTask.source.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Agent</span><span className="text-stonic-textMuted">{selectedTask.agentName || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Created</span><span className="text-stonic-textMuted">{selectedTask.createdAt.toLocaleString()}</span></div>
          </div>
          <div className="mt-auto pt-3 border-t border-stonic-b1">
            <div className="text-[8px] text-stonic-textDim font-mono-tech mb-2">ASSIGN AGENT</div>
            <div className="space-y-1">
              {agents.map(agent => (
                <button key={agent.id} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[9px] font-mono-tech transition-all ${
                  selectedTask.agentId === agent.id ? 'bg-amber-400/10 text-amber-400 border border-amber-400/30' : 'text-stonic-textMuted hover:bg-stonic-hover'
                }`}>
                  <Bot size={12} /> {agent.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowNewTask(false)}>
          <div className="w-[500px] bg-stonic-card border border-amber-400/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white font-mono-tech tracking-wider">NEW TASK</h3>
              <button onClick={() => setShowNewTask(false)} className="p-1 rounded-md hover:bg-stonic-hover text-stonic-textMuted"><X size={16} /></button>
            </div>
            <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title" className="w-full mb-3 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[11px] text-stonic-text font-mono-tech focus:outline-none focus:border-amber-400/40" />
            <textarea value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} placeholder="Task description..." rows={3} className="w-full mb-3 bg-stonic-surface/50 border border-stonic-b1 rounded-md p-3 text-[10px] text-stonic-text font-mono-tech resize-none focus:outline-none focus:border-amber-400/40" />
            <div className="flex gap-3 mb-3">
              <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as any)} className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none">
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical Priority</option>
              </select>
              <select value={newTaskSource} onChange={e => setNewTaskSource(e.target.value as any)} className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-md px-3 py-2 text-[10px] text-stonic-text font-mono-tech focus:outline-none">
                <option value="manual">Manual</option>
                <option value="agent">Agent-Assigned</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </div>
            <button onClick={handleAddTask} className="w-full py-2 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-400 font-mono-tech text-[10px] font-bold tracking-wider hover:bg-amber-400/30 transition-all">CREATE TASK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksDashboard;
