import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

// Phase 11 standard error shape: {error_code, message, request_id}
export class ApiError extends Error {
  constructor(
    public status: number,
    public errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

export function apiErrorResponse(err: unknown): NextResponse {
  const requestId = randomUUID();
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error_code: err.errorCode, message: err.message, request_id: requestId },
      { status: err.status },
    );
  }
  console.error(`[${requestId}]`, err);
  return NextResponse.json(
    { error_code: "internal_error", message: "Unexpected server error", request_id: requestId },
    { status: 500 },
  );
}
