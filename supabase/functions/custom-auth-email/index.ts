// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Create admin client with service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface AuthEmailRequest {
  action: "signup" | "recovery" | "resend_verification";
  email: string;
  password?: string;
  tos_version?: string;
  privacy_version?: string;
  user_agent?: string;
}

// Logo URL from Supabase Storage (publicly accessible)
const LOGO_URL = "https://detxhoqiarohjevedmxh.supabase.co/storage/v1/object/public/email-assets/logo.png";

// Email templates
const getSignupEmailHtml = (verifyLink: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your InsiderPulse Account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020817; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 16px;">
        <table role="presentation" style="max-width: 560px; width: 100%; margin: 0 auto; border-collapse: collapse; background-color: #020817; border: 1px solid rgba(6,182,212,0.15); border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0F1729; padding: 36px 32px; text-align: center; border-bottom: 1px solid rgba(6,182,212,0.2);">
              <img src="${LOGO_URL}" width="200" style="display: block; margin: 0 auto;" alt="InsiderPulse" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px; background-color: #020817;">
              <h2 style="color: #F1F5F9; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Verify Your Email</h2>
              <p style="color: #94A3B8; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
                Welcome to InsiderPulse! Click the button below to verify your email address and activate your account.
              </p>
              <div style="text-align: center; margin: 8px 0 28px 0;">
                <a href="${verifyLink}" target="_blank" rel="noopener" style="display: inline-block; background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%); color: #ffffff; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; letter-spacing: 0.3px;">
                  Verify Email Address
                </a>
              </div>
              <p style="color: #64748B; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                Having trouble with the button? <a href="${verifyLink}" target="_blank" rel="noopener" style="color: #06B6D4; text-decoration: none;">Click here to verify your email</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0F1729; border-top: 1px solid rgba(255,255,255,0.06); padding: 24px 32px; text-align: center; color: #475569; font-size: 12px; line-height: 1.7;">
              <p style="margin: 0 0 6px 0;">InsiderPulse | <a href="mailto:support@insiderpulse.org" style="color: #475569; text-decoration: none;">support@insiderpulse.org</a></p>
              <p style="margin: 0 0 6px 0;">If you didn't create an account with InsiderPulse, you can safely ignore this email.</p>
              <p style="margin: 0;">© ${new Date().getFullYear()} InsiderPulse. All rights reserved.</p>
              <p style="color: #64748b; font-size: 12px; margin-top: 16px; text-align: center;">
                <a href="https://insiderpulse.org/privacy" style="color: #06B6D4; text-decoration: none;">Privacy Policy</a>
                &nbsp;·&nbsp;
                <a href="https://insiderpulse.org/terms" style="color: #06B6D4; text-decoration: none;">Terms of Service</a>
                &nbsp;·&nbsp;
                <a href="https://insiderpulse.org/help" style="color: #06B6D4; text-decoration: none;">Help</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getRecoveryEmailHtml = (resetLink: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your InsiderPulse Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020817; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 16px;">
        <table role="presentation" style="max-width: 560px; width: 100%; margin: 0 auto; border-collapse: collapse; background-color: #020817; border: 1px solid rgba(6,182,212,0.15); border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0F1729; padding: 36px 32px; text-align: center; border-bottom: 1px solid rgba(6,182,212,0.2);">
              <img src="${LOGO_URL}" width="200" style="display: block; margin: 0 auto;" alt="InsiderPulse" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px; background-color: #020817;">
              <h2 style="color: #F1F5F9; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Reset Your Password</h2>
              <p style="color: #94A3B8; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
                We received a request to reset your password. Click the button below to choose a new password.
              </p>
              <div style="text-align: center; margin: 8px 0 28px 0;">
                <a href="${resetLink}" target="_blank" rel="noopener" style="display: inline-block; background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%); color: #ffffff; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; letter-spacing: 0.3px;">
                  Reset Password
                </a>
              </div>
              <div style="background-color: #0F1729; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 16px 20px; color: #64748B; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
                <strong style="color: #94A3B8;">Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
              </div>
              <p style="color: #64748B; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                Having trouble with the button? <a href="${resetLink}" target="_blank" rel="noopener" style="color: #06B6D4; text-decoration: none;">Click here to reset your password</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0F1729; border-top: 1px solid rgba(255,255,255,0.06); padding: 24px 32px; text-align: center; color: #475569; font-size: 12px; line-height: 1.7;">
              <p style="margin: 0 0 6px 0;">InsiderPulse | <a href="mailto:support@insiderpulse.org" style="color: #475569; text-decoration: none;">support@insiderpulse.org</a></p>
              <p style="margin: 0;">© ${new Date().getFullYear()} InsiderPulse. All rights reserved.</p>
              <p style="color: #64748b; font-size: 12px; margin-top: 16px; text-align: center;">
                <a href="https://insiderpulse.org/privacy" style="color: #06B6D4; text-decoration: none;">Privacy Policy</a>
                &nbsp;·&nbsp;
                <a href="https://insiderpulse.org/terms" style="color: #06B6D4; text-decoration: none;">Terms of Service</a>
                &nbsp;·&nbsp;
                <a href="https://insiderpulse.org/help" style="color: #06B6D4; text-decoration: none;">Help</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Send email via Brevo
async function sendViaBrevo(to: string, subject: string, htmlContent: string): Promise<void> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: {
        name: Deno.env.get('EMAIL_SENDER_NAME') || "InsiderPulse",
        email: Deno.env.get('EMAIL_SENDER_ADDRESS') || "support@insiderpulse.org",
      },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Brevo API error:", errorText);
    throw new Error(`Failed to send email: ${response.status} ${errorText}`);
  }

  console.log("Email sent successfully via Brevo to: [redacted]");
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is not configured");
    }

    const { action, email, password, tos_version, privacy_version, user_agent }: AuthEmailRequest = await req.json();

    console.log(`Processing ${action} request`); // email redacted from logs

    if (action === "signup") {
      if (!password) {
        throw new Error("Password is required for signup");
      }

      if (!tos_version || !privacy_version) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required policy versions for signup.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Capture caller IP from proxy/CDN headers (best-effort).
      const ipAddress =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        null;

      // 1. Create user WITHOUT auto-confirm (email_confirm: false)
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // CRITICAL: User must click link to verify
      });

      if (createError) {
        console.error("Create user error:", createError);
        // Handle "already registered" case - return 200 so frontend can handle gracefully
        if (createError.message.includes("already been registered") || createError.message.includes("already exists")) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "This email is already registered. Please sign in instead.",
              code: "EMAIL_EXISTS"
            }),
            {
              status: 200, // Return 200 so supabase.functions.invoke() parses the body correctly
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        throw createError;
      }

      const newUserId = userData.user?.id;
      console.log("User created with id:", newUserId);

      // 2. Record policy acceptance. Prefer failing signup over an
      // orphaned account with no enforceable contract.
      if (!newUserId) {
        throw new Error("Auth user created but no id returned");
      }

      const { error: acceptanceError } = await supabaseAdmin
        .from("user_policy_acceptances")
        .insert({
          user_id: newUserId,
          tos_version,
          privacy_version,
          ip_address: ipAddress,
          user_agent: user_agent ?? null,
        });

      if (acceptanceError) {
        console.error("Policy acceptance insert failed:", {
          user_id: newUserId,
          error: acceptanceError.message,
        });
        try {
          await supabaseAdmin.auth.admin.deleteUser(newUserId);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Signup failed, please try again.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (cleanupError: any) {
          console.error("CRITICAL: orphaned account created with no acceptance:", {
            user_id: newUserId,
            cleanup_error: cleanupError?.message,
          });
          return new Response(
            JSON.stringify({
              success: false,
              error: "Signup failed, please contact support.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
      }

      console.log("Policy acceptance recorded:", {
        user_id: newUserId,
        tos_version,
        privacy_version,
        has_ip: !!ipAddress,
      });

      // 3. Generate official Supabase verification link
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password, // Required for signup type
        options: {
          redirectTo: "https://insiderpulse.org/auth",
        },
      });

      if (linkError) {
        console.error("Generate link error:", linkError);
        throw linkError;
      }

      const actionLink = linkData.properties.action_link;
      console.log("Generated verification link for: [redacted]"); // don't log email in plaintext

      // 4. Send branded email via Brevo
      await sendViaBrevo(
        email,
        "Verify your InsiderPulse account",
        getSignupEmailHtml(actionLink)
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Verification email sent. Please check your inbox." 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (action === "recovery") {
      // 1. Generate official Supabase recovery link
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: "https://insiderpulse.org/reset-password",
        },
      });

      if (linkError) {
        console.error("Generate recovery link error:", linkError);
        // Don't reveal if email exists or not for security
        // Still return success to prevent email enumeration
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "If an account exists with this email, a reset link has been sent." 
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      const actionLink = linkData.properties.action_link;
      console.log("Generated recovery link for: [redacted]");

      // 2. Send branded email via Brevo
      await sendViaBrevo(
        email,
        "Reset your InsiderPulse password",
        getRecoveryEmailHtml(actionLink)
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Password reset email sent. Please check your inbox." 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (action === "resend_verification") {
      // For resend, we need to use magiclink type since the user already exists
      // and we don't have the password
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: "https://insiderpulse.org/auth",
        },
      });

      if (linkError) {
        console.error("Generate resend link error:", linkError);
        throw new Error("Could not generate verification link. The account may already be verified.");
      }

      const actionLink = linkData.properties.action_link;
      console.log("Generated resend verification link for: [redacted]");

      await sendViaBrevo(
        email,
        "Verify your InsiderPulse account",
        getSignupEmailHtml(actionLink)
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Verification email resent. Please check your inbox." 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: any) {
    console.error("Error in custom-auth-email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
