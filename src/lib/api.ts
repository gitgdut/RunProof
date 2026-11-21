import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && value.constructor?.name === "Decimal") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

export function ok(data: unknown, options: { status?: number; requestId: string; pagination?: Pagination }) {
  return NextResponse.json({
    success: true,
    data: jsonValue(data),
    meta: {
      requestId: options.requestId,
      timestamp: new Date().toISOString(),
      ...(options.pagination ? { pagination: options.pagination } : {}),
    },
  }, { status: options.status ?? 200, headers: { "Cache-Control": "no-store" } });
}

export async function respond(handler: (requestId: string) => Promise<NextResponse>) {
  const requestId = randomUUID();
  try {
    return await handler(requestId);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() }, meta: { requestId, timestamp: new Date().toISOString() } }, { status: 400 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message, ...(error.details ? { details: jsonValue(error.details) } : {}) }, meta: { requestId, timestamp: new Date().toISOString() } }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ success: false, error: { code: "DUPLICATE_RESOURCE", message: "This resource has already been submitted" }, meta: { requestId, timestamp: new Date().toISOString() } }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" }, meta: { requestId, timestamp: new Date().toISOString() } }, { status: 404 });
      }
    }
    console.error(`[${requestId}] Unhandled API error`, error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" }, meta: { requestId, timestamp: new Date().toISOString() } }, { status: 500 });
  }
}

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

export function pageMeta(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
