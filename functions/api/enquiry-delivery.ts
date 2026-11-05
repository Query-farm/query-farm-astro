import { handleEnquiryWebhook, type EnquiryWebhookEnv } from '../../src/lib/enquiry-webhook';

export function onRequestPost(context: { request: Request; env: EnquiryWebhookEnv }): Promise<Response> {
  return handleEnquiryWebhook(context.request, context.env);
}
