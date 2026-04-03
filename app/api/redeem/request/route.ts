import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { requestedMinutes, activityDescription } = body as {
      requestedMinutes: number;
      activityDescription: string;
    };

    if (!requestedMinutes || requestedMinutes <= 0) {
      return NextResponse.json(
        { error: "Invalid minutes requested" },
        { status: 400 }
      );
    }

    // Verify the student has enough balance
    const { data: balances } = await supabase
      .from("time_balances")
      .select("minutes_remaining")
      .eq("student_id", user.id)
      .eq("redeemed", false)
      .gt("expires_at", new Date().toISOString())
      .gt("minutes_remaining", 0);

    const totalAvailable =
      balances?.reduce((sum, b) => sum + Number(b.minutes_remaining), 0) ?? 0;

    if (requestedMinutes > totalAvailable) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You have ${totalAvailable} minutes available.`,
        },
        { status: 400 }
      );
    }

    // Create the redemption request
    const { data: redemptionRequest, error } = await supabase
      .from("redemption_requests")
      .insert({
        student_id: user.id,
        requested_minutes: requestedMinutes,
        activity_description: activityDescription || "Gaming time",
        status: "pending",
      })
      .select()
      .single();

    if (error || !redemptionRequest) {
      return NextResponse.json(
        { error: "Failed to create request" },
        { status: 500 }
      );
    }

    // Notify parent(s)
    const { data: profile } = await supabase
      .from("users")
      .select("family_id, display_name")
      .eq("id", user.id)
      .single();

    if (profile) {
      const { data: parents } = await supabase
        .from("users")
        .select("id")
        .eq("family_id", profile.family_id)
        .eq("role", "parent");

      if (parents) {
        const notifications = parents.map((parent) => ({
          user_id: parent.id,
          type: "redemption_request",
          title: "New Redemption Request",
          message: `${profile.display_name} wants to redeem ${requestedMinutes} minutes for: ${activityDescription || "Gaming time"}`,
          data: { requestId: redemptionRequest.id },
        }));

        await supabase.from("notifications").insert(notifications);
      }
    }

    return NextResponse.json({
      success: true,
      requestId: redemptionRequest.id,
    });
  } catch (err) {
    console.error("Redemption request error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
