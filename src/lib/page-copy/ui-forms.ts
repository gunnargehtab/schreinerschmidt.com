// The slice of src/content/pages/ui.yaml that forms and thank-you pages use (the file is shared;
// other pages parse their own slice).
import { z } from 'astro/zod';

export const uiFormsSchema = z.object({
  links: z.object({ home: z.string(), configurator: z.string() }),
  rating: z.object({ profileLink: z.string() }),
  demoBanner: z.object({ legalPending: z.string() }),
  form: z.object({
    demoNotice: z.string(),
    demoSuccess: z.string(),
    sending: z.string(),
    errorSummaryTitle: z.string(),
  }),
});

export type UiFormsCopy = z.infer<typeof uiFormsSchema>;
