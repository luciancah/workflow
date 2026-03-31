import { NextResponse } from 'next/server';

export function toHttpDbError(error: unknown) {
  const err = error as { code?: string; message?: string };

  const knownNetworkCodes = [
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ];

  if (typeof error === 'object' && err && knownNetworkCodes.includes(String(err.code))) {
    return NextResponse.json(
      {
        error: 'Database network error',
        code: err.code,
        detail: err.message,
        hint: 'Verify that the production DATABASE_URL host is reachable from Vercel and that the database accepts external connections.',
      },
      { status: 503 },
    );
  }

  if (error instanceof Error && error.message?.toLowerCase().includes('ssl')) {
    return NextResponse.json(
      {
        error: 'Database SSL configuration error',
        detail: error.message,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: 'API failure',
      detail: error instanceof Error ? error.message : 'Unknown error',
    },
    { status: 500 },
  );
}
