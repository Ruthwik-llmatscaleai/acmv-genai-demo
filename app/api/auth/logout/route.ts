import { deleteSession, getSessionByToken } from '@/lib/storage';

export async function POST(req: Request) {
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

    // Delete the session
    const deleted = await deleteSession(token);

    if (!deleted) {
      return Response.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
