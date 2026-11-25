import winston from 'winston';
import { env } from './env';
import { currentRequestId } from '../utils/requestContext';

/** Ajoute l'identifiant de corrélation de la requête en cours à chaque entrée de journal. */
const withRequestId = winston.format((info) => {
  const requestId = currentRequestId();
  if (requestId && !info.requestId) info.requestId = requestId;
  return info;
});

const format =
  env.NODE_ENV === 'production'
    ? winston.format.combine(withRequestId(), winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        withRequestId(),
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      );

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format,
  transports: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});
