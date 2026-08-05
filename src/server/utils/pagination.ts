/**
 * Shared pagination + list-query helpers.
 *
 * Every list endpoint accepts a common set of query params:
 *   ?page=1&pageSize=20&search=...&sortBy=field&sortDir=asc|desc
 *
 * Parsers below coerce/clamp these to safe defaults so services and
 * repositories can trust their inputs. Response envelope is standard
 * across the API surface.
 */

import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  sortBy: z.string().trim().max(50).optional(),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Convert a URLSearchParams (or Request.url) into a PaginationQuery.
 */
export function parsePagination(
  input: URLSearchParams | Request,
): PaginationQuery {
  const params =
    input instanceof URLSearchParams
      ? input
      : new URL(input.url).searchParams;
  return paginationQuerySchema.parse({
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
    search: params.get("search") ?? undefined,
    sortBy: params.get("sortBy") ?? undefined,
    sortDir: params.get("sortDir") ?? undefined,
  });
}

export function paginationSkipTake(p: PaginationQuery): {
  skip: number;
  take: number;
} {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function buildPagedResult<T>(
  items: T[],
  total: number,
  p: PaginationQuery,
): PagedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return {
    items,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages,
    hasMore: p.page < totalPages,
  };
}

/**
 * Build a Prisma orderBy from a whitelist of allowed columns. Falls
 * back to a default when the caller-supplied field isn't allowed.
 * Never trust arbitrary sortBy strings against Prisma directly.
 */
export function buildOrderBy<Field extends string>(
  p: PaginationQuery,
  allowed: readonly Field[],
  fallback: Field,
): Record<Field, "asc" | "desc"> {
  const field: Field =
    p.sortBy && (allowed as readonly string[]).includes(p.sortBy)
      ? (p.sortBy as Field)
      : fallback;
  return { [field]: p.sortDir } as Record<Field, "asc" | "desc">;
}
