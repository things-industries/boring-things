import type { EventKind } from '../interfaces/event.interface';
import type { IconBadgeTone } from '../interfaces/icon-badge.interface';

export const taskBadges: Record<EventKind, { icon: string; tone: IconBadgeTone }> = {
  CLEANING: { icon: 'taskCleaning', tone: 'info' },
  INSPECTION: { icon: 'taskInspection', tone: 'neutral' },
  REPAIR: { icon: 'taskRepair', tone: 'neutral' },
  REPLACEMENT: { icon: 'taskReplacement', tone: 'neutral' },
  SERVICE: { icon: 'taskService', tone: 'neutral' },
  OTHER: { icon: 'taskOther', tone: 'neutral' },
};
