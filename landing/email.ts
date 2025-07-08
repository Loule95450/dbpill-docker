import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// AWS region defaults to us-east-1 but can be overridden via the AWS_REGION env var
const sesRegion = process.env.AWS_REGION || "us-east-1";
const sesClient = new SESClient({ region: sesRegion });

/**
 * Send an email using AWS SES.
 *
 * The email is sent from help@dbpill.com which must be a verified identity
 * in the configured AWS SES account.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  const params = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        Text: {
          Data: body,
        },
      },
      Subject: {
        Data: subject,
      },
    },
    Source: "help@dbpill.com",
  } as const;
  try {
    await sesClient.send(new SendEmailCommand({
      ...params,
      Destination: {
        ToAddresses: [...params.Destination.ToAddresses],
      },
    }));
    console.log(`[SES] Email sent to ${to}`);
  } catch (err) {
    console.error("[SES] Failed to send email", err);
    throw err;
  }
} 