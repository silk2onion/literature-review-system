import type { Paper, LiteratureGroup } from '../types';

const API_BASE_URL = 'http://localhost:5444/api';

export type PaperGroup = LiteratureGroup;

export interface PaperGroupListResponse {
  groups: PaperGroup[];
  total: number;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
}

export const groupsApi = {
  async getGroups(skip: number = 0, limit: number = 100): Promise<PaperGroupListResponse> {
    const response = await fetch(`${API_BASE_URL}/groups/?skip=${skip}&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch groups');
    }
    return response.json();
  },

  async createGroup(data: CreateGroupRequest): Promise<PaperGroup> {
    const response = await fetch(`${API_BASE_URL}/groups/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create group');
    }
    return response.json();
  },

  async updateGroup(id: number, data: UpdateGroupRequest): Promise<PaperGroup> {
    const response = await fetch(`${API_BASE_URL}/groups/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update group');
    }
    return response.json();
  },

  async deleteGroup(id: number): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/groups/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete group');
    }
    return response.json();
  },

  async addPapersToGroup(groupId: number, paperIds: number[]): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/papers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paper_ids: paperIds }),
    });
    if (!response.ok) {
      throw new Error('Failed to add papers to group');
    }
    return response.json();
  },

  async removePapersFromGroup(groupId: number, paperIds: number[]): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/papers`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paper_ids: paperIds }),
    });
    if (!response.ok) {
      throw new Error('Failed to remove papers from group');
    }
    return response.json();
  },

  async getGroupPapers(groupId: number, skip: number = 0, limit: number = 100): Promise<Paper[]> {
    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/papers?skip=${skip}&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch group papers');
    }
    return response.json();
  }
};