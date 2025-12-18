import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
};

const chats: ChatSession[] = [];

export async function GET() {
  return NextResponse.json({ items: chats });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = (body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const chat: ChatSession = {
    id: randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
  chats.unshift(chat);
  return NextResponse.json(chat, { status: 201 });
}
