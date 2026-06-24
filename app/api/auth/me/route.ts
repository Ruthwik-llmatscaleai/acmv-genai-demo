import { getSessionByToken } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    // Get session with user
    const session = await getSessionByToken(token);

    if (!session) {
      return Response.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      return Response.json(
        { error: 'Session expired' },
        { status: 401 }
      );
    }

    return Response.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        preferences: session.user.preferences,
        hasAnthropicApiKey: !!session.user.anthropicApiKeyEncrypted,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return Response.json(
      { error: 'Failed to get user' },
      { status: 500 }
    );
  }
}
