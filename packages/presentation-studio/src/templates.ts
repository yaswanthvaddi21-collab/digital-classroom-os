/**
 * Templates for New and quick start. A light entry point (`@dcos/presentation-studio/templates`): it imports only the
 * pure model, never the editor, so the app shell can list templates without loading the editor's code.
 */
import { createPresentation } from './create';
import type { PresentationContent } from './types';

export interface PresentationTemplate {
  id: string;
  name: string;
  description: string;
  build: () => PresentationContent;
}

export const presentationTemplates: PresentationTemplate[] = [
  {
    id: 'blank',
    name: 'Blank presentation',
    description: 'A title slide in the Classroom theme, 16:9.',
    build: () => createPresentation('blank'),
  },
  {
    id: 'lecture',
    name: 'Lecture',
    description: 'Six slides: title, learning objectives, a section, a worked example, summary and questions. Classroom theme.',
    build: () => createPresentation('lecture'),
  },
  {
    id: 'project',
    name: 'Project presentation',
    description: 'Problem, approach, timeline, results and next steps for a team project. Sunrise theme.',
    build: () => createPresentation('project'),
  },
  {
    id: 'lab-results',
    name: 'Lab results',
    description: 'Aim, method, a results table, analysis and conclusion. Midnight theme.',
    build: () => createPresentation('lab-results'),
  },
  {
    id: 'class-report',
    name: 'Class report',
    description: 'Introduction, background, findings, conclusion and references. Paper theme.',
    build: () => createPresentation('class-report'),
  },
];
