module.exports=[84423,(a,e,t)=>{e.exports=a.x("nodemailer-9c35dd349a8aaa9f",()=>require("nodemailer-9c35dd349a8aaa9f"))},59009,a=>{"use strict";async function e(a,e,t){a.userId=e.id,a.role=e.role,a.name=e.name,a.sv=e.sessionVersion,a.loginAt=t.toISOString(),await a.save()}a.s(["f",0,e])},8148,a=>{"use strict";let e=a=>a.replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a]);function t(a,t,n){return`<!doctype html><html lang="tr"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#059669;color:#ffffff;padding:16px 22px;font-size:18px;font-weight:700">Market Kasa \xb7 ${e(n)}</td></tr>
<tr><td style="padding:22px">
<h1 style="margin:0 0 14px;font-size:20px">${e(a)}</h1>
${t}
</td></tr>
<tr><td style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px">Bu e-posta Market Kasa programı tarafından otomatik g\xf6nderildi.</td></tr>
</table></td></tr></table></body></html>`}a.s(["O",0,function(a,n,l){let r=`Market Kasa onay kodu: ${l}`;return{subject:r,text:`Market Kasa onay kodu: ${l}

İşlem: ${n}
Kod 10 dakika ge\xe7erlidir ve tek kullanımlıktır.

Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.`,html:t("Onay kodunuz",`<p style="margin:0 0 10px">İşlem: <b>${e(n)}</b></p>
<div style="margin:18px 0;padding:16px;border-radius:12px;background:#ecfdf5;border:2px solid #34d399;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;font-family:Menlo,Consolas,monospace">${l}</div>
<p style="margin:0 0 8px">Bu kodu Market Kasa ekranındaki kutuya yazın. Kod <b>10 dakika</b> ge\xe7erlidir ve tek kullanımlıktır.</p>
<p style="margin:0;color:#b45309">Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.</p>`,a)}},"H",0,e,"F",0,t])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0no120xzi76xl._.js.map