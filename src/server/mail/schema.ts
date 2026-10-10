import { parseInput, z } from "../validation/zod";
import { MAIL_PROVIDERS, type MailSettingsInput } from ".";

const providers = Object.keys(MAIL_PROVIDERS) as [keyof typeof MAIL_PROVIDERS, ...(keyof typeof MAIL_PROVIDERS)[]];

export const mailSettingsSchema = z.object({
  provider: z.enum(providers),
  user: z.string().trim().min(3, "E-posta adresini yazın.").max(120),
  pass: z.string().min(1, "Uygulama şifresini yazın.").max(200),
  host: z.string().trim().max(120).optional(),
  port: z.int().min(1).max(65535).optional(),
});

export function parseMailSettings(input: unknown): MailSettingsInput {
  return parseInput(mailSettingsSchema, input);
}
