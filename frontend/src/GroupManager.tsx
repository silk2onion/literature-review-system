import { useEffect, useState } from 'react';
import { groupsApi } from './api/groups';
import './GroupManager.css';
import type { LiteratureGroup } from './types';

interface GroupManagerProps {
  onSelectGroup?: (group: LiteratureGroup) => void;
  selectedGroupId?: number | null;
  /** 点击分组名称时导航到文献库并预设分组过滤 */
  onNavigateToLibrary?: (groupId: number) => void;
}

export default function GroupManager({ onSelectGroup, selectedGroupId, onNavigateToLibrary }: GroupManagerProps) {
  const [groups, setGroups] = useState<LiteratureGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // A1: 编辑状态
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // A2: 展开详情
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<LiteratureGroup | null>(null);

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
        // If the deleted group was selected, deselect it
      }
      fetchGroups();
    } catch (err) {
      alert('删除分组失败');
      console.error(err);
    }
  };

  // A1: 开始编辑
  const handleStartEdit = (group: LiteratureGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditDesc(group.description || '');
  };

  // A1: 保存编辑
  const handleSaveEdit = async (groupId: number) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await groupsApi.updateGroup(groupId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      setEditingGroupId(null);
      fetchGroups();
    } catch (err) {
      alert('更新分组失败');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // A1: 取消编辑
  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroupId(null);
  };

  // A2: 切换展开详情
  const handleToggleExpand = async (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      setDetailData(null);
      return;
    }
    setExpandedGroupId(groupId);
    setDetailLoading(true);
    try {
      const res = await fetch(`http://localhost:5444/api/groups/${groupId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiteratureGroup = await res.json();
      setDetailData(data);
    } catch (err) {
      console.error('获取分组详情失败:', err);
      setDetailData(null);
    } finally {
      setDetailLoading(false);
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
            <div key={group.id} className="group-item-wrapper">
              <div
                className={`group-item ${selectedGroupId === group.id ? 'active' : ''}`}
                onClick={() => onSelectGroup?.(group)}
              >
                {editingGroupId === group.id ? (
                  /* A1: 内联编辑模式 */
                  <div className="group-edit-form" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="group-input group-edit-input"
                      placeholder="分组名称"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(group.id);
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="group-input group-edit-input"
                      placeholder="描述 (可选)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(group.id);
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                    />
                    <div className="group-form-actions">
                      <button onClick={() => handleSaveEdit(group.id)} disabled={!editName.trim() || saving}>
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button onClick={handleCancelEdit}>取消</button>
                    </div>
                  </div>
                ) : (
                  /* 正常显示模式 */
                  <>
                    <div className="group-info">
                      <span className="group-name">{group.name}</span>
                      <span className="group-count">{group.paper_count || 0} 篇</span>
                    </div>
                    <div className="group-actions">
                      <button
                        className="group-action-btn"
                        onClick={(e) => handleToggleExpand(group.id, e)}
                        title="展开详情"
                      >
                        {expandedGroupId === group.id ? '▾' : '▸'}
                      </button>
                      <button
                        className="group-action-btn edit-btn"
                        onClick={(e) => handleStartEdit(group, e)}
                        title="编辑分组"
                      >
                        ✏️
                      </button>
                      {onNavigateToLibrary && (
                        <button
                          className="group-action-btn navigate-btn"
                          onClick={(e) => { e.stopPropagation(); onNavigateToLibrary(group.id); }}
                          title="在文献库中查看"
                        >
                          📚
                        </button>
                      )}
                      <button
                        className="delete-group-btn"
                        onClick={(e) => handleDeleteGroup(group.id, e)}
                        title="删除分组"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* A2: 展开的详情面板 */}
              {expandedGroupId === group.id && (
                <div className="group-detail-panel">
                  {detailLoading ? (
                    <span className="detail-loading">加载中...</span>
                  ) : detailData ? (
                    <>
                      {detailData.description && (
                        <div className="detail-row">
                          <span className="detail-label">描述</span>
                          <span className="detail-value">{detailData.description}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="detail-label">文献数</span>
                        <span className="detail-value">{detailData.paper_count ?? 0} 篇</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">创建于</span>
                        <span className="detail-value">{new Date(detailData.created_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">更新于</span>
                        <span className="detail-value">{new Date(detailData.updated_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </>
                  ) : (
                    <span className="detail-loading">无数据</span>
                  )}
                </div>
              )}
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