import { NextRequest, NextResponse } from 'next/server';
import {
  getConversation,
  updateConversation,
  deleteConversation,
  toConversationResponse,
  toUIMessage,
} from '@/lib/storage';
import { requireAuth } from '@/lib/auth-middleware';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/conversations/[id] - Get single conversation with messages
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    const { id } = await params;
    const conversation = await getConversation(id);

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify the conversation belongs to the authenticated user
    if (conversation.userId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to access this conversation' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ...toConversationResponse(conversation),
      messages: conversation.messages.map(toUIMessage),
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

// PATCH /api/conversations/[id] - Update conversation
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    const { id } = await params;

    // Verify ownership before updating
    const existing = await getConversation(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to update this conversation' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, isPinned, isShared, model } = body;

    const conversation = await updateConversation(id, {
      title,
      isPinned,
      isShared,
      model,
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Failed to update conversation' },
        { status: 500 }
      );
    }

    return NextResponse.json(toConversationResponse(conversation));
  } catch (error) {
    console.error('Error updating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id] - Delete conversation
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    const { id } = await params;

    // Verify ownership before deleting
    const existing = await getConversation(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this conversation' },
        { status: 403 }
      );
    }

    const deleted = await deleteConversation(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete conversation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
