/**
 * Minimal structured logger.
 *
 * Deliberately dependency-free so it works in Edge runtime too.
 * In production we'd swap this for pino/winston without touching call sites.
 */

import { isProd } from "./env";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  };
  const line = isProd ? JSON.stringify(entry) : formatDev(level, message, fields);
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(line);
}

function formatDev(level: LogLevel, message: string, fields?: LogFields): string {
  const tag = `[${level.toUpperCase()}]`;
  if (!fields || Object.keys(fields).length === 0) return `${tag} ${message}`;
  return `${tag} ${message} ${JSON.stringify(fields)}`;
}

export const logger = {
  debug: (message: string, fields?: LogFields) => {
    if (!isProd) emit("debug", message, fields);
  },
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
