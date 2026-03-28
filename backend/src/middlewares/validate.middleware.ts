import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware de validation Zod pour body, query et params.
 * Retourne des erreurs de validation formatées (422).
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      return res.status(422).json({
        error: 'Données invalides',
        code:  'VALIDATION_ERROR',
        errors,
      });
    }
    req[source] = result.data;
    next();
  };
}

function formatZodErrors(err: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'root';
    if (!formatted[key]) formatted[key] = [];
    formatted[key].push(issue.message);
  }
  return formatted;
}
