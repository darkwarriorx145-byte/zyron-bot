const { AuditLogEvent } = require('discord.js');

/**
 * Audit log helper to safely resolve recent executors
 */
class AuditLogger {
  /**
   * Fetches the latest audit log entry matching the action type within a time window
   */
  static async getLatestEntry(guild, actionType, timeWindowMs = 6000) {
    try {
      // Small sleep to ensure Discord's audit log entry is indexed
      await new Promise(r => setTimeout(r, 600));

      const logs = await guild.fetchAuditLogs({
        type: actionType,
        limit: 1
      });

      const entry = logs.entries.first();
      if (!entry) return null;

      const elapsed = Date.now() - entry.createdTimestamp;
      if (elapsed <= timeWindowMs) {
        return entry;
      }
      return null;
    } catch (error) {
      // Missing permissions or Discord API error
      return null;
    }
  }
}

module.exports = AuditLogger;
