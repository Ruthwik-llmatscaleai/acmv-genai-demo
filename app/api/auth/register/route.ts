import { createUser, getUserByEmail, createSession } from '@/lib/storage';
import { hashPassword, generateToken } from '@/lib/encryption';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password) {
      return Response.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return Response.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email,
      passwordHash,
      name,
    });

    // Create session (30 day expiry)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await createSession({
      userId: user.id,
      token,
      expiresAt,
    });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
      expiresAt: expiresAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return Response.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
