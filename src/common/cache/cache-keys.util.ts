/**
 * Centralized Cache Key Strategy
 * Pattern: {domain}:{resource}:{identifier}:{sub-identifier}
 */
export const CacheKeys = {
  // User domain
  user: {
    snapshot: (id: string) => `user:snapshot:${id}`,
    profile: (id: string) => `user:profile:${id}`,
    sessions: (id: string) => `user:sessions:${id}`,
  },

  // Appointment domain
  appointment: {
    details: (id: string) => `appointment:details:${id}`,
    list: (doctorId: string, date: string) =>
      `appointment:list:dr:${doctorId}:${date}`,
  },

  // Notification domain
  notification: {
    unreadCount: (userId: string) => `notification:unread:${userId}`,
    recent: (userId: string) => `notification:recent:${userId}`,
  },

  // Specialization domain
  specialization: {
    list: () => `specialization:all`,
    details: (id: string) => `specialization:details:${id}`,
  },

  // Prescription domain
  prescription: {
    interaction: (drugName: string) =>
      `prescription:interaction:${drugName.toLowerCase()}`,
    patientList: (patientId: string) =>
      `prescription:list:patient:${patientId}`,
    templateList: (doctorId: string) => `prescription:templates:dr:${doctorId}`,
  },

  // Analytics domain
  analytics: {
    doctorDaily: (id: string, date: string) =>
      `analytics:doctor:${id}:daily:${date}`,
    systemStats: () => `analytics:system:stats`,
  },

  // Global helpers
  build: (...parts: (string | number)[]) => parts.join(':'),
};
