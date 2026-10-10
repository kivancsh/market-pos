module.exports=[6928,(e,t,a)=>{t.exports=e.x("exceljs-9798f6f4656d3162",()=>require("exceljs-9798f6f4656d3162"))},84423,(e,t,a)=>{t.exports=e.x("nodemailer-9c35dd349a8aaa9f",()=>require("nodemailer-9c35dd349a8aaa9f"))},8148,e=>{"use strict";let t=e=>e.replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);function a(e,a,r){return`<!doctype html><html lang="tr"><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#059669;color:#ffffff;padding:16px 22px;font-size:18px;font-weight:700">Market Kasa \xb7 ${t(r)}</td></tr>
<tr><td style="padding:22px">
<h1 style="margin:0 0 14px;font-size:20px">${t(e)}</h1>
${a}
</td></tr>
<tr><td style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px">Bu e-posta Market Kasa programı tarafından otomatik g\xf6nderildi.</td></tr>
</table></td></tr></table></body></html>`}e.s(["O",0,function(e,r,i){let d=`Market Kasa onay kodu: ${i}`;return{subject:d,text:`Market Kasa onay kodu: ${i}

İşlem: ${r}
Kod 10 dakika ge\xe7erlidir ve tek kullanımlıktır.

Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.`,html:a("Onay kodunuz",`<p style="margin:0 0 10px">İşlem: <b>${t(r)}</b></p>
<div style="margin:18px 0;padding:16px;border-radius:12px;background:#ecfdf5;border:2px solid #34d399;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;font-family:Menlo,Consolas,monospace">${i}</div>
<p style="margin:0 0 8px">Bu kodu Market Kasa ekranındaki kutuya yazın. Kod <b>10 dakika</b> ge\xe7erlidir ve tek kullanımlıktır.</p>
<p style="margin:0;color:#b45309">Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın ve kodu kimseyle paylaşmayın.</p>`,e)}},"H",0,t,"F",0,a])},68347,e=>{"use strict";var t=e.i(2157),a=e.i(50227);function r(){return process.env.BACKUP_DIR?a.default.resolve(process.cwd(),process.env.BACKUP_DIR):a.default.join(process.cwd(),"backups")}let i=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});async function d(e,n,l=r()){let o;t.default.mkdirSync(l,{recursive:!0});let s=`store-${(o=Object.fromEntries(i.formatToParts(n).map(e=>[e.type,e.value])),`${o.year}${o.month}${o.day}-${o.hour}${o.minute}`)}`,p=a.default.join(l,`${s}.db`);for(let e=2;t.default.existsSync(p);e++)p=a.default.join(l,`${s}-${e}.db`);return await e.backup(p),p}e.s(["B",0,d,"e",0,function(e=r()){return t.default.existsSync(e)?t.default.readdirSync(e).filter(e=>e.endsWith(".db")).map(r=>{let i=t.default.statSync(a.default.join(e,r));return{name:r,sizeBytes:i.size,modifiedAt:i.mtime.toISOString()}}).sort((e,t)=>t.modifiedAt.localeCompare(e.modifiedAt)):[]}])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0150ag1_7gp34._.js.map