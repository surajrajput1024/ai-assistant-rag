import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { suggestedQuestions } from "./store";

export async function GET() {
  return NextResponse.json({ items: suggestedQuestions });
}

export async function POST(request: Request) {
  const body = await request.json();
  const text = (body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const item = { id: randomUUID(), text };
  suggestedQuestions.unshift(item);
  return NextResponse.json(item, { status: 201 });
}
