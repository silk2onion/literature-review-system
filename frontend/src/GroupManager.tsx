import { useEffect, useState } from 'react';
import { groupsApi } from './api/groups';
import './GroupManager.css';
import type { LiteratureGroup } from './types';

interface GroupManagerProps {
  onSelectGroup?: (group: LiteratureGroup) => void;
  selectedGroupId?: number | null;
}

export default function GroupManager({ onSelectGroup, selectedGroupId }: GroupManagerProps) {
  const [groups, setGroups] = useState<LiteratureGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await groupsApi.getGroups();
      setGroups(data.groups);
    } catch (err) {
      setError('加载分组失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await groupsApi.createGroup({
        name: newGroupName,
        description: newGroupDesc,
      });
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateForm(false);
      fetchGroups();
    } catch (err) {
      alert('创建分组失败');
      console.error(err);
    }
  };

  const handleDeleteGroup = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个分组吗？分组内的文献不会被删除。')) return;
    try {
      await groupsApi.deleteGroup(id);
      if (selectedGroupId === id && onSelectGroup) {
        // If the deleted group was selected, deselect it (logic handled by parent usually, but good to know)
      }
      fetchGroups();
    } catch (err) {
      alert('删除分组失败');
      console.error(err);
    }
  };

  return (
    <div className="group-manager">
      <div className="group-manager-header">
        <h3>文献分组</h3>
        <button 
          className="icon-button" 
          onClick={() => setShowCreateForm(!showCreateForm)}
          title="新建分组"
        >
          +
        </button>
      </div>

      {showCreateForm && (
        <div className="group-create-form">
          <input
            type="text"
            placeholder="分组名称"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="group-input"
          />
          <input
            type="text"
            placeholder="描述 (可选)"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            className="group-input"
          />
          <div className="group-form-actions">
            <button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>确认</button>
            <button onClick={() => setShowCreateForm(false)}>取消</button>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      
      <div className="group-list">
        {loading && groups.length === 0 ? (
          <div className="loading-text">加载中...</div>
        ) : (
          groups.map(group => (
            <div 
              key={group.id} 
              className={`group-item ${selectedGroupId === group.id ? 'active' : ''}`}
              onClick={() => onSelectGroup?.(group)}
            >
              <div className="group-info">
                <span className="group-name">{group.name}</span>
                <span className="group-count">{group.paper_count || 0} 篇</span>
              </div>
              <button 
                className="delete-group-btn"
                onClick={(e) => handleDeleteGroup(group.id, e)}
                title="删除分组"
              >
                ×
              </button>
            </div>
          ))
        )}
        {!loading && groups.length === 0 && !error && (
          <div className="empty-text">暂无分组</div>
        )}
      </div>
    </div>
  );
}