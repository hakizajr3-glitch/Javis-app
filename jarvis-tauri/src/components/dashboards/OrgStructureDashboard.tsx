import React, { useState } from 'react';
import { Building2, Users, Shield, ChevronRight, ChevronDown, GitBranch, User, Crown, Star } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface OrgNode {
  id: string;
  name: string;
  type: 'department' | 'team' | 'role';
  children: OrgNode[];
  members?: number;
  leadName?: string;
}

interface OrgRole {
  id: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
}

const orgStructure: OrgNode = coreBridge.getOrgStructure();

const roles: OrgRole[] = coreBridge.getOrgRoles();

const OrgTreeNode: React.FC<{ node: OrgNode; depth: number }> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg transition-all text-left group ${
          depth === 0 ? 'bg-purple-400/5 border border-purple-400/20' :
          depth === 1 ? 'hover:bg-stonic-hover/20' :
          'hover:bg-stonic-hover/10 ml-4'
        }`}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={12} className="text-stonic-textDim" /> : <ChevronRight size={12} className="text-stonic-textDim" />
        ) : (
          <span className="w-3" />
        )}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
          node.type === 'department' ? 'bg-blue-500/10 border border-blue-400/30' :
          node.type === 'team' ? 'bg-green-500/10 border border-green-400/30' :
          'bg-amber-500/10 border border-amber-400/30'
        }`}>
          {node.type === 'department' ? <Building2 size={13} className="text-blue-400" /> :
           node.type === 'team' ? <Users size={13} className="text-green-400" /> :
           <User size={13} className="text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-stonic-text font-mono-tech">{node.name}</span>
          <span className="text-[7px] text-stonic-textDim ml-2 uppercase font-mono-tech">{node.type}</span>
        </div>
        {node.members && <span className="text-[8px] text-stonic-textDim font-mono-tech">{node.members} members</span>}
        {node.leadName && (
          <div className="flex items-center gap-1 text-[8px] text-amber-400 font-mono-tech">
            <Crown size={10} /> {node.leadName}
          </div>
        )}
      </button>
      {hasChildren && expanded && (
        <div className="ml-3 pl-3 border-l border-stonic-b1/50">
          {node.children.map(child => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const OrgStructureDashboard: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<OrgRole | null>(null);

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      {/* Org Chart */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-blue-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <GitBranch size={22} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white font-orbitron">ORGANIZATION</h2>
              <span className="text-[9px] text-stonic-textDim tracking-[0.2em] uppercase font-mono-tech">Structure &amp; Roles</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-400/5 border border-blue-400/20">
            <span className="text-[10px] text-blue-400 font-mono-tech tracking-wider">4 DEPTS • 8 TEAMS • {roles.length} ROLES</span>
          </div>
        </div>

        <div className="flex-1 bg-stonic-card border border-stonic-b1 rounded-xl p-4 overflow-y-auto">
          <OrgTreeNode node={orgStructure} depth={0} />
        </div>
      </div>

      {/* Roles Panel */}
      <div className="w-[320px] shrink-0 flex flex-col gap-3 min-h-0">
        <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-4 flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} className="text-amber-400" />
            <span className="text-[10px] font-bold text-stonic-text font-mono-tech tracking-wider">ROLES &amp; PERMISSIONS</span>
          </div>
          <div className="space-y-1.5">
            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left p-2.5 rounded-lg transition-all ${
                  selectedRole?.id === role.id
                    ? 'bg-amber-400/10 border border-amber-400/30'
                    : 'hover:bg-stonic-hover/20 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-400/30 flex items-center justify-center">
                      {role.level >= 100 ? <Crown size={12} className="text-amber-400" /> :
                       role.level >= 80 ? <Star size={12} className="text-amber-400" /> :
                       role.level >= 50 ? <User size={12} className="text-amber-400" /> :
                       <User size={12} className="text-stonic-textDim" />}
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-stonic-text font-mono-tech">{role.name}</span>
                      <p className="text-[7px] text-stonic-textMuted">{role.description}</p>
                    </div>
                  </div>
                  <span className="text-[8px] text-stonic-textDim font-mono-tech">Lvl {role.level}</span>
                </div>
                {selectedRole?.id === role.id && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.permissions.map(perm => (
                      <span key={perm} className="px-1.5 py-0.5 rounded bg-amber-400/5 border border-amber-400/20 text-[7px] text-amber-400 font-mono-tech">{perm}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Org Stats */}
        <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3">
          <div className="grid grid-cols-2 gap-2 text-[8px]">
            {[
              { label: 'Departments', value: '4', icon: Building2 },
              { label: 'Teams', value: '8', icon: Users },
              { label: 'Members', value: '14', icon: User },
              { label: 'Roles', value: '4', icon: Shield },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 p-2 rounded-lg bg-stonic-surface/50 border border-stonic-b1">
                <s.icon size={12} className="text-blue-400" />
                <div>
                  <span className="text-[9px] font-bold text-white block">{s.value}</span>
                  <span className="text-[7px] text-stonic-textDim">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgStructureDashboard;
