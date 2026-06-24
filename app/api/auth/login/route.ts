import { getUserByEmail, createSession, updateUser } from '@/lib/storage';
import { verifyPassword, generateToken } from '@/lib/encryption';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return Response.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await getUserByEmail(email);
    if (!user) {
      return Response.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return Response.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session (30 day expiry)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await createSession({
      userId: user.id,
      token,
      expiresAt,
    });

    // Update last login
    await updateUser(user.id, { lastLogin: new Date() });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences,
      },
      token,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { error: 'Failed to login' },
      { status: 500 }
    );
  }
}
