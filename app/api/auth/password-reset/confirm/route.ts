/**
 * Password Reset Confirmation API
 * POST /api/auth/password-reset/confirm - Reset password with token
 */

import { updateUser, getUserById, deleteUserSessions } from '@/lib/storage';
import { hashPassword } from '@/lib/encryption';
import {
  PasswordResetSchema,
  validate,
  formatValidationErrors,
} from '@/lib/validation';
import { resetTokens } from '../route';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate request body
    const validation = validate(PasswordResetSchema, body);
    if (!validation.success) {
      return Response.json(
        { error: formatValidationErrors(validation.errors!) },
        { status: 400 }
      );
    }

    const { token, newPassword } = validation.data!;

    // Verify reset token
    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return Response.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (tokenData.expiresAt < new Date()) {
      resetTokens.delete(token);
      return Response.json(
        { error: 'Reset token has expired' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await getUserById(tokenData.userId);
    if (!user) {
      resetTokens.delete(token);
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user's password
    await updateUser(user.id, { passwordHash });

    // Invalidate all existing sessions for security
    await deleteUserSessions(user.id);

    // Remove used token
    resetTokens.delete(token);

    return Response.json({
      message: 'Password has been reset successfully. Please login with your new password.',
    });
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    return Response.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
