/** E-posta şablonları (sade, her e-posta programında düzgün görünen satır içi stiller). */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layout(title: string, bodyHtml: string, businessName: string): string {
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#059669;color:#ffffff;padding:16px 22px;font-size:18px;font-weight:700">Optiva · ${esc(businessName)}</td></tr>
<tr><td style="padding:22px">
<h1 style="margin:0 0 14px;font-size:20px">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px">Bu e-posta Optiva programı tarafından otomatik gönderildi.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Onay kodu e-postası. action: "Yönetici hesabı oluşturma" gibi, ne için istendiği. */
export function codeEmail(businessName: string, action: string, code: string): { subject: string; text: string; html: string } {
  const subject = `Optiva onay kodu: ${code}`;
  const text = [
    `Optiva onay kodu: ${code}`,
    "",
    `İşlem: ${action}`,
    "Kod 10 dakika geçerlidir ve tek kullanımlıktır.",
    "",
    "Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.",
  ].join("\n");
  const html = layout(
    "Onay kodunuz",
    `<p style="margin:0 0 10px">İşlem: <b>${esc(action)}</b></p>
<div style="margin:18px 0;padding:16px;border-radius:12px;background:#ecfdf5;border:2px solid #34d399;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;font-family:Menlo,Consolas,monospace">${code}</div>
<p style="margin:0 0 8px">Bu kodu Optiva ekranındaki kutuya yazın. Kod <b>10 dakika</b> geçerlidir ve tek kullanımlıktır.</p>
<p style="margin:0;color:#b45309">Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.</p>`,
    businessName,
  );
  return { subject, text, html };
}

export { esc };
