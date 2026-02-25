import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST /api/reservations/trigger-sync
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.N8N_SYNC_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_SYNC_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "manual" }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `n8n webhook failed: ${res.status}`, detail: text },
        { status: 502 }
      );
    }

    const result = await res.json().catch(() => ({}));
    return NextResponse.json({ success: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: `webhook 호출 실패: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
