export interface NotificationMetadata {
  actionUrl: string;
  targetId?: string;
  targetType?: 'doctor' | 'patient' | 'appointment' | 'system';
  [key: string]: any;
}
