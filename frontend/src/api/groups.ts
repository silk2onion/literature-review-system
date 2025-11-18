import type { Paper, LiteratureGroup, GroupPaper } from '../types';

export type { LiteratureGroup, GroupPaper };

export interface GroupCreate {
  name: string;
  description?: string;
}

export interface GroupUpdate {
  name?: string;
  description?: string;
}

const API_BASE = 'http://127.0.0.1:5444/api/groups';

export const groupsApi = {
  // 获取分组列表
  getGroups: async (skip = 0, limit = 100): Promise<LiteratureGroup[]> => {
    const response = await fetch(`${API_BASE}/?skip=${skip}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch groups');
    return response.json();
  },

  // 创建分组
  createGroup: async (data: GroupCreate): Promise<LiteratureGroup> => {
    const response = await fetch(`${API_BASE}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create group');
    return response.json();
  },

  // 更新分组
  updateGroup: async (id: number, data: GroupUpdate): Promise<LiteratureGroup> => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update group');
    return response.json();
  },

  // 删除分组
  deleteGroup: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete group');
  },

  // 向分组添加文献
  addPapersToGroup: async (groupId: number, paperIds: number[]): Promise<GroupPaper[]> => {
    const response = await fetch(`${API_BASE}/${groupId}/papers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paperIds),
    });
    if (!response.ok) throw new Error('Failed to add papers to group');
    return response.json();
  },

  // 从分组移除文献
  removePapersFromGroup: async (groupId: number, paperIds: number[]): Promise<void> => {
    const response = await fetch(`${API_BASE}/${groupId}/papers`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paperIds),
    });
    if (!response.ok) throw new Error('Failed to remove papers from group');
  },

  // 获取分组内的文献
  getGroupPapers: async (groupId: number, skip = 0, limit = 100): Promise<Paper[]> => {
    const response = await fetch(`${API_BASE}/${groupId}/papers?skip=${skip}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch group papers');
    return response.json();
  },
};