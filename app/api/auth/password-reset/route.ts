/**
 * Password Reset Request API
 * POST /api/auth/password-reset - Request a password reset email
 */

import { getUserByEmail, createSession, updateUser } from '@/lib/storage';
import { generateToken } from '@/lib/encryption';
import {
  PasswordResetRequestSchema,
  validate,
  formatValidationErrors,
} from '@/lib/validation';

// In production, this would be stored in the database with expiry
// For demo, we're using a simple in-memory store
const resetTokens = new Map<string, { userId: string; expiresAt: Date }>();

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate request body
    const validation = validate(PasswordResetRequestSchema, body);
    if (!validation.success) {
      return Response.json(
        { error: formatValidationErrors(validation.errors!) },
        { status: 400 }
      );
    }

    const { email } = validation.data!;

    // Find user by email
    const user = await getUserByEmail(email);

    // Always return success to prevent email enumeration attacks
    // In production, only send email if user exists
    if (user) {
      // Generate reset token
      const resetToken = generateToken(32);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

      // Store reset token (in production, this would be in the database)
      resetTokens.set(resetToken, { userId: user.id, expiresAt });

      // In production, send email here with reset link:
      // await sendPasswordResetEmail(user.email, resetToken);

      console.log(`[Password Reset] Token generated for ${email}: ${resetToken}`);

      // For demo purposes, we'll include the token in the response
      // NEVER do this in production - token should only be sent via email
      if (process.env.NODE_ENV === 'development') {
        return Response.json({
          message: 'Password reset instructions sent to your email',
          // DEV ONLY: Include token for testing
          _devToken: resetToken,
        });
      }
    }

    return Response.json({
      message: 'If an account exists with this email, you will receive password reset instructions',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    return Response.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
}

// Export for use in confirm route
export { resetTokens };
