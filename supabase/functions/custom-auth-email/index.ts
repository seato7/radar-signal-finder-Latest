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
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #1a1a1a; border-radius: 12px; overflow: hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);">
              <a href="https://insiderpulse.org" target="_blank" rel="noopener" style="display: block; width: 360px; height: 240px; margin: 0 auto 16px; text-decoration: none;"><img src="${LOGO_URL}" alt="InsiderPulse" width="360" height="240" style="width: 360px; height: 240px; display: block; object-fit: contain; border: 0;"></a>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">InsiderPulse</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Market Intelligence Platform</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #ffffff; font-size: 22px; font-weight: 600;">Verify Your Email</h2>
              <p style="margin: 0 0 30px; color: #a1a1a1; font-size: 16px; line-height: 1.6;">
                Welcome to InsiderPulse! Click the button below to verify your email address and activate your account.
              </p>
              
              <!-- Table-based button for better email client compatibility -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);">
                    <a href="${verifyLink}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                If you didn't create an account with InsiderPulse, you can safely ignore this email.
              </p>
              
              <p style="margin: 20px 0 0; color: #666666; font-size: 12px; line-height: 1.6;">
                Having trouble with the button? <a href="${verifyLink}" target="_blank" rel="noopener" style="color: #3b82f6;">Click here to verify your email</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #0f0f0f; border-top: 1px solid #2a2a2a;">
              <p style="margin: 0; color: #666666; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} InsiderPulse. All rights reserved.<br>
                <a href="https://insiderpulse.org" style="color: #3b82f6; text-decoration: none;">insiderpulse.org</a>
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
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #1a1a1a; border-radius: 12px; overflow: hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);">
              <a href="https://insiderpulse.org" target="_blank" rel="noopener" style="display: block; width: 360px; height: 240px; margin: 0 auto 16px; text-decoration: none;"><img src="${LOGO_URL}" alt="InsiderPulse" width="360" height="240" style="width: 360px; height: 240px; display: block; object-fit: contain; border: 0;"></a>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">InsiderPulse</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Password Reset Request</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #ffffff; font-size: 22px; font-weight: 600;">Reset Your Password</h2>
              <p style="margin: 0 0 30px; color: #a1a1a1; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to choose a new password.
              </p>
              
              <!-- Table-based button for better email client compatibility -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);">
                    <a href="${resetLink}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <div style="margin: 30px 0 0; padding: 16px; background-color: #2a2a2a; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #a1a1a1; font-size: 14px; line-height: 1.6;">
                  <strong style="color: #f59e0b;">Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                </p>
              </div>
              
              <p style="margin: 20px 0 0; color: #666666; font-size: 12px; line-height: 1.6;">
                Having trouble with the button? <a href="${resetLink}" target="_blank" rel="noopener" style="color: #f59e0b;">Click here to reset your password</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #0f0f0f; border-top: 1px solid #2a2a2a;">
              <p style="margin: 0; color: #666666; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} InsiderPulse. All rights reserved.<br>
                <a href="https://insiderpulse.org" style="color: #3b82f6; text-decoration: none;">insiderpulse.org</a>
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
async function sendViaBravo(to: string, subject: string, htmlContent: string): Promise<void> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: {
        name: "InsiderPulse",
        email: "support@insiderpulse.org",
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

  console.log("Email sent successfully via Brevo to:", to);
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

    const { action, email, password }: AuthEmailRequest = await req.json();

    console.log(`Processing ${action} request for email: ${email}`);

    if (action === "signup") {
      if (!password) {
        throw new Error("Password is required for signup");
      }

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
              status: 409, // 409 Conflict - frontend can distinguish from success
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
        throw createError;
      }

      console.log("User created with id:", userData.user?.id);

      // 2. Generate official Supabase verification link
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

      // 3. Send branded email via Brevo
      await sendViaBravo(
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
      console.log("Generated recovery link for:", email);

      // 2. Send branded email via Brevo
      await sendViaBravo(
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
      console.log("Generated resend verification link for:", email);

      await sendViaBravo(
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
