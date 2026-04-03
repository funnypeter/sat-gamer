import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a parent
    const { data: profile } = await supabase
      .from("users")
      .select("role, family_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "parent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, action } = body as {
      requestId: string;
      action: "approved" | "denied";
    };

    if (!["approved", "denied"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Fetch the request
    const { data: redemptionRequest } = await supabase
      .from("redemption_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (!redemptionRequest) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      );
    }

    if (redemptionRequest.status !== "pending") {
      return NextResponse.json(
        { error: "Request already resolved" },
        { status: 400 }
      );
    }

    // Verify the student is in the parent's family
    const { data: student } = await supabase
      .from("users")
      .select("family_id")
      .eq("id", redemptionRequest.student_id)
      .single();

    if (!student || student.family_id !== profile.family_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the request
    await supabase
      .from("redemption_requests")
      .update({
        status: action,
        parent_id: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (action === "approved") {
      // Mark time balances as redeemed up to the requested amount
      let remainingToRedeem = Number(redemptionRequest.requested_minutes);

      const { data: balances } = await supabase
        .from("time_balances")
        .select("*")
        .eq("student_id", redemptionRequest.student_id)
        .eq("redeemed", false)
        .gt("expires_at", new Date().toISOString())
        .gt("minutes_remaining", 0)
        .order("expires_at", { ascending: true }); // Use oldest first

      if (balances) {
        for (const balance of balances) {
          if (remainingToRedeem <= 0) break;

          const available = Number(balance.minutes_remaining);
          if (available <= remainingToRedeem) {
            // Use entire balance
            await supabase
              .from("time_balances")
              .update({ minutes_remaining: 0, redeemed: true })
              .eq("id", balance.id);
            remainingToRedeem -= available;
          } else {
            // Partial use
            await supabase
              .from("time_balances")
              .update({
                minutes_remaining: available - remainingToRedeem,
              })
              .eq("id", balance.id);
            remainingToRedeem = 0;
          }
        }
      }
    }

    // Notify the student
    await supabase.from("notifications").insert({
      user_id: redemptionRequest.student_id,
      type: "redemption_resolved",
      title:
        action === "approved"
          ? "Request Approved!"
          : "Request Denied",
      message:
        action === "approved"
          ? `Your request for ${redemptionRequest.requested_minutes} minutes has been approved. Enjoy your gaming time!`
          : `Your request for ${redemptionRequest.requested_minutes} minutes was denied.`,
      data: { requestId, action },
    });

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error("Redemption resolve error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
