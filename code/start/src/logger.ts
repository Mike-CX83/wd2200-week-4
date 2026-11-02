import { mkdirSync } from 'node:fs';
import winston from 'winston';

export function createLogger(directory: string, silent = false) {
  mkdirSync(directory, { recursive: true });
  return winston.createLogger({
    level: 'info',
    silent,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: `${directory}/combined.log` }),
      new winston.transports.File({ filename: `${directory}/error.log`, level: 'error' }),
    ],
  });
}
