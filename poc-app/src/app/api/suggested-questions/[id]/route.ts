import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { suggestedQuestions } from "../store";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idx = suggestedQuestions.findIndex((q) => q.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  suggestedQuestions.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json();
  const text = (body?.text ?? "").trim();
  const { id } = await params;
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  suggestedQuestions.unshift({ id: id || randomUUID(), text });
  return NextResponse.json({ ok: true }, { status: 201 });
}
