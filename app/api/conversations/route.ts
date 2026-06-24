import { NextRequest, NextResponse } from 'next/server';
import {
  createConversation,
  getAllConversations,
  toConversationResponse,
} from '@/lib/storage';
import { requireAuth } from '@/lib/auth-middleware';

// GET /api/conversations - List all conversations
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    const conversations = await getAllConversations(user.id);

    return NextResponse.json(conversations.map(c => ({
      id: c.id,
      title: c.title,
      isPinned: c.isPinned,
      isShared: c.isShared,
      model: c.model,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: null,
    })));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  try {
    const body = await req.json();
    const { title, model } = body;

    const conversation = await createConversation({
      title: title || 'New Chat',
      model,
      userId: user.id,
    });

    return NextResponse.json(toConversationResponse(conversation), { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
