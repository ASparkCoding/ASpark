import { create } from 'zustand';
import type { Project } from '@/types';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;

  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),

  addProject: (project) =>
    set({ projects: [...get().projects, project] }),

  updateProject: (id, updates) =>
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
      currentProject:
        get().currentProject?.id === id
          ? { ...get().currentProject!, ...updates }
          : get().currentProject,
    }),

  removeProject: (id) =>
    set({
      projects: get().projects.filter((p) => p.id !== id),
      currentProject:
        get().currentProject?.id === id ? null : get().currentProject,
    }),

  setIsLoading: (loading) => set({ isLoading: loading }),
}));
