import { handleEnquiry, type EnquiryEnv } from '../../src/lib/enquiry';

// POST /api/enquiry — the website's enquiry form. Logic and docs live in
// src/lib/enquiry.ts; this route only hands it the request and secrets.
export function onRequestPost(context: { request: Request; env: EnquiryEnv }): Promise<Response> {
  return handleEnquiry(context.request, context.env);
}
