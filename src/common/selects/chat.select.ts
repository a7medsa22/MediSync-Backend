import { participantSelect } from './participant.select';

export const lastMessageSelect = {
  messages: {
    take: 1,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      messageType: true,
      senderId: true,
      createdAt: true,
      isRead: true,
    },
  },
} as const;

export const connectionSelect = {
  id: true,
  status: true,
  lastMessageAt: true,
  unreadCount: true,
  doctor: { select: participantSelect },
  patient: { select: participantSelect },
} as const;

export const chatDetailsSelect = {
  id: true,
  connection: {
    select: {
      id: true,
      doctor: { select: participantSelect },
      patient: { select: participantSelect },
    },
  },
} as const;

export const chatDetailsSelectWithStatus = {
  id: true,
  connection: {
    select: {
      id: true,
      status: true,
      doctor: { select: participantSelect },
      patient: { select: participantSelect },
    },
  },
} as const;
