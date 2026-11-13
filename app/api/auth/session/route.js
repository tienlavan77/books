/* Provides module implementation and exported declarations for route.js. */

import { NextResponse } from "next/server.js";
import { getRequestOwnerSession, getConfiguredOwnerConfig } from "../../../../lib/auth.js";

/* Executes documented symbol logic in route.js. */
export async function GET(request) {
  const session = getRequestOwnerSession(request);
  const ownerConfig = getConfiguredOwnerConfig();

  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        ownerHint: {
          username: ownerConfig.username,
          displayName: ownerConfig.displayName,
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    owner: session,
  });
}
